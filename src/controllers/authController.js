const authService = require('../services/authService');
const { clearSessionCookie, currentUser, requireUser, sessionId, setSessionCookie } = require('../middleware/session');
const { readJson, sendJson } = require('../utils/http');
const { safeUser } = require('../utils/serializers');

function me(req, res) {
  const user = currentUser(req);
  sendJson(res, 200, { user: user ? safeUser(user) : null });
}

async function register(req, res) {
  const result = authService.register(await readJson(req));
  setSessionCookie(res, result.sessionId);
  sendJson(res, 201, { user: safeUser(result.user) });
}

async function login(req, res) {
  const result = authService.login(await readJson(req));
  setSessionCookie(res, result.sessionId);
  sendJson(res, 200, { user: safeUser(result.user) });
}

async function updateAvatar(req, res) {
  const user = requireUser(req, 'Faça login para alterar sua foto de perfil.');
  const body = await readJson(req);
  sendJson(res, 200, { user: safeUser(authService.updateProfileImage(user, body.image)) });
}

async function updateProfile(req, res) {
  const user = requireUser(req, 'Faça login para editar seu perfil.');
  sendJson(res, 200, { user: safeUser(authService.updateProfile(user, await readJson(req))) });
}

async function changePassword(req, res) {
  const user = requireUser(req, 'Faça login para alterar sua senha.');
  sendJson(res, 200, authService.changePassword(user, sessionId(req), await readJson(req)));
}

function avatar(req, res, userId) {
  requireUser(req, 'Faça login para visualizar fotos de perfil.');
  const image = authService.getProfileImage(userId);
  res.writeHead(200, {
    'Content-Type': image.contentType,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(image.buffer);
}

function logout(req, res) {
  authService.logout(sessionId(req));
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

module.exports = { avatar, changePassword, login, logout, me, register, updateAvatar, updateProfile };
