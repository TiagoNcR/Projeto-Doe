const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const repository = require('./repositories/jsonRepository');
const handler = require('../api/index');

const store = {
  data: null,
  version: null,
  images: new Map(),
  async readVersion() { return this.version; },
  async read() { return { data: this.data ? JSON.parse(this.data) : null, version: this.version }; },
  async write(database, version) { this.data = JSON.stringify(database); this.version = version; },
  async readImage(id) { return this.images.get(id) || null; },
  async writeImage(id, image) { this.images.set(id, image); },
  async deleteImages(ids) { for (const id of ids) this.images.delete(id); }
};

let server;
let baseUrl;

before(async () => {
  // A Vercel chama a função com o req/res do Node, como um servidor http comum.
  server = http.createServer((req, res) => handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

test('the Vercel function answers every API route through the usual router', async () => {
  repository.useRemoteStore(store);

  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ana Souza', email: 'ana@exemplo.com', password: 'segredo1', type: 'Doador' })
  });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get('set-cookie').split(';')[0];

  const me = await (await fetch(`${baseUrl}/api/me`, { headers: { cookie } })).json();
  assert.equal(me.user.email, 'ana@exemplo.com');
  assert.equal(JSON.parse(store.data).users.length, 1);

  const unknown = await fetch(`${baseUrl}/api/nao-existe`);
  assert.equal(unknown.status, 404);
});

test('without a database configured, the function explains what is missing', async () => {
  repository.useRemoteStore(null);
  const response = await fetch(`${baseUrl}/api/me`);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /Redis/);
});
