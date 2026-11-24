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

function loadDatabase() {
  try {
    const value = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('O conteúdo de data.json não é um objeto.');
    }
    return value;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Não foi possível carregar data.json.', error.message);
    }
    return defaultDatabase();
  }
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

module.exports = { getDatabase, normalizeDatabase, saveDatabase };
