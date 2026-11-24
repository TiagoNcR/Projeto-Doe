const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseDataImage, validateRequiredDataImage } = require('./images');

const message = 'Formato de imagem inválido.';

test('accepts PNG, JPG and WebP data images', () => {
  for (const contentType of ['image/png', 'image/jpeg', 'image/webp']) {
    const result = parseDataImage(
      `data:${contentType};base64,AQID`,
      1024,
      message
    );
    assert.equal(result.contentType, contentType);
  }
});

test('rejects unsupported and oversized data images', () => {
  assert.throws(
    () => parseDataImage('data:image/svg+xml;base64,PHN2Zz4=', 1024, message),
    error => error.status === 400
  );
  assert.throws(
    () => parseDataImage('data:image/png;base64,AQID', 2, message),
    error => error.status === 400
  );
});

test('rejects an empty image', () => {
  assert.throws(
    () => validateRequiredDataImage('', 1024, message),
    error => error.status === 400
  );
});
