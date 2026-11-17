const socialService = require('../services/socialService');
const { requireUser } = require('../middleware/session');
const { sendJson } = require('../utils/http');

function toggleFollow(req, res, userId) {
  const user = requireUser(req, 'Faça login para seguir participantes.');
  sendJson(res, 200, socialService.toggleFollow(user, userId));
}

module.exports = { toggleFollow };
