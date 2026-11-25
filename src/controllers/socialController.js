const blockService = require('../services/blockService');
const profileService = require('../services/profileService');
const socialService = require('../services/socialService');
const { requireUser } = require('../middleware/session');
const { sendJson } = require('../utils/http');

function toggleFollow(req, res, userId) {
  const user = requireUser(req, 'Faça login para seguir participantes.');
  sendJson(res, 200, socialService.toggleFollow(user, userId));
}

function profile(req, res, userId) {
  const user = requireUser(req, 'Faça login para ver perfis.');
  sendJson(res, 200, profileService.getProfile(user, userId));
}

function block(req, res, userId) {
  const user = requireUser(req, 'Faça login para bloquear participantes.');
  sendJson(res, 200, blockService.block(user, userId));
}

function unblock(req, res, userId) {
  const user = requireUser(req, 'Faça login para desbloquear participantes.');
  sendJson(res, 200, blockService.unblock(user, userId));
}

function listBlocked(req, res) {
  const user = requireUser(req, 'Faça login para ver quem você bloqueou.');
  sendJson(res, 200, blockService.listBlocked(user));
}

module.exports = { block, listBlocked, profile, toggleFollow, unblock };
