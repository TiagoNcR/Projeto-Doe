const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { avatarUrl } = require('../utils/serializers');
const blockService = require('./blockService');

const MAX_NOTIFICATIONS_PER_USER = 100;
const LIST_LIMIT = 30;
// Eventos que podem ser desfeitos (descurtir, deixar de seguir): não se repetem e são removidos ao desfazer.
const TOGGLE_TYPES = new Set(['like', 'follow']);

function notifications() {
  const database = getDatabase();
  if (!Array.isArray(database.notifications)) database.notifications = [];
  return database.notifications;
}

function sameEvent(notification, { recipientId, actorId, type, itemId = null }) {
  return notification.userId === recipientId &&
    notification.actorId === actorId &&
    notification.type === type &&
    (notification.itemId || null) === itemId;
}

// Registra um aviso para recipientId. Quem chama é responsável por salvar o banco.
function addNotification({ recipientId, actorId, type, itemId = null, itemKind = null, itemLabel = '', preview = '' }) {
  if (!recipientId || recipientId === actorId) return null;
  if (blockService.isBlockedBetween(recipientId, actorId)) return null;
  const list = notifications();
  if (TOGGLE_TYPES.has(type)) {
    const existing = list.find(item => sameEvent(item, { recipientId, actorId, type, itemId }));
    if (existing) return existing;
  }

  const notification = {
    id: crypto.randomUUID(),
    userId: recipientId,
    actorId,
    type,
    itemId,
    itemKind,
    itemLabel: String(itemLabel || '').slice(0, 60),
    preview: String(preview || '').slice(0, 80),
    createdAt: new Date().toISOString(),
    read: false
  };
  list.push(notification);

  const mine = list.filter(item => item.userId === recipientId);
  if (mine.length > MAX_NOTIFICATIONS_PER_USER) {
    const dropped = new Set(mine.slice(0, mine.length - MAX_NOTIFICATIONS_PER_USER).map(item => item.id));
    getDatabase().notifications = list.filter(item => !dropped.has(item.id));
  }
  return notification;
}

function removeNotification(event) {
  const database = getDatabase();
  database.notifications = notifications().filter(item => !sameEvent(item, event));
}

function visibleNotifications(user) {
  const hidden = blockService.hiddenUserIds(user);
  return notifications().filter(item => item.userId === user.id && !hidden.has(item.actorId));
}

function countUnread(user) {
  return visibleNotifications(user).filter(item => !item.read).length;
}

function listNotifications(user) {
  const users = getDatabase().users;
  const mine = visibleNotifications(user);
  const latest = mine.slice().reverse().slice(0, LIST_LIMIT).map(item => {
    const actor = users.find(entry => entry.id === item.actorId);
    return {
      id: item.id,
      type: item.type,
      itemId: item.itemId,
      itemKind: item.itemKind,
      itemLabel: item.itemLabel,
      preview: item.preview,
      createdAt: item.createdAt,
      read: Boolean(item.read),
      actor: {
        id: item.actorId,
        name: actor ? actor.name : 'Participante',
        avatarUrl: avatarUrl(actor)
      }
    };
  });
  return { notifications: latest, unreadCount: mine.filter(item => !item.read).length };
}

function markAllAsRead(user) {
  let changed = false;
  for (const item of notifications()) {
    if (item.userId === user.id && !item.read) {
      item.read = true;
      changed = true;
    }
  }
  if (changed) saveDatabase();
  return { unreadCount: 0 };
}

module.exports = { addNotification, countUnread, listNotifications, markAllAsRead, removeNotification };
