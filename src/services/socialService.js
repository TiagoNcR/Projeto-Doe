const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');
const notificationService = require('./notificationService');

function toggleFollow(user, targetId) {
  const database = getDatabase();
  const target = database.users.find(item => item.id === targetId);
  if (!target) throw new HttpError(404, 'Participante não encontrado.');
  if (target.id === user.id) throw new HttpError(400, 'Você não pode seguir a si mesmo.');

  if (!Array.isArray(user.following)) user.following = [];
  const event = { recipientId: target.id, actorId: user.id, type: 'follow' };
  if (user.following.includes(target.id)) {
    user.following = user.following.filter(id => id !== target.id);
    notificationService.removeNotification(event);
  } else {
    user.following.push(target.id);
    notificationService.addNotification(event);
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

// Texto curto que identifica o item na notificação ("Casaco de lã" ou o começo da publicação).
function itemLabel(item, itemType) {
  if (itemType !== 'post') return item.name || 'sua doação';
  const text = String(item.text || '').trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text || 'sua publicação';
}

function toggleLike(user, itemId, itemType = 'donation') {
  const database = getDatabase();
  const item = getSocialItem(database, itemType, itemId);
  const event = { recipientId: item.ownerId, actorId: user.id, type: 'like', itemId: item.id };

  if (item.likes.includes(user.id)) {
    item.likes = item.likes.filter(id => id !== user.id);
    notificationService.removeNotification(event);
  } else {
    item.likes.push(user.id);
    notificationService.addNotification({ ...event, itemKind: itemType, itemLabel: itemLabel(item, itemType) });
  }
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
  notificationService.addNotification({
    recipientId: item.ownerId,
    actorId: user.id,
    type: 'comment',
    itemId: item.id,
    itemKind: itemType,
    itemLabel: itemLabel(item, itemType),
    preview: text
  });
  saveDatabase();
}

module.exports = { addComment, toggleFollow, toggleLike };
