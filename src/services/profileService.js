const { getDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');
const { avatarUrl } = require('../utils/serializers');
const feedService = require('./feedService');

// Perfil público: não inclui e-mail nem outros dados de conta.
function getProfile(viewer, userId) {
  const database = getDatabase();
  const user = database.users.find(item => item.id === userId);
  if (!user) throw new HttpError(404, 'Participante não encontrado.');

  const items = feedService.listFeed(viewer).items.filter(item => item.ownerId === user.id);
  const donations = items.filter(item => item.kind === 'donation');
  const following = Array.isArray(user.following) ? user.following : [];
  const viewerFollowing = Array.isArray(viewer.following) ? viewer.following : [];

  return {
    profile: {
      id: user.id,
      name: user.name,
      type: user.type,
      avatarUrl: avatarUrl(user),
      createdAt: user.createdAt
    },
    isMe: viewer.id === user.id,
    followingUser: viewerFollowing.includes(user.id),
    stats: {
      followers: database.users.filter(item =>
        Array.isArray(item.following) && item.following.includes(user.id)
      ).length,
      following: following.length,
      donations: donations.length,
      delivered: donations.filter(item => item.status === 'delivered').length,
      posts: items.length - donations.length
    },
    items
  };
}

module.exports = { getProfile };
