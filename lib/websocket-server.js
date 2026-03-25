const { EventEmitter } = require("events");
const http = require("http");
const { Duplex } = require("stream");

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
    // Do something
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
