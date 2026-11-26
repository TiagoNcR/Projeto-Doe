const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
const repository = require('./repositories/jsonRepository');
const { createServer } = require('./server');

// Simula o Redis guardando o banco como texto, como a API REST faz.
const store = {
  data: null,
  version: null,
  reads: 0,
  failWrites: false,
  images: new Map(),
  async readVersion() {
    return this.version;
  },
  async read() {
    this.reads += 1;
    return { data: this.data ? JSON.parse(this.data) : null, version: this.version };
  },
  async write(database, version) {
    if (this.failWrites) throw new Error('Redis fora do ar');
    this.data = JSON.stringify(database);
    this.version = version;
  },
  async readImage(id) {
    return this.images.has(id) ? JSON.parse(this.images.get(id)) : null;
  },
  async writeImage(id, image) {
    if (this.failWrites) throw new Error('Redis fora do ar');
    this.images.set(id, JSON.stringify(image));
  },
  async deleteImages(ids) {
    for (const id of ids) this.images.delete(id);
  }
};

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

beforeEach(() => {
  Object.assign(store, { data: null, version: null, reads: 0, failWrites: false, images: new Map() });
  repository.useRemoteStore(store);
});

function register(email) {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ana Souza', email, password: 'segredo1', type: 'Doador' })
  });
}

test('with a remote store, changes are saved there before the response is sent', async () => {
  const response = await register('ana@exemplo.com');
  assert.equal(response.status, 201);
  assert.ok(response.headers.get('set-cookie'));

  const saved = JSON.parse(store.data);
  assert.equal(saved.users.length, 1);
  assert.equal(saved.users[0].email, 'ana@exemplo.com');
  assert.equal(saved.sessions.length, 1);

  const cookie = response.headers.get('set-cookie').split(';')[0];
  const me = await (await fetch(`${baseUrl}/api/me`, { headers: { cookie } })).json();
  assert.equal(me.user.email, 'ana@exemplo.com');
});

test('reads the data again only when another instance saved a new version', async () => {
  await register('ana@exemplo.com');
  const readsAfterRegister = store.reads;

  await fetch(`${baseUrl}/api/feed`);
  assert.equal(store.reads, readsAfterRegister);

  const changed = JSON.parse(store.data);
  changed.users[0].name = 'Ana Atualizada';
  store.data = JSON.stringify(changed);
  store.version = 'outra-instancia';

  await fetch(`${baseUrl}/api/feed`);
  assert.equal(store.reads, readsAfterRegister + 1);
  assert.equal(repository.getDatabase().users[0].name, 'Ana Atualizada');
});

test('when saving fails, the request fails and no session cookie is handed out', async () => {
  store.failWrites = true;
  const response = await register('ana@exemplo.com');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match((await response.json()).error, /banco de dados/);

  store.failWrites = false;
  await fetch(`${baseUrl}/api/feed`);
  assert.equal(repository.getDatabase().users.length, 0);
});

async function signUp(email) {
  const response = await register(email);
  return response.headers.get('set-cookie').split(';')[0];
}

test('photos are kept in their own keys and served with a long cache', async () => {
  const cookie = await signUp('ana@exemplo.com');
  const created = await fetch(`${baseUrl}/api/donations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Casaco', category: 'Casacos', size: 'M', image: 'data:image/png;base64,AQID' })
  });
  assert.equal(created.status, 201);
  const { donation } = await created.json();
  assert.match(donation.image, /^\/api\/images\/[0-9a-f-]{36}$/);

  assert.equal(store.images.size, 1);
  assert.doesNotMatch(store.data, /AQID/);
  assert.deepEqual(JSON.parse(store.data).images, {});

  const photo = await fetch(`${baseUrl}${donation.image}`, { headers: { cookie } });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');
  assert.match(photo.headers.get('cache-control'), /immutable/);
  assert.deepEqual([...new Uint8Array(await photo.arrayBuffer())], [1, 2, 3]);

  assert.equal((await fetch(`${baseUrl}${donation.image}`)).status, 401);

  const removed = await fetch(`${baseUrl}/api/donations/${donation.id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(removed.status, 200);
  assert.equal(store.images.size, 0);
  assert.equal((await fetch(`${baseUrl}${donation.image}`, { headers: { cookie } })).status, 404);
});

test('photos saved inside the database by older versions move to their own keys', async () => {
  const cookie = await signUp('ana@exemplo.com');
  const legacy = JSON.parse(store.data);
  legacy.donations.push({ id: 'antiga', name: 'Calça', ownerId: legacy.users[0].id, image: 'data:image/png;base64,AQID' });
  store.data = JSON.stringify(legacy);
  store.version = 'versao-antiga';

  const feed = await (await fetch(`${baseUrl}/api/feed`, { headers: { cookie } })).json();
  const item = feed.items.find(entry => entry.id === 'antiga');
  assert.match(item.image, /^\/api\/images\//);
  assert.equal(store.images.size, 1);
  assert.doesNotMatch(store.data, /AQID/);
  assert.equal((await fetch(`${baseUrl}${item.image}`, { headers: { cookie } })).status, 200);
});

test('requests stay below the 4.5 MB accepted by serverless hosts', async () => {
  const cookie = await signUp('ana@exemplo.com');
  const post = image => fetch(`${baseUrl}/api/donations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Casaco', category: 'Casacos', size: 'M', image })
  });
  const photoOf = bytes => `data:image/jpeg;base64,${Buffer.alloc(bytes, 7).toString('base64')}`;

  const tooLargeBody = await post(photoOf(3.2 * 1024 * 1024));
  assert.equal(tooLargeBody.status, 413);
  assert.match((await tooLargeBody.json()).error, /grande demais/);

  const tooLargePhoto = await post(photoOf(2.6 * 1024 * 1024));
  assert.equal(tooLargePhoto.status, 400);
  assert.match((await tooLargePhoto.json()).error, /2,5 MB/);

  assert.equal((await post(photoOf(2.4 * 1024 * 1024))).status, 201);
});
