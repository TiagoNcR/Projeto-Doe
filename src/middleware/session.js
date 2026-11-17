const { getDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    return index === -1
      ? [part.trim(), '']
      : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sessionId(req) {
  return parseCookies(req).projeto_doe_session;
}

function currentUser(req) {
  const database = getDatabase();
  const session = database.sessions.find(item => item.id === sessionId(req));
  if (!session) return null;
  return database.users.find(user => user.id === session.userId) || null;
}

function requireUser(req, message = 'Faça login para continuar.') {
  const user = currentUser(req);
  if (!user) throw new HttpError(401, message);
  return user;
}

function setSessionCookie(res, value) {
  res.setHeader('Set-Cookie', `projeto_doe_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'projeto_doe_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

module.exports = { clearSessionCookie, currentUser, requireUser, sessionId, setSessionCookie };
