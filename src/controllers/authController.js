const authService = require('../services/authService');
const { clearSessionCookie, currentUser, sessionId, setSessionCookie } = require('../middleware/session');
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

function logout(req, res) {
  authService.logout(sessionId(req));
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

module.exports = { login, logout, me, register };
