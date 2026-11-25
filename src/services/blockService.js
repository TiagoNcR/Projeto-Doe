const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');
const { avatarUrl } = require('../utils/serializers');

function blockedBy(user) {
  return user && Array.isArray(user.blocked) ? user.blocked : [];
}

function findUser(userId) {
  return getDatabase().users.find(item => item.id === userId);
}

// Pessoas com quem `user` não interage: quem ela bloqueou e quem a bloqueou.
function hiddenUserIds(user) {
  const ids = new Set(blockedBy(user));
  if (!user) return ids;
  for (const other of getDatabase().users) {
    if (blockedBy(other).includes(user.id)) ids.add(other.id);
  }
  return ids;
}

function isBlockedBetween(firstId, secondId) {
  return blockedBy(findUser(firstId)).includes(secondId) || blockedBy(findUser(secondId)).includes(firstId);
}

function assertNotBlocked(firstId, secondId, message = 'Não é possível interagir com este participante.') {
  if (isBlockedBetween(firstId, secondId)) throw new HttpError(403, message);
}

// Remove do feed/perfil/busca os itens e comentários de pessoas bloqueadas (nos dois sentidos).
function filterVisibleItems(user, items) {
  const hidden = hiddenUserIds(user);
  if (!hidden.size) return items;
  return items
    .filter(item => !hidden.has(item.ownerId))
    .map(item => Array.isArray(item.comments)
      ? { ...item, comments: item.comments.filter(comment => !hidden.has(comment.userId)) }
      : item);
}

// Desfaz interesses e reservas de `personId` nas doações de `ownerId` (sem avisos).
function clearDonationLinks(ownerId, personId) {
  for (const donation of getDatabase().donations) {
    if (donation.ownerId !== ownerId) continue;
    if (Array.isArray(donation.interests)) {
      donation.interests = donation.interests.filter(interest => interest.userId !== personId);
    }
    if (donation.reservedFor === personId && donation.status === 'reserved') {
      donation.status = 'available';
      donation.reservedFor = null;
      donation.statusUpdatedAt = new Date().toISOString();
    }
  }
}

function block(user, targetId) {
  const target = findUser(targetId);
  if (!target) throw new HttpError(404, 'Participante não encontrado.');
  if (target.id === user.id) throw new HttpError(400, 'Você não pode bloquear a si mesmo.');

  if (!Array.isArray(user.blocked)) user.blocked = [];
  if (!user.blocked.includes(target.id)) user.blocked.push(target.id);
  user.following = (user.following || []).filter(id => id !== target.id);
  target.following = (target.following || []).filter(id => id !== user.id);
  clearDonationLinks(user.id, target.id);
  clearDonationLinks(target.id, user.id);

  const database = getDatabase();
  if (Array.isArray(database.notifications)) {
    database.notifications = database.notifications.filter(item =>
      !((item.userId === user.id && item.actorId === target.id) || (item.userId === target.id && item.actorId === user.id))
    );
  }
  saveDatabase();
  return { blocked: true };
}

function unblock(user, targetId) {
  user.blocked = blockedBy(user).filter(id => id !== targetId);
  saveDatabase();
  return { blocked: false };
}

function listBlocked(user) {
  return {
    blocked: blockedBy(user)
      .map(id => findUser(id))
      .filter(Boolean)
      .map(person => ({ id: person.id, name: person.name, avatarUrl: avatarUrl(person) }))
  };
}

module.exports = {
  assertNotBlocked,
  block,
  blockedBy,
  filterVisibleItems,
  hiddenUserIds,
  isBlockedBetween,
  listBlocked,
  unblock
};
