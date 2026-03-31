const { EventEmitter } = require("events");
const { randomBytes, createHash } = require("crypto");
const { Socket } = require("net");
const http = require("http");

const { GUID, kWebSocket, EMPTY_BUFFER } = require("./constant");
const Receiver = require("./receiver");
const Sender = require("./sender");

const protocolVersions = [8, 13];
const readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
const kAborted = Symbol("kAborted");

/**
 * Class representing a WebSocket.
 *
 * @extends EventEmitter
 */
class WebSocket extends EventEmitter {
  /**
   * Create a new WebSocket
   *
   * @param {String|URL} address the URL to connect
   */
  constructor(address) {
    super();

    this._isServer = false;
    this._readyState = WebSocket.CONNECTING;
    this._receiver = null;
    this._sender = null;
    this._socket = null;

    if (address !== null) {
      this._isServer = false;
      initAsClient(this, address);
    } else {
      this._isServer = true;
    }
  }

  /**
   * @type {Number}
   */
  get readyState() {
    return this._readyState;
  }

  /**
   * Set up the socket and internal resources
   *
   * @param {Duplex} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Object} options The options param
   * @param {Number} [options.maxPayload=0] The maximum payload message size
   */
  setSocket(socket, head, options) {
    const receiver = new Receiver({
      maxPayload: options?.maxPayload,
      isServer: this._isServer,
    });
    const sender = new Sender(socket);

    this._receiver = receiver;
    this._sender = sender;
    this._socket = socket;

    receiver[kWebSocket] = this;
    sender[kWebSocket] = this;
    socket[kWebSocket] = this;

    if (head.length > 0) socket.unshift(head);

    socket.on("data", socketOnData);

    this._readyState = WebSocket.OPEN;
    this.emit("open");
  }

  /**
   * Send a data message
   *
   * @param {*} data The message to send
   */
  send(data) {
    if (this.readyState === WebSocket.CONNECTING) {
      throw new Error("WebSocket is not open: readyState is CONNECTING");
    }

    if (typeof data === "number") data = data.toString();

    // TODO: Handle data transfered after close
    // Coding here

    const options = {
      binary: typeof data !== "string",
      mask: !this._isServer,
      fin: true,
    };
    this._sender.send(data || EMPTY_BUFFER, options);
  }
}

module.exports = WebSocket;

/**
 * @constant {Number} CONNECTING
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, "CONNECTING", {
  enumerable: true,
  value: readyStates.indexOf("CONNECTING"),
});

/**
 * @constant {Number} OPEN
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, "OPEN", {
  enumerable: true,
  value: readyStates.indexOf("OPEN"),
});

/**
 * @constant {Number} CLOSING
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, "CLOSING", {
  enumerable: true,
  value: readyStates.indexOf("CLOSING"),
});

/**
 * @constant {Number} CLOSED
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, "CLOSED", {
  enumerable: true,
  value: readyStates.indexOf("CLOSED"),
});

/**
 * Initialize the websocket client
 *
 * @param {WebSocket} websocket The client initialization
 * @param {String|URL} address The URL that connecting
 * @private
 */
function initAsClient(websocket, address) {
  const opts = {
    protocolVersion: protocolVersions[1],
    socketPath: undefined,
    hostname: undefined,
    protocol: undefined,
    timeout: undefined,
    method: "GET",
    host: undefined,
    path: undefined,
    port: undefined,
  };

  const request = http.request;
  let parsedUrl;

  if (address instanceof URL) {
    parsedUrl = address;
  } else {
    try {
      parsedUrl = new URL(address);
    } catch {
      throw new SyntaxError(`Invalid URL: ${address}`);
    }
  }

  if (parsedUrl.protocol === "http:") {
    parsedUrl.protocol = "ws:";
  }
  if (parsedUrl.protocol === "https:") {
    parsedUrl.protocol = "wss:";
  }

  websocket._url = parsedUrl.href;

  const isSecure = parsedUrl.protocol === "wss";
  const key = randomBytes(16).toString("base64");

  const defaultPort = isSecure ? 443 : 80;
  opts.defaultPort = opts.defaultPort || defaultPort;
  opts.port = parsedUrl.port || defaultPort;
  opts.host = parsedUrl.hostname.startsWith("[")
    ? parsedUrl.hostname.slice(1, -1)
    : parsedUrl.hostname;

  opts.headers = {
    Connection: "Upgrade",
    "Sec-WebSocket-Key": key,
    "Sec-WebSocket-Version": opts.protocolVersion,
    Upgrade: "websocket",
  };
  opts.path = parsedUrl.pathname + parsedUrl.search;

  if (opts.origin) {
    if (opts.protocolVersion < 13) {
      opts.headers["Sec-WebSocket-Origin"] = opts.origin;
    } else {
      opts.headers["Origin"] = opts.origin;
    }
  }

  let req;

  req = websocket._req = request(opts);
  req.on("error", (err) => {
    if (req === null || req[kAborted]) return;
    req = websocket._req = null;
  });

  req.on("response", (res) => {
    console.log("Response");
  });

  req.on("upgrade", (res, socket, head) => {
    websocket.emit("upgrade", res);

    // The user may have closed the connection before connect
    if (websocket.readyState !== WebSocket.CONNECTING) return;

    const upgrade = res.headers["upgrade"];
    if (upgrade === undefined || upgrade.toLowerCase() !== "websocket") {
      abortHandshake(websocket, socket, "Invalid Upgrade header");
    }

    const connection = res.headers["connection"];
    if (connection === undefined || connection.toLowerCase() !== "upgrade") {
      abortHandshake(websocket, socket, "Invalid Connection header");
    }

    const digest = createHash("sha1")
      .update(key + GUID)
      .digest("base64");

    if (res.headers["sec-websocket-accept"] !== digest) {
      abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
    }

    console.log("Upgrade successfuly");
    websocket.setSocket(socket, head);
  });

  req.end();
}

/**
 * Abort handshake and emit error
 *
 * @param {WebSocket} websocket The web socket instance
 * @param {http.ClientRequest|Socket} stream the requestto abort or socket to destroy
 * @param {String} message the error message
 * @private
 */
function abortHandshake(websocket, stream, message) {
  websocket.readyStates = WebSocket.CLOSING;

  stream.destroy();
  websocket.emit("error", new Error(message));
  websocket.emit("close");
}

/**
 * Callback for socket "data" event
 *
 * @param {Buffer} chunk The data chunk
 */
function socketOnData(chunk) {
  console.log("chunk: ", chunk);
}
