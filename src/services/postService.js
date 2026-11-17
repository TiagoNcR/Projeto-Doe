const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');
const { publicPost } = require('../utils/serializers');

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
  if (body.image && (!String(body.image).startsWith('data:image/') || String(body.image).length > 5 * 1024 * 1024)) {
    throw new HttpError(400, 'Envie uma imagem válida com até 5 MB.');
  }

  const post = {
    id: crypto.randomUUID(),
    text,
    image: String(body.image || ''),
    ownerId: user.id,
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  getDatabase().posts.push(post);
  saveDatabase();
  return publicPost(post);
}

function removePost(user, id) {
  const database = getDatabase();
  const post = database.posts.find(item => item.id === id);
  if (!post) throw new HttpError(404, 'Publicação não encontrada.');
  if (post.ownerId !== user.id) throw new HttpError(403, 'Você só pode excluir suas próprias publicações.');
  database.posts = database.posts.filter(item => item.id !== id);
  saveDatabase();
}

module.exports = { createPost, listPosts, removePost };
