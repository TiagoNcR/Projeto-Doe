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

function toggleLike(user, donationId) {
  const database = getDatabase();
  const donation = database.donations.find(item => item.id === donationId);
  if (!donation) throw new HttpError(404, 'Doação não encontrada.');

  if (donation.likes.includes(user.id)) donation.likes = donation.likes.filter(id => id !== user.id);
  else donation.likes.push(user.id);
  saveDatabase();
  return { liked: donation.likes.includes(user.id), likes: donation.likes.length };
}

function addComment(user, donationId, body) {
  const text = String(body.text || '').trim().slice(0, 180);
  if (!text) throw new HttpError(400, 'Escreva um comentário.');
  const donation = getDatabase().donations.find(item => item.id === donationId);
  if (!donation) throw new HttpError(404, 'Doação não encontrada.');

  donation.comments.push({
    id: crypto.randomUUID(),
    userId: user.id,
    name: user.name,
    text,
    createdAt: new Date().toISOString()
  });
  saveDatabase();
}

module.exports = { addComment, toggleFollow, toggleLike };
