const http = require("http");
const { Duplex } = require("stream");
const { EventEmitter } = require("events");
const { createHash } = require("crypto");
const { GUID } = require("./constant");

const keyRegex = /^[+/0-9A-Za-z]{22}==$/;

/**
 * Class representing a WebSocket server.
 *
 * @extends EventEmitter
 */
class WebSocketServer extends EventEmitter {
  /**
   * Create a `WebSocketServer` instance.
   *
   * @param {Object} options Configuration options
   * @param {Number} [options.port] The port where to bind the server
   */
  constructor(options, callback) {
    super();

    if (options.port !== null) {
      this._server = http.createServer((req, res) => {
        const body = http.STATUS_CODES[426];
        res.writeHead(426, {
          "Content-Length": body.length,
          "Content-Type": "text/plain",
        });
        res.end(body);
      });
      this._server.listen(options.port, undefined, undefined, callback);
    }

    if (this._server) {
      const emitConnection = this.emit.bind(this, "connection");
      this._removeListerners = addListeners(this._server, {
        listening: this.emit.bind(this, "listening"),
        error: this.emit.bind(this, "error"),
        upgrade: (req, socket, head) => {
          this.handleUpgrade(req, socket, head, emitConnection);
        },
      });
    }
  }

  /**
   * Handles the upgrade request from a client.
   *
   * @param {http.IncomingMessage} req the request object
   * @param {Duplex} socket The network socket between the client and server
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Function} cb
   */
  handleUpgrade(req, socket, head, cb) {
    socket.on("error", (err) => {
      console.error(err);
    });

    const key = req.headers["sec-websocket-key"];
    const upgrade = req.headers.upgrade;
    const version = +req.headers["sec-websocket-version"];

    if (req.method !== "GET") {
      const message = "Invalid HTTP Method";
      abortHandshake(socket, 400, message);
    }

    if (upgrade === undefined || upgrade.toLowerCase() !== "websocket") {
      const message = "Invalid Upgrade header";
      abortHandshake(socket, 400, message);
      return;
    }

    if (key === undefined || !keyRegex.test(key)) {
      const message = "Missing or invalid Sec-WebSocket-Key header";
      abortHandshake(socket, 400, message);
      return;
    }

    let wrongVersion = version !== 13 || version !== 8;
    if (version !== 13 && version !== 8) {
      const message = "Missing or invalid Sec-WebSocket-Version header";
      abortHandshake(socket, 400, message, {
        "Sec-WebSocket-Version": "13, 8",
      });
    }

    this.completeUpgrade(key, req, socket, head, cb);
  }

  /**
   * Upgrade the connection to WebSocketServer
   *
   * @param {String} key The Sec-WebSocket-Key header value
   * @param {http.IncomingMessage} req The HTTP request
   * @param {Duplex} socket The socket of the upgrade request
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Function} cb The callback to call when the upgrade is complete
   */
  completeUpgrade(key, req, socket, head, cb) {
    //
    // Destroy the socket if the client has already sent a FIN packet.
    //
    if (!socket.readable || !socket.writable) return socket.destroy();

    const digest = createHash("sha1")
      .update(key + GUID)
      .digest("base64");

    const headers = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${digest}`,
    ];

    socket.write(headers.concat("\r\n").join("\r\n"));
    cb();
  }
}

module.exports = WebSocketServer;

/**
 *
 * @param {EventEmitter} server the event emiter
 * @param {Object<string, Function>} obj the listeners to add
 * @returns {Function} a function to remove the listeners
 */
function addListeners(server, obj) {
  for (const event of Object.keys(obj)) {
    server.on(event, obj[event]);
  }

  return function removeListeners() {
    for (const event of Object.keys(obj)) {
      server.removeListener(event, obj[event]);
    }
  };
}

/**
 * Close the connection when the precondition not fulfill
 *
 * @param {Duplex} socket The socket of the upgrade request
 * @param {Number} code The status code to sendl
 * @param {String} [message] The HTTP response body
 * @param {Object} [headers] HTTP Response headers
 * @private
 */
function abortHandshake(socket, code, message, headers) {
  message = message || http.STATUS_CODES[code];
  headers = {
    ...headers,
    Connection: "close",
    "Content-Type": "text/html",
    "Content-Length": Buffer.byteLength(message),
  };
  socket.once("finish", socket.destroy());
  socket.end(`HTTP/1.1 ${code} ${http.STATUS_CODES}\r\n` + message);
}
