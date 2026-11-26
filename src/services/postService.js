const crypto = require('crypto');
const repository = require('../repositories/jsonRepository');
const { getDatabase, saveDatabase } = repository;
const { HttpError } = require('../utils/errors');
const { publicPost } = require('../utils/serializers');
const { validateOptionalDataImage } = require('../utils/images');
const blockService = require('./blockService');

const organizerRole = 'Instituição/Organizador';
const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024;
const POST_IMAGE_ERROR = 'Envie uma imagem PNG, JPG ou WebP com até 5 MB.';

function isValidEventDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function listPosts(user, filter) {
  const database = getDatabase();
  let posts = database.posts.slice();
  if (filter === 'following' && user) {
    const following = Array.isArray(user.following) ? user.following : [];
    posts = posts.filter(item => following.includes(item.ownerId));
  }

  return posts.map(item => ({
    ...publicPost(item),
    kind: 'post',
    likedByMe: Boolean(user && item.likes.includes(user.id)),
    followingOwner: Boolean(user && Array.isArray(user.following) && user.following.includes(item.ownerId))
  }));
}

function createPost(user, body) {
  const text = String(body.text || '').trim();
  if (!text) throw new HttpError(400, 'Escreva o conteúdo da publicação.');
  if (text.length > 1000) throw new HttpError(400, 'A publicação deve ter até 1000 caracteres.');
  const eventDate = String(body.eventDate || '').trim();
  if (eventDate && user.type !== organizerRole) {
    throw new HttpError(403, 'Somente instituições e organizadores podem marcar uma atividade.');
  }
  if (eventDate && !isValidEventDate(eventDate)) {
    throw new HttpError(400, 'Informe uma data válida para a atividade.');
  }
  const image = validateOptionalDataImage(
    body.image,
    MAX_POST_IMAGE_BYTES,
    POST_IMAGE_ERROR
  );

  const post = {
    id: crypto.randomUUID(),
    text,
    imageId: image ? repository.putImage(image) : null,
    ownerId: user.id,
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  if (eventDate) post.eventDate = eventDate;
  getDatabase().posts.push(post);
  saveDatabase();
  return publicPost(post);
}

function listEvents(user, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) {
    throw new HttpError(400, 'Informe o mês no formato AAAA-MM.');
  }

  const events = getDatabase().posts
    .filter(item => typeof item.eventDate === 'string' && item.eventDate.startsWith(`${month}-`));
  return blockService.filterVisibleItems(user, events)
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate))
    .map(item => ({ ...publicPost(item), kind: 'post' }));
}

function removePost(user, id) {
  const database = getDatabase();
  const post = database.posts.find(item => item.id === id);
  if (!post) throw new HttpError(404, 'Publicação não encontrada.');
  if (post.ownerId !== user.id) throw new HttpError(403, 'Você só pode excluir suas próprias publicações.');
  database.posts = database.posts.filter(item => item.id !== id);
  repository.deleteImage(post.imageId);
  saveDatabase();
}

module.exports = { createPost, listEvents, listPosts, removePost };
