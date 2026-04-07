const { EMPTY_BUFFER } = require("./constant");

const FastBuffer = Buffer[Symbol.species];

/**
 * Convert data to buffer
 *
 * @param {*} data The data to convert
 * @returns {Buffer} The buffer
 * @public
 */
function toBuffer(data) {
  toBuffer.readonly = true;

  if (Buffer.isBuffer(data)) return data;

  let buf;
  if (data instanceof ArrayBuffer) {
    buf = new FastBuffer(data);
  } else if (ArrayBuffer.isView(data)) {
    buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
  } else {
    buf = Buffer.from(data);
    toBuffer.readonly = false;
  }

  return buf;
}

/**
 * Merge array of buffers into new buffer
 *
 * @param {Buffer[]} list List of buffers
 * @param {Number} totalLength The total length of buffers in the list
 * @returns {Buffer} The result buffer
 */
function concat(list, totalLength) {
  if (list.length === 0) return EMPTY_BUFFER;
  if (list.length === 1) return list[0];

  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;

  for (const buf of list) {
    target.set(buf, offset);
    offset += buf.length;
  }

  if (offset < totalLength) {
    return new FastBuffer(target.buffer, target.byteOffset, offset);
  }

  return target;
}

/**
 * Mask a buffer using the given mask
 *
 * @param {Buffer} source The buffer to mask
 * @param {Buffer} mask The mask to use
 * @param {Buffer} output The output where to store the result
 * @param {Number} offset The offset position to start writing
 * @param {Number} length The number of bytes to mask
 */
function _mask(source, mask, output, offset, length) {
  for (let i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
}

/**
 * Unmask the masked buffer
 *
 * @param {Buffer} buffer
 * @param {Buffer} mask
 */
function _unmask(buffer, mask) {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] ^= mask[i & 3];
  }
}

module.exports = {
  toBuffer,
  concat,
  mask: _mask,
  unmask: _unmask,
};
