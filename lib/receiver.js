const { Writable } = require("node:stream");

const { kStatusCode, EMPTY_BUFFER } = require("./constant");
const { concat, unmask } = require("./buffer-util");

const FastBuffer = Buffer[Symbol.species];

const GET_INFO = 0;
const GET_PAYLOAD_LENGTH_16 = 1;
const GET_PAYLOAD_LENGTH_64 = 2;
const GET_MASK = 3;
const GET_DATA = 4;
const INFLATING = 5;
const DEFER_EVENT = 6;

/**
 * HyBi Receiver implementation.
 *
 * @extends Writable
 */
class Receiver extends Writable {
  /**
   * Constructor for Receiver instsance
   *
   * @param {Object} options Options for the receiver
   */
  constructor(options = {}) {
    super();

    this._isServer = !!options.isServer;

    this._bufferedBytes = 0;
    this._buffers = [];
    this._fragments = [];

    this._mask = undefined;
    this._opcode = 0;
    this._fin = false;
    this._masked = false;
    this._opcode = 0;

    this._totalPayloadLength = 0;
    this._messageLength = 0;

    this._loop = false;
    this._state = GET_INFO;
    this._errored = false;
  }

  /**
   * Implement the `Wriable.prototype._write()`
   *
   * @param {Buffer} chunk The chunk of the dsata to write
   * @param {String} encoding The character encoding of chunkf
   * @param {Function} cb
   */
  _write(chunk, encoding, cb) {
    if (this._opcode === 0x08 && this._state === GET_INFO) return cb();

    this._bufferedBytes += chunk.length;
    this._buffers.push(chunk);
    this.startLoop(cb);
  }

  /**
   * Start the parsing loop
   *
   * @param {Function} cb The callback
   */
  startLoop(cb) {
    this._loop = true;

    do {
      switch (this._state) {
        case GET_INFO:
          this.getInfo(cb);
          break;
        case GET_MASK:
          this.getMask();
          break;
        case GET_DATA:
          this.getData(cb);
          break;
        case INFLATING:
        case DEFER_EVENT:
          this._loop = false;
          break;
      }
    } while (this._loop);
  }

  /**
   * Read the first two bytes of the frame
   *
   * @param {Function} cb
   */
  getInfo(cb) {
    if (this._bufferedBytes < 2) {
      this._loop = false;
      return;
    }
    const buf = this.consume(2);

    this._fin = (buf[0] & 0x80) === 0x80;
    this._opcode = buf[0] & 0x0f;
    this._payloadLength = buf[1] & 0x7f;
    this._masked = (buf[1] & 0x80) === 0x80;

    if (this._isServer) {
      if (!this._masked) {
        const error = this.createError({
          ErrorCtor: RangeError,
          message: "MASK must be set",
          prefix: true,
          statusCode: 1002,
          errorCode: "WS_ERR_EXPECTED_MASK",
        });
        cb(error);
        return;
      }
    } else if (this._masked) {
      const error = this.createError({
        ErrorCtor: RangeError,
        message: "MASK must be clear",
        prefix: true,
        statusCode: 1002,
        errorCode: "WS_ERR_UNEXPECTED_MASK",
      });
      cb(error);
      return;
    }

    if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
    else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
    else this.haveLength(cb);
  }

  /**
   * Payload length has been read
   *
   * @param {Function} cb callback
   * @private
   */
  haveLength(cb) {
    if (this._payloadLength && this._opcode < 0x08) {
      this._messageLength += this._payloadLength;
    }
    if (this._masked) this._state = GET_MASK;
    else this._state = GET_DATA;
  }

  /**
   * Read mask bytes
   */
  getMask() {
    if (this._bufferedBytes < 4) {
      this._loop = false;
      return;
    }
    this._mask = this.consume(4);
    this._state = GET_DATA;
  }

  /**
   * Consume the given number of bytes from the buffer
   *
   * @param {Number} n The number of bytes to consume
   * @return {Buffer}
   * @private
   */
  consume(n) {
    this._bufferedBytes -= n;

    if (n === this._buffers[0].length) return this._buffers.shift();

    if (n < this._buffers[0].length) {
      const buf = this._buffers[0];
      this._buffers[0] = new FastBuffer(
        buf.buffer,
        buf.byteOffset + n,
        buf.length - n,
      );

      return new FastBuffer(buf.buffer, buf.byteOffset, n);
    }

    // n bigger than buffer[0]
    const dst = Buffer.allocUnsafe(n);

    do {
      const buf = this._buffers[0];
      const offset = dst.length - n;

      if (n >= buf.length) {
        dst.set(this._buffers.shift(), offset);
      } else {
        dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
        this._buffers[0] = new FastBuffer(
          buf.buffer,
          buf.byteOffset + n,
          buf.length - n,
        );
      }
      n -= buf.length;
    } while (n > 0);

    return dst;
  }

  /**
   * Reads data bytes
   *
   * @param {Function} cb Callback
   * @private
   */
  getData(cb) {
    let data = EMPTY_BUFFER;
    if (this._payloadLength) {
      if (this._bufferedBytes < this._payloadLength) {
        this._loop = false;
        return;
      }
      data = this.consume(this._payloadLength);
    }

    if (
      this._masked &&
      (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0
    ) {
      unmask(data, this._mask);
    }

    if (data.length) {
      this._fragments.push(data);
    }
    this.dataMessage(cb);
  }

  /**
   * Handle data message
   *
   * @param {Function} cb Callbacks
   * @private
   */
  dataMessage(cb) {
    if (!this._fin) {
      this._state = GET_INFO;
      return;
    }

    const messageLength = this._messageLength;
    const fragments = this._fragments;

    this._totalPayloadLength = 0;
    this._messageLength = 0;
    this._fragmented = 0;
    this._fragments = [];

    if (this._opcode === 0x02) {
      // TODO: Handle binary later
    } else {
      const buf = concat(fragments, messageLength);
      this._state = DEFER_EVENT;
      setImmediate(() => {
        this.emit("message", buf, false);
        this._state = GET_INFO;
        this.startLoop(cb);
      });
    }
  }

  /**
   * Create error object
   *
   * @param {Object} options The error options
   * @param {Function(new:Error|RangeError)} options.ErrorCtor The error constructor
   * @param {String} options.message The error message
   * @param {Boolean} [options.prefix] Whether or not show prefix
   * @param {Number} [options.statusCode] The HTTP status code
   * @param {Number} [options.errorCode] The WebSocket error code
   * @return {Error|RangeError}
   * @private
   */
  createError({ ErrorCtor, message, prefix, statusCode, errorCode }) {
    this._loop = false;
    this._errored = true;

    const err = new ErrorCtor(
      prefix ? `Invalid Websocket Frame: ${message}` : message,
    );
    err.code = errorCode;
    err[kStatusCode] = statusCode;
    return err;
  }
}

module.exports = Receiver;
