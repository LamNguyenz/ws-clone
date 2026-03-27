const { EventEmitter } = require("events");
const { randomBytes } = require("crypto");
const { Socket } = require("net");
const http = require("http");

const { GUID } = require("./constant");

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

    if (address !== null) {
      initAsClient(this, address);
    }
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
    if (websocket.readyStates !== WebSocket.CONNECTING) return;

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
  });

  req.end();
}

/**
 * Abort handshake and emit error
 *
 * @param {WebSocket} websocket The web socket instance
 * @param {http.ClientRequest|Socket} stream the requestto abort or socket to destroy
 * @param {String} message the error message
 */
function abortHandshake(websocket, stream, message) {
  websocket.readyStates = WebSocket.CLOSING;

  stream.destroy();
  websocket.emit("error", new Error(message));
  websocket.emit("close");
}
