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

module.exports = {
  toBuffer,
  concat,
};
