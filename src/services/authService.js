const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return {
    salt,
    hash: crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  };
}

function register(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const type = String(body.type || 'Doador');
  const password = String(body.password || '');

  if (name.length < 3 || !email.includes('@') || password.length < 6) {
    throw new HttpError(400, 'Confira nome, e-mail e senha (mínimo 6 caracteres).');
  }

  const database = getDatabase();
  if (database.users.some(user => user.email === email)) {
    throw new HttpError(409, 'Este e-mail já está cadastrado.');
  }

  const passwordData = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    type,
    createdAt: new Date().toISOString(),
    ...passwordData
  };
  const session = { id: crypto.randomBytes(32).toString('hex'), userId: user.id };
  database.users.push(user);
  database.sessions.push(session);
  saveDatabase();
  return { user, sessionId: session.id };
}

function login(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = getDatabase().users.find(item => item.email === email);
  if (!user) throw new HttpError(401, 'E-mail ou senha incorretos.');

  const candidate = hashPassword(password, user.salt).hash;
  if (!crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(user.hash))) {
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }

  const session = { id: crypto.randomBytes(32).toString('hex'), userId: user.id };
  getDatabase().sessions.push(session);
  saveDatabase();
  return { user, sessionId: session.id };
}

function logout(id) {
  const database = getDatabase();
  database.sessions = database.sessions.filter(session => session.id !== id);
  saveDatabase();
}

module.exports = { login, logout, register };
