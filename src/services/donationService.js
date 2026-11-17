const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');
const { publicDonation } = require('../utils/serializers');

function listDonations(user, filter) {
  const database = getDatabase();
  let items = database.donations.slice().reverse();
  if (filter === 'following' && user) {
    const following = Array.isArray(user.following) ? user.following : [];
    items = items.filter(item => following.includes(item.ownerId));
  }

  const donations = items.map(item => ({
    ...publicDonation(item),
    kind: 'donation',
    likedByMe: Boolean(user && item.likes.includes(user.id)),
    followingOwner: Boolean(user && Array.isArray(user.following) && user.following.includes(item.ownerId))
  }));
  const following = user && Array.isArray(user.following) ? user.following : [];
  return { donations, followingCount: following.length };
}

function createDonation(user, body) {
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Informe o nome da peça.');
  if (body.image && (!String(body.image).startsWith('data:image/') || String(body.image).length > 5 * 1024 * 1024)) {
    throw new HttpError(400, 'Envie uma imagem válida com até 5 MB.');
  }

  const donation = {
    id: crypto.randomUUID(),
    name,
    category: String(body.category || 'Outros'),
    size: String(body.size || 'Único'),
    condition: String(body.condition || 'Boa'),
    description: String(body.description || '').trim().slice(0, 180),
    image: String(body.image || ''),
    ownerId: user.id,
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  getDatabase().donations.push(donation);
  saveDatabase();
  return publicDonation(donation);
}

function removeDonation(user, id) {
  const database = getDatabase();
  const donation = database.donations.find(item => item.id === id);
  if (!donation) throw new HttpError(404, 'Doação não encontrada.');
  if (donation.ownerId !== user.id) {
    throw new HttpError(403, 'Você só pode excluir suas próprias doações.');
  }
  database.donations = database.donations.filter(item => item.id !== id);
  saveDatabase();
}

module.exports = { createDonation, listDonations, removeDonation };
