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

module.exports = {
  toBuffer,
};
