const { Duplex } = require("stream");

const { kWebSocket } = require("./constant");
const { mask: applyMask, toBuffer } = require("./buffer-util");
const { randomFillSync } = require("crypto");

const kByteLength = Symbol("kByteLength");
const maskBuffer = Buffer.alloc(4);
const RANDOM_POOL_SIZE = 8 * 1024;
let randomPool;
let randomPoolPointer = RANDOM_POOL_SIZE;

/**
 * Sendere implementation
 */
class Sender {
  /**
   * Create a sender isntance
   *
   * @param {Duplex} socket
   */
  constructor(socket) {
    this._socket = socket;
    this[kWebSocket] = undefined;
  }

  /**
   *
   * @param {Buffer|String} data The data to frame
   * @param {Object} options
   * @param {boolean} [options.fin] Specify the FIN bit
   * @param {Function}  [options.generateMask] The function
   * used to generate the masking key
   * @param {Boolean} [options.mask] Specifies whether or not to
   * mask data
   * @param {Boolean} [options.readOnly] Whether or not data can be modified
   * @param {Number} [options.opcode] The opcode
   * @returns {(Buffer|String)[]} The frame data
   */
  static frame(data, options) {
    let mask;
    let skipMasking = false;
    let offset = 2;
    let merge = false;

    if (options.mask) {
      mask = options.maskbuffer || maskBuffer;

      if (options.generateMask) {
      } else {
        if (randomPoolPointer === RANDOM_POOL_SIZE) {
          if (randomPool === undefined) {
            randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
          }
          randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
          randomPoolPointer = 0;
        }
        mask[0] = randomPool[randomPoolPointer++];
        mask[1] = randomPool[randomPoolPointer++];
        mask[2] = randomPool[randomPoolPointer++];
        mask[3] = randomPool[randomPoolPointer++];
      }

      skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
      offset = 6;
    }

    let dataLength;
    if (typeof data === "string") {
      if (
        (!options?.mask || skipMasking) &&
        options[kByteLength] !== undefined
      ) {
        dataLength = options[kByteLength];
      } else {
        data = Buffer.from(data);
        dataLength = data.length;
      }
    } else {
      dataLength = data.length;
      merge = options.mask && options.readOnly && !skipMasking;
    }

    let payloadLength = dataLength;

    if (dataLength >= 65536) {
      offset += 8;
      payloadLength = 127;
    } else if (dataLength > 125) {
      offset += 2;
      payloadLength = 126;
    }

    const target = Buffer.allocUnsafe(offset);
    target[0] = options.fin ? options.opcode | 0x80 : options.opcode;
    target[1] = payloadLength;

    if (payloadLength === 126) {
      target.writeUInt16BE(dataLength, 2);
    } else if (payloadLength === 127) {
      target[2] = target[3] = 0;
      target.writeUIntBE(dataLength, 4, 6);
    }
    if (!options.mask) return [target, data];

    target[1] |= 0x80;
    target[offset - 4] = mask[0];
    target[offset - 3] = mask[1];
    target[offset - 2] = mask[2];
    target[offset - 1] = mask[3];

    if (skipMasking) return [target, data];

    if (merge) {
      // TODO: Handle merge
    }

    applyMask(data, mask, data, 0, dataLength);
    return [target, data];
  }

  /**
   * Frame the sending data
   *
   * @param {Buffer|String} data The data to frame
   * @param {Object} options Options object
   * @param {Boolean} [options.binary] Specify whether data is binary or text
   * @param {Boolean} [options.fin=false] Specifies whether the fragment is the last one
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask `data`
   * @param {Funciotn} [cb] Callbacks
   */
  send(data, options, cb) {
    const opcode = options.binary ? 2 : 1;

    let byteLength;
    if (typeof data === "string") {
      byteLength = Buffer.byteLength(data);
    } else {
      data = toBuffer(data);
      byteLength = data.length;
    }

    options = {
      fin: options.fin,
      mask: options.mask,
      opcode,
    };

    this.sendFrame(Sender.frame(data, options), cb);
  }

  /**
   * Sender a list of frame
   *
   * @param {(Buffer|String)[]} list List of frame to send
   * @param {Funciton} [cb] Callbacks
   */
  sendFrame(list, cb) {
    if (list.length === 2) {
      this._socket.cork();
      this._socket.write(list[0]);
      this._socket.write(list[1], cb);
      this._socket.uncork();
    } else {
      this._socket.write(list[0], cb);
    }
  }
}

module.exports = Sender;
