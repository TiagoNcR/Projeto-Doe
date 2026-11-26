const { getDatabase } = require('../repositories/jsonRepository');

function imageUrl(imageId) {
  return imageId ? `/api/images/${encodeURIComponent(imageId)}` : '';
}

// Cada foto nova recebe outro identificador, então o endereço já muda quando a foto muda.
function avatarUrl(user) {
  return user ? imageUrl(user.profileImageId) : '';
}

// O registro guarda só o identificador da foto; a resposta leva o endereço dela em `image`.
function withImageUrl(item) {
  const { imageId, ...rest } = item;
  return { ...rest, image: imageUrl(imageId) };
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

// Comentários guardam uma cópia do nome; mostra o nome atual de quem comentou, se a pessoa ainda existir.
function currentCommentNames(comments) {
  if (!Array.isArray(comments)) return comments;
  const users = getDatabase().users;
  return comments.map(comment => {
    const author = users.find(user => user.id === comment.userId);
    return author ? { ...comment, name: author.name } : comment;
  });
}

function publicDonation(item) {
  const owner = getDatabase().users.find(user => user.id === item.ownerId);
  return {
    ...withImageUrl(item),
    comments: currentCommentNames(item.comments),
    ownerName: owner ? owner.name : 'Participante',
    ownerAvatarUrl: avatarUrl(owner),
    ownerType: owner ? owner.type : 'Doador',
    likedByMe: false
  };
}

function publicPost(item) {
  const owner = getDatabase().users.find(user => user.id === item.ownerId);
  return {
    ...withImageUrl(item),
    comments: currentCommentNames(item.comments),
    ownerName: owner ? owner.name : 'Participante',
    ownerAvatarUrl: avatarUrl(owner),
    ownerType: owner ? owner.type : 'Doador',
    likedByMe: false
  };
}

module.exports = { avatarUrl, imageUrl, publicDonation, publicPost, safeUser };
