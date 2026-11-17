const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');

const MAX_PROFILE_IMAGE_LENGTH = 3 * 1024 * 1024;

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

function parseProfileImage(image) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  return match ? { contentType: match[1], base64: match[2] } : null;
}

function updateProfileImage(user, value) {
  const image = typeof value === 'string' ? value : '';
  if (image.length > MAX_PROFILE_IMAGE_LENGTH || !parseProfileImage(image)) {
    throw new HttpError(400, 'A foto deve ser PNG, JPG ou WebP e ter até 2 MB.');
  }

  user.profileImage = image;
  user.profileImageUpdatedAt = new Date().toISOString();
  saveDatabase();
  return user;
}

function getProfileImage(userId) {
  const user = getDatabase().users.find(item => item.id === userId);
  if (!user) throw new HttpError(404, 'Participante não encontrado.');

  const image = parseProfileImage(user.profileImage || '');
  if (!image) throw new HttpError(404, 'Foto de perfil não encontrada.');
  return { contentType: image.contentType, buffer: Buffer.from(image.base64, 'base64') };
}

module.exports = { getProfileImage, login, logout, register, updateProfileImage };
