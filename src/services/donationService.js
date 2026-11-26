const crypto = require('crypto');
const repository = require('../repositories/jsonRepository');
const { getDatabase, saveDatabase } = repository;
const { HttpError } = require('../utils/errors');
const { publicDonation } = require('../utils/serializers');
const { validateRequiredDataImage } = require('../utils/images');
const messageService = require('./messageService');
const notificationService = require('./notificationService');
const blockService = require('./blockService');

const MAX_DONATION_IMAGE_BYTES = 5 * 1024 * 1024;
const DONATION_IMAGE_ERROR = 'Envie uma imagem PNG, JPG ou WebP com até 5 MB.';
const DONATION_STATUSES = new Set(['available', 'reserved', 'delivered']);

function findDonation(id) {
  const donation = getDatabase().donations.find(item => item.id === id);
  if (!donation) throw new HttpError(404, 'Doação não encontrada.');
  return donation;
}

// Quem demonstrou interesse só é revelado para quem doa; os demais veem apenas a quantidade.
function donationForUser(item, user) {
  const { interests: storedInterests, reservedFor: storedReservedFor, ...rest } = item;
  const interests = Array.isArray(storedInterests) ? storedInterests : [];
  const reservedFor = storedReservedFor || null;
  const donation = {
    ...publicDonation(rest),
    status: DONATION_STATUSES.has(item.status) ? item.status : 'available',
    interestCount: interests.length,
    interestedByMe: Boolean(user && interests.some(interest => interest.userId === user.id)),
    reservedForMe: Boolean(user && reservedFor === user.id)
  };
  if (user && item.ownerId === user.id) {
    const users = getDatabase().users;
    donation.reservedFor = reservedFor;
    donation.interests = interests.map(interest => ({
      userId: interest.userId,
      name: users.find(entry => entry.id === interest.userId)?.name || 'Participante',
      createdAt: interest.createdAt
    }));
  }
  return donation;
}

function toFeedItem(item, user) {
  return {
    ...donationForUser(item, user),
    kind: 'donation',
    likedByMe: Boolean(user && item.likes.includes(user.id)),
    followingOwner: Boolean(user && Array.isArray(user.following) && user.following.includes(item.ownerId))
  };
}

function listDonations(user, filter) {
  const database = getDatabase();
  let items = database.donations.slice().reverse();
  if (filter === 'following' && user) {
    const following = Array.isArray(user.following) ? user.following : [];
    items = items.filter(item => following.includes(item.ownerId));
  }

  const donations = items.map(item => toFeedItem(item, user));
  const following = user && Array.isArray(user.following) ? user.following : [];
  return { donations, followingCount: following.length };
}

// Compara sem diferenciar maiúsculas nem acentos ("calcas" encontra "Calças").
function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function searchDonations(user, criteria = {}) {
  const terms = normalizeText(criteria.q).split(/\s+/).filter(Boolean).slice(0, 10);
  const category = String(criteria.category || '');
  const size = String(criteria.size || '');
  const onlyAvailable = Boolean(criteria.onlyAvailable);

  const items = getDatabase().donations.slice().reverse().filter(item => {
    if (category && item.category !== category) return false;
    if (size && item.size !== size) return false;
    if (onlyAvailable && (item.status || 'available') !== 'available') return false;
    if (!terms.length) return true;
    // Cada termo precisa ser o começo de alguma palavra ("cas" acha "casaco"; "usa" não acha "blusa").
    const words = normalizeText(`${item.name} ${item.description} ${item.category}`).split(/[^a-z0-9]+/).filter(Boolean);
    return terms.every(term => words.some(word => word.startsWith(term)));
  });
  return { items: blockService.filterVisibleItems(user, items.map(item => toFeedItem(item, user))) };
}

function createDonation(user, body) {
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Informe o nome da peça.');
  const image = validateRequiredDataImage(
    body.image,
    MAX_DONATION_IMAGE_BYTES,
    DONATION_IMAGE_ERROR
  );

  const donation = {
    id: crypto.randomUUID(),
    name,
    category: String(body.category || 'Outros'),
    size: String(body.size || 'Único'),
    condition: String(body.condition || 'Boa'),
    description: String(body.description || '').trim().slice(0, 180),
    imageId: repository.putImage(image),
    ownerId: user.id,
    status: 'available',
    reservedFor: null,
    interests: [],
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  getDatabase().donations.push(donation);
  saveDatabase();
  return donationForUser(donation, user);
}

function expressInterest(user, id) {
  const donation = findDonation(id);
  if (donation.ownerId === user.id) {
    throw new HttpError(400, 'Você não pode demonstrar interesse na sua própria doação.');
  }
  blockService.assertNotBlocked(user.id, donation.ownerId);
  if (!Array.isArray(donation.interests)) donation.interests = [];

  const alreadyInterested = donation.interests.some(interest => interest.userId === user.id);
  if (!alreadyInterested) {
    const status = donation.status || 'available';
    if (status === 'reserved') throw new HttpError(409, 'Esta doação já está reservada.');
    if (status === 'delivered') throw new HttpError(409, 'Esta doação já foi entregue.');

    donation.interests.push({ userId: user.id, createdAt: new Date().toISOString() });
    notificationService.addNotification({
      recipientId: donation.ownerId,
      actorId: user.id,
      type: 'interest',
      itemId: donation.id,
      itemKind: 'donation',
      itemLabel: donation.name
    });
    saveDatabase();
    messageService.sendMessage(user, donation.ownerId, {
      text: `Olá! Tenho interesse na sua doação "${donation.name}" (${donation.category}, tamanho ${donation.size}). Ela ainda está disponível?`
    });
  }

  return {
    donation: donationForUser(donation, user),
    contactId: donation.ownerId,
    alreadyInterested
  };
}

// Avisa quem demonstrou interesse sobre uma mudança na doação (exceto excludeUserId).
function notifyInterested(donation, type, excludeUserId = null) {
  for (const interest of Array.isArray(donation.interests) ? donation.interests : []) {
    if (interest.userId === excludeUserId) continue;
    notificationService.addNotification({
      recipientId: interest.userId,
      actorId: donation.ownerId,
      type,
      itemId: donation.id,
      itemKind: 'donation',
      itemLabel: donation.name
    });
  }
}

function withdrawInterest(user, id) {
  const donation = findDonation(id);
  const interests = Array.isArray(donation.interests) ? donation.interests : [];
  if (!interests.some(interest => interest.userId === user.id)) {
    return { donation: donationForUser(donation, user), withdrawn: false };
  }
  const status = donation.status || 'available';
  if (status === 'delivered' && donation.reservedFor === user.id) {
    throw new HttpError(409, 'Esta doação já foi entregue para você.');
  }

  donation.interests = interests.filter(interest => interest.userId !== user.id);
  notificationService.removeNotification({
    recipientId: donation.ownerId,
    actorId: user.id,
    type: 'interest',
    itemId: donation.id
  });

  // Desistir de uma reserva devolve a peça para quem ainda tem interesse
  if (status === 'reserved' && donation.reservedFor === user.id) {
    donation.status = 'available';
    donation.reservedFor = null;
    donation.statusUpdatedAt = new Date().toISOString();
    notificationService.addNotification({
      recipientId: donation.ownerId,
      actorId: user.id,
      type: 'reservation_canceled',
      itemId: donation.id,
      itemKind: 'donation',
      itemLabel: donation.name
    });
    notifyInterested(donation, 'available_again');
  }
  saveDatabase();
  return { donation: donationForUser(donation, user), withdrawn: true };
}

function updateDonationStatus(user, id, body) {
  const donation = findDonation(id);
  if (donation.ownerId !== user.id) {
    throw new HttpError(403, 'Você só pode alterar a situação das suas próprias doações.');
  }
  const status = String(body.status || '');
  if (!DONATION_STATUSES.has(status)) throw new HttpError(400, 'Situação da doação inválida.');

  const interests = Array.isArray(donation.interests) ? donation.interests : [];
  const previousStatus = donation.status || 'available';
  const previousReservedFor = donation.reservedFor || null;
  let reservedFor = previousReservedFor;

  if (status === 'available') {
    reservedFor = null;
  } else if (status === 'reserved') {
    reservedFor = body.reservedFor ? String(body.reservedFor) : '';
    if (!reservedFor) throw new HttpError(400, 'Escolha para quem a doação está reservada.');
    if (!interests.some(interest => interest.userId === reservedFor)) {
      throw new HttpError(400, 'Só é possível reservar para quem demonstrou interesse.');
    }
  }

  donation.status = status;
  donation.reservedFor = reservedFor;
  donation.statusUpdatedAt = new Date().toISOString();

  if (status === 'reserved' && reservedFor !== previousReservedFor) {
    notifyInterested(donation, 'reserved_other', reservedFor);
  } else if (status === 'delivered' && previousStatus === 'available') {
    // Se a peça já estava reservada, os demais foram avisados na reserva
    notifyInterested(donation, 'delivered_other', reservedFor);
  } else if (status === 'available' && previousStatus !== 'available') {
    notifyInterested(donation, 'available_again');
  }
  saveDatabase();

  if (status === 'reserved' && reservedFor !== previousReservedFor) {
    messageService.sendMessage(user, reservedFor, {
      text: `Reservei a doação "${donation.name}" para você! Vamos combinar a entrega por aqui.`
    });
  }
  return donationForUser(donation, user);
}

// Doações que ligam duas pessoas numa conversa: as minhas em que o contato tem interesse
// e as do contato em que eu tenho interesse (sem expor outros interessados).
function donationsBetween(user, contactId) {
  const database = getDatabase();
  if (!database.users.some(item => item.id === contactId)) throw new HttpError(404, 'Participante não encontrado.');
  const interestedIn = (donation, userId) =>
    Array.isArray(donation.interests) && donation.interests.some(interest => interest.userId === userId);
  const summary = donation => ({
    id: donation.id,
    name: donation.name,
    status: DONATION_STATUSES.has(donation.status) ? donation.status : 'available'
  });
  return {
    mine: database.donations.filter(item => item.ownerId === user.id && interestedIn(item, contactId))
      .reverse().map(item => ({ ...summary(item), reservedForContact: item.reservedFor === contactId })),
    theirs: database.donations.filter(item => item.ownerId === contactId && interestedIn(item, user.id))
      .reverse().map(item => ({ ...summary(item), reservedForMe: item.reservedFor === user.id }))
  };
}

function removeDonation(user, id) {
  const database = getDatabase();
  const donation = findDonation(id);
  if (donation.ownerId !== user.id) {
    throw new HttpError(403, 'Você só pode excluir suas próprias doações.');
  }
  database.donations = database.donations.filter(item => item.id !== id);
  repository.deleteImage(donation.imageId);
  saveDatabase();
}

module.exports = {
  createDonation,
  donationsBetween,
  expressInterest,
  listDonations,
  removeDonation,
  searchDonations,
  updateDonationStatus,
  withdrawInterest
};
