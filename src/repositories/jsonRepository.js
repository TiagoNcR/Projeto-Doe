const fs = require('fs');
const path = require('path');

const databaseFile = path.join(__dirname, '..', '..', 'data.json');

function defaultDatabase() {
  return {
    users: [],
    donations: [],
    posts: [],
    sessions: [],
    messages: []
  };
}

function loadDatabase(filePath = databaseFile) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return defaultDatabase();
    throw new Error(`Não foi possível ler o banco de dados em "${filePath}".`, { cause: error });
  }

  let value;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`O arquivo de banco de dados "${filePath}" contém JSON inválido.`, { cause: error });
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`O arquivo de banco de dados "${filePath}" deve conter um objeto JSON.`);
  }
  return value;
}

function normalizeDatabase(database) {
  const normalized = database && typeof database === 'object' && !Array.isArray(database)
    ? database
    : {};

  for (const collection of ['users', 'donations', 'posts', 'sessions', 'messages']) {
    if (!Array.isArray(normalized[collection])) normalized[collection] = [];
  }

  for (const user of normalized.users) {
    if (!Array.isArray(user.following)) user.following = [];
  }

  for (const item of [...normalized.donations, ...normalized.posts]) {
    if (!Array.isArray(item.likes)) item.likes = [];
    if (!Array.isArray(item.comments)) item.comments = [];
  }

  for (const donation of normalized.donations) {
    if (!['available', 'reserved', 'delivered'].includes(donation.status)) donation.status = 'available';
    if (!Array.isArray(donation.interests)) donation.interests = [];
    if (typeof donation.reservedFor !== 'string') donation.reservedFor = null;
  }

  for (const message of normalized.messages) {
    if (!Array.isArray(message.readBy)) {
      message.readBy = typeof message.senderId === 'string' ? [message.senderId] : [];
    }
  }

  return normalized;
}

const database = normalizeDatabase(loadDatabase());

function getDatabase() {
  return database;
}

function saveDatabase() {
  fs.writeFileSync(databaseFile, JSON.stringify(database, null, 2));
}

module.exports = { getDatabase, loadDatabase, normalizeDatabase, saveDatabase };
