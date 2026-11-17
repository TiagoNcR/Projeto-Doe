const { getDatabase } = require('../repositories/jsonRepository');

function avatarUrl(user) {
  if (!user || !user.profileImage) return '';
  const version = user.profileImageUpdatedAt
    ? `?v=${encodeURIComponent(user.profileImageUpdatedAt)}`
    : '';
  return `/api/users/${encodeURIComponent(user.id)}/avatar${version}`;
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    createdAt: user.createdAt,
    avatarUrl: avatarUrl(user)
  };
}

function publicDonation(item) {
  const owner = getDatabase().users.find(user => user.id === item.ownerId);
  return {
    ...item,
    ownerName: owner ? owner.name : 'Participante',
    ownerAvatarUrl: avatarUrl(owner),
    ownerType: owner ? owner.type : 'Doador',
    likedByMe: false
  };
}

function publicPost(item) {
  const owner = getDatabase().users.find(user => user.id === item.ownerId);
  return {
    ...item,
    ownerName: owner ? owner.name : 'Participante',
    ownerAvatarUrl: avatarUrl(owner),
    ownerType: owner ? owner.type : 'Doador',
    likedByMe: false
  };
}

module.exports = { avatarUrl, publicDonation, publicPost, safeUser };
