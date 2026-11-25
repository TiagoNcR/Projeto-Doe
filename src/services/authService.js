const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');
const { parseDataImage } = require('../utils/images');

const MAX_PROFILE_IMAGE_LENGTH = 3 * 1024 * 1024;
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const PROFILE_IMAGE_ERROR = 'A foto deve ser PNG, JPG ou WebP e ter até 2 MB.';
const PROFILE_TYPES = new Set([
  'Doador',
  'Beneficiário',
  'Ambos',
  'Instituição/Organizador'
]);

function isValidEmail(email) {
  if (email.length > 254) return false;
  const [localPart, ...domainParts] = email.split('@');
  if (!localPart || domainParts.length !== 1 || !domainParts[0]) return false;
  if (localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false;
  }
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) return false;

  const domainLabels = domainParts[0].split('.');
  return domainLabels.length >= 2 && domainLabels.every(label =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
  );
}

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

  if (name.length < 3 || !isValidEmail(email) || password.length < 6) {
    throw new HttpError(400, 'Confira nome, e-mail válido e senha (mínimo 6 caracteres).');
  }
  if (!PROFILE_TYPES.has(type)) {
    throw new HttpError(400, 'Selecione um tipo de participante válido.');
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

function updateProfile(user, body) {
  const name = String(body.name ?? user.name).trim();
  const type = String(body.type ?? user.type);
  if (name.length < 3 || name.length > 80) {
    throw new HttpError(400, 'O nome deve ter entre 3 e 80 caracteres.');
  }
  if (!PROFILE_TYPES.has(type)) {
    throw new HttpError(400, 'Selecione um tipo de participante válido.');
  }
  user.name = name;
  user.type = type;
  saveDatabase();
  return user;
}

// Troca a senha e encerra as outras sessões da pessoa, mantendo a atual aberta.
function changePassword(user, currentSessionId, body) {
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  const candidate = hashPassword(currentPassword, user.salt).hash;
  if (!crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(user.hash))) {
    throw new HttpError(400, 'A senha atual está incorreta.');
  }
  if (newPassword.length < 6) {
    throw new HttpError(400, 'A nova senha deve ter pelo menos 6 caracteres.');
  }
  if (newPassword === currentPassword) {
    throw new HttpError(400, 'A nova senha deve ser diferente da atual.');
  }

  Object.assign(user, hashPassword(newPassword));
  const database = getDatabase();
  const before = database.sessions.length;
  database.sessions = database.sessions.filter(session =>
    session.userId !== user.id || session.id === currentSessionId
  );
  saveDatabase();
  return { endedSessions: before - database.sessions.length };
}

function updateProfileImage(user, value) {
  const image = typeof value === 'string' ? value : '';
  if (image.length > MAX_PROFILE_IMAGE_LENGTH) {
    throw new HttpError(400, PROFILE_IMAGE_ERROR);
  }
  parseDataImage(image, MAX_PROFILE_IMAGE_BYTES, PROFILE_IMAGE_ERROR);

  user.profileImage = image;
  user.profileImageUpdatedAt = new Date().toISOString();
  saveDatabase();
  return user;
}

function getProfileImage(userId) {
  const user = getDatabase().users.find(item => item.id === userId);
  if (!user) throw new HttpError(404, 'Participante não encontrado.');

  let image;
  try {
    image = parseDataImage(user.profileImage || '', MAX_PROFILE_IMAGE_BYTES, PROFILE_IMAGE_ERROR);
  } catch {
    image = null;
  }
  if (!image) throw new HttpError(404, 'Foto de perfil não encontrada.');
  return { contentType: image.contentType, buffer: image.buffer };
}

module.exports = {
  changePassword,
  getProfileImage,
  login,
  logout,
  register,
  updateProfile,
  updateProfileImage
};
