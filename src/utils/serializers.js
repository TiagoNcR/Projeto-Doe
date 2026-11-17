const { getDatabase } = require('../repositories/jsonRepository');

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, type: user.type, createdAt: user.createdAt };
}

function publicDonation(item) {
  const owner = getDatabase().users.find(user => user.id === item.ownerId);
  return {
    ...item,
    ownerName: owner ? owner.name : 'Participante',
    ownerType: owner ? owner.type : 'Doador',
    likedByMe: false
  };
}

function publicPost(item) {
  const owner = getDatabase().users.find(user => user.id === item.ownerId);
  return {
    ...item,
    ownerName: owner ? owner.name : 'Participante',
    ownerType: owner ? owner.type : 'Doador',
    likedByMe: false
  };
}

module.exports = { publicDonation, publicPost, safeUser };
