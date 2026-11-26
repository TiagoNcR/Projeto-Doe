const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { storeFromEnvironment } = require('./redisStore');

const databaseFile = path.join(__dirname, '..', '..', 'data.json');

function defaultDatabase() {
  return {
    users: [],
    donations: [],
    posts: [],
    sessions: [],
    messages: [],
    notifications: [],
    reports: []
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

  for (const collection of ['users', 'donations', 'posts', 'sessions', 'messages', 'notifications', 'reports']) {
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

// Sem banco remoto configurado, os dados ficam em data.json, como no uso local.
// Com um Redis configurado (por exemplo, na Vercel), cada requisição chama refresh() antes
// de começar e flush() antes de responder; saveDatabase() apenas marca que houve mudança.
let remoteStore = storeFromEnvironment();
let remoteVersion = null;
let remoteLoaded = false;
let pendingChanges = false;
let queue = Promise.resolve();
let database = remoteStore ? defaultDatabase() : normalizeDatabase(loadDatabase());

function getDatabase() {
  return database;
}

function saveDatabase() {
  if (remoteStore) {
    pendingChanges = true;
    return;
  }
  fs.writeFileSync(databaseFile, JSON.stringify(database, null, 2));
}

function usesRemoteStore() {
  return Boolean(remoteStore);
}

// Usado pelos testes para trocar o Redis por um armazenamento falso.
function useRemoteStore(store) {
  remoteStore = store;
  remoteVersion = null;
  remoteLoaded = false;
  pendingChanges = false;
  database = defaultDatabase();
}

// Baixa os dados só quando outra instância gravou uma versão nova.
async function refresh() {
  if (!remoteStore) return;
  if (remoteLoaded && !pendingChanges && (await remoteStore.readVersion()) === remoteVersion) return;
  const { data, version } = await remoteStore.read();
  database = normalizeDatabase(data || defaultDatabase());
  remoteVersion = version;
  remoteLoaded = true;
  pendingChanges = false;
}

async function flush() {
  if (!remoteStore || !pendingChanges) return;
  const version = crypto.randomUUID();
  try {
    await remoteStore.write(database, version);
    remoteVersion = version;
    pendingChanges = false;
  } catch (error) {
    // As mudanças não foram gravadas: a próxima requisição recarrega o que está no Redis.
    remoteLoaded = false;
    throw error;
  }
}

// Atende uma requisição por vez nesta instância, para que uma não troque os dados no meio da outra.
function runExclusive(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

module.exports = {
  flush,
  getDatabase,
  loadDatabase,
  normalizeDatabase,
  refresh,
  runExclusive,
  saveDatabase,
  useRemoteStore,
  usesRemoteStore
};
