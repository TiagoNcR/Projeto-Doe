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
  Object.assign(store, { data: null, version: null, reads: 0, failWrites: false });
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
