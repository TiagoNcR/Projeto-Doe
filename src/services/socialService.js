const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');

function toggleFollow(user, targetId) {
  const database = getDatabase();
  const target = database.users.find(item => item.id === targetId);
  if (!target) throw new HttpError(404, 'Participante não encontrado.');
  if (target.id === user.id) throw new HttpError(400, 'Você não pode seguir a si mesmo.');

  if (!Array.isArray(user.following)) user.following = [];
  if (user.following.includes(target.id)) {
    user.following = user.following.filter(id => id !== target.id);
  } else {
    user.following.push(target.id);
  }
  saveDatabase();
  return { following: user.following.includes(target.id) };
}

function getSocialItem(database, itemType, itemId) {
  const collection = itemType === 'post' ? database.posts : database.donations;
  const item = collection.find(entry => entry.id === itemId);
  if (!item) {
    throw new HttpError(404, itemType === 'post' ? 'Publicação não encontrada.' : 'Doação não encontrada.');
  }
  return item;
}

function toggleLike(user, itemId, itemType = 'donation') {
  const database = getDatabase();
  const item = getSocialItem(database, itemType, itemId);

  if (item.likes.includes(user.id)) item.likes = item.likes.filter(id => id !== user.id);
  else item.likes.push(user.id);
  saveDatabase();
  return { liked: item.likes.includes(user.id), likes: item.likes.length };
}

function addComment(user, itemId, body, itemType = 'donation') {
  const text = String(body.text || '').trim().slice(0, 180);
  if (!text) throw new HttpError(400, 'Escreva um comentário.');
  const item = getSocialItem(getDatabase(), itemType, itemId);

  item.comments.push({
    id: crypto.randomUUID(),
    userId: user.id,
    name: user.name,
    text,
    createdAt: new Date().toISOString()
  });
  saveDatabase();
}

module.exports = { addComment, toggleFollow, toggleLike };
