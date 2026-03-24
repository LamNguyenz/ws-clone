const { EventEmitter } = require("events");
const http = require("http");

const { GUID } = require("./constant");
const protocolVersions = [8, 13];

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
  }
}

module.exports = WebSocket;

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

  websocket._url = parsedUrl.href;
  const key = randomBytes(16).toString("base64");

  // GET /chat HTTP/1.1
  // Host: server.example.com
  // Upgrade: websocket
  // Connection: Upgrade
  // Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
  // Origin: http://example.com
  // Sec-WebSocket-Protocol: chat, superchat
  // Sec-WebSocket-Version: 13
  opts.headers = {
    Connection: "Upgrade",
    "Sec-WebSocket-Key": key,
    "Sec-WebSocket-Version": opts.protocolVersion,
    Upgrade: "websocket",
  };
}
