const repository = require('../repositories/jsonRepository');
const { requireUser } = require('../middleware/session');
const { HttpError } = require('../utils/errors');
const { sendImage } = require('../utils/http');

const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Cada foto tem um identificador único e nunca muda, então o navegador pode guardá-la por um ano.
async function show(req, res, imageId) {
  requireUser(req, 'Faça login para ver as fotos.');
  const image = IMAGE_ID.test(imageId) ? await repository.getImage(imageId) : null;
  if (!image) throw new HttpError(404, 'Foto não encontrada.');
  sendImage(res, image, 'private, max-age=31536000, immutable');
}

module.exports = { show };
