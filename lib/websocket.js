const { EventEmitter } = require("events");
const { randomBytes } = require("crypto");
const http = require("http");

const kAborted = Symbol("kAborted");
const { GUID } = require("./constant");
const readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
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

    if (address !== null) {
      initAsClient(this, address);
    }
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
  opts.path = parsedUrl.pathName + parsedUrl.search;

  if (opts.origin) {
    if (opts.protocolVersion < 13) {
      opts.headers["Sec-WebSocket-Origin"] = opts.origin;
    } else {
      opts.headers["Origin"] = opts.origin;
    }
  }

  let req;
  req = websocket._req = request(opts);
  req.end();

  req.on("error", (err) => {
    if (req === null || req[kAborted]) return;
    req = websocket._req = null;
  });
}
