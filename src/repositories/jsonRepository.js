const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { storeFromEnvironment } = require('./redisStore');

const databaseFile = path.join(__dirname, '..', '..', 'data.json');
const IMAGE_CACHE_LIMIT_BYTES = 32 * 1024 * 1024;

function defaultDatabase() {
  return {
    users: [],
    donations: [],
    posts: [],
    sessions: [],
    messages: [],
    notifications: [],
    reports: [],
    images: {}
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

// Converte "data:image/png;base64,..." em { contentType, data }; devolve null se não for uma imagem.
function inlineImageRecord(value) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value || ''));
  return match ? { contentType: match[1], data: match[2] } : null;
}

// Versões anteriores guardavam a foto dentro do próprio registro. Agora cada foto fica na
// coleção `images` e o registro guarda só o identificador.
function moveInlineImage(record, field, idField, images) {
  if (!(field in record)) return;
  const image = inlineImageRecord(record[field]);
  if (image && !record[idField]) {
    const id = crypto.randomUUID();
    images[id] = image;
    record[idField] = id;
  }
  delete record[field];
}

function normalizeDatabase(database) {
  const normalized = database && typeof database === 'object' && !Array.isArray(database)
    ? database
    : {};

  for (const collection of ['users', 'donations', 'posts', 'sessions', 'messages', 'notifications', 'reports']) {
    if (!Array.isArray(normalized[collection])) normalized[collection] = [];
  }
  if (!normalized.images || typeof normalized.images !== 'object' || Array.isArray(normalized.images)) {
    normalized.images = {};
  }

  for (const user of normalized.users) {
    if (!Array.isArray(user.following)) user.following = [];
    moveInlineImage(user, 'profileImage', 'profileImageId', normalized.images);
  }

  for (const item of [...normalized.donations, ...normalized.posts]) {
    if (!Array.isArray(item.likes)) item.likes = [];
    if (!Array.isArray(item.comments)) item.comments = [];
    moveInlineImage(item, 'image', 'imageId', normalized.images);
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
// No Redis, cada foto fica em uma chave própria e só é baixada quando alguém a abre.
let remoteStore = storeFromEnvironment();
let remoteVersion = null;
let remoteLoaded = false;
let pendingChanges = false;
let pendingImages = new Map();
let deletedImages = new Set();
const imageCache = new Map();
let imageCacheBytes = 0;
let queue = Promise.resolve();
let database = remoteStore ? defaultDatabase() : normalizeDatabase(loadDatabase());

function getDatabase() {
  return database;
}

// Os testes dos services trocam getDatabase; as funções de imagem seguem essa troca.
function activeDatabase() {
  return module.exports.getDatabase();
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

function clearImageCache() {
  imageCache.clear();
  imageCacheBytes = 0;
}

function cacheImage(id, image) {
  const size = image.data.length;
  if (size > IMAGE_CACHE_LIMIT_BYTES) return;
  imageCache.delete(id);
  imageCache.set(id, image);
  imageCacheBytes += size;
  for (const [oldId, oldImage] of imageCache) {
    if (imageCacheBytes <= IMAGE_CACHE_LIMIT_BYTES) break;
    imageCache.delete(oldId);
    imageCacheBytes -= oldImage.data.length;
  }
}

// Usado pelos testes para trocar o Redis por um armazenamento falso.
function useRemoteStore(store) {
  remoteStore = store;
  remoteVersion = null;
  remoteLoaded = false;
  pendingChanges = false;
  pendingImages = new Map();
  deletedImages = new Set();
  clearImageCache();
  database = defaultDatabase();
}

// Fotos que ainda estão dentro do banco (dados antigos) passam para chaves próprias.
function moveImagesOutOfRemoteDatabase() {
  for (const [id, image] of Object.entries(database.images)) {
    pendingImages.set(id, image);
    pendingChanges = true;
  }
  database.images = {};
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
  pendingImages = new Map();
  deletedImages = new Set();
  moveImagesOutOfRemoteDatabase();
}

async function flush() {
  if (!remoteStore || !pendingChanges) return;
  const version = crypto.randomUUID();
  try {
    // As fotos são gravadas antes dos dados, para nenhum registro apontar para uma foto ausente.
    for (const [id, image] of pendingImages) await remoteStore.writeImage(id, image);
    await remoteStore.write(database, version);
    remoteVersion = version;
    pendingChanges = false;
    for (const [id, image] of pendingImages) cacheImage(id, image);
    pendingImages = new Map();
  } catch (error) {
    // As mudanças não foram gravadas: a próxima requisição recarrega o que está no Redis.
    remoteLoaded = false;
    throw error;
  }

  if (deletedImages.size) {
    const ids = [...deletedImages];
    deletedImages = new Set();
    for (const id of ids) {
      const cached = imageCache.get(id);
      if (cached) imageCacheBytes -= cached.data.length;
      imageCache.delete(id);
    }
    // Uma foto que não foi apagada só ocupa espaço; os dados já estão gravados.
    await remoteStore.deleteImages(ids).catch(error => console.error(error));
  }
}

// Guarda uma foto enviada como data URL e devolve o identificador dela.
function putImage(dataUrl) {
  const image = inlineImageRecord(dataUrl);
  if (!image) throw new Error('A foto precisa estar no formato data URL.');
  const id = crypto.randomUUID();
  if (remoteStore) {
    pendingImages.set(id, image);
    pendingChanges = true;
  } else {
    const current = activeDatabase();
    if (!current.images) current.images = {};
    current.images[id] = image;
  }
  return id;
}

function deleteImage(id) {
  if (!id) return;
  if (remoteStore) {
    if (!pendingImages.delete(id)) deletedImages.add(id);
    pendingChanges = true;
  } else if (activeDatabase().images) {
    delete activeDatabase().images[id];
  }
}

async function getImage(id) {
  let image = null;
  if (!remoteStore) {
    image = (activeDatabase().images || {})[id] || null;
  } else if (!deletedImages.has(id)) {
    image = pendingImages.get(id) || imageCache.get(id) || null;
    if (!image) {
      image = await remoteStore.readImage(id);
      if (image) cacheImage(id, image);
    }
  }
  return image ? { contentType: image.contentType, buffer: Buffer.from(image.data, 'base64') } : null;
}

// Atende uma requisição por vez nesta instância, para que uma não troque os dados no meio da outra.
function runExclusive(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

module.exports = {
  deleteImage,
  flush,
  getDatabase,
  getImage,
  loadDatabase,
  normalizeDatabase,
  putImage,
  refresh,
  runExclusive,
  saveDatabase,
  useRemoteStore,
  usesRemoteStore
};
