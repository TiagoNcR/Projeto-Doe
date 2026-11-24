const { HttpError } = require('./errors');

const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

function parseDataImage(value, maxBytes, message) {
  if (value === '' || value == null) return null;
  if (typeof value !== 'string') throw new HttpError(400, message);

  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new HttpError(400, message);

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new HttpError(400, message);
  }

  return {
    contentType: match[1],
    buffer
  };
}

function validateRequiredDataImage(value, maxBytes, message) {
  const image = typeof value === 'string' ? value : '';
  if (!image) throw new HttpError(400, message);
  parseDataImage(image, maxBytes, message);
  return image;
}

function validateOptionalDataImage(value, maxBytes, message) {
  const image = typeof value === 'string' ? value : '';
  if (!image) return '';
  parseDataImage(image, maxBytes, message);
  return image;
}

module.exports = {
  allowedImageTypes,
  parseDataImage,
  validateOptionalDataImage,
  validateRequiredDataImage
};
