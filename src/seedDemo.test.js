const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('./repositories/jsonRepository');
const authService = require('./services/authService');
const { DEMO_PASSWORD, PEOPLE, seedDemo } = require('../scripts/seed-demo');

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

beforeEach(() => {
  Object.assign(store, { data: null, version: null, images: new Map() });
  repository.useRemoteStore(store);
});

test('fills an empty remote database with demo accounts, donations and conversations', async () => {
  const counts = await seedDemo({ log: () => {} });
  assert.equal(counts.users, Object.keys(PEOPLE).length);
  assert.ok(counts.donations >= 8 && counts.posts >= 4 && counts.messages > 0 && counts.notifications > 0);

  const saved = JSON.parse(store.data);
  assert.equal(saved.sessions.length, 0);
  assert.equal(store.images.size, saved.donations.length + saved.posts.filter(post => post.imageId).length);
  assert.deepEqual(saved.images, {});
  assert.deepEqual(new Set(saved.donations.map(item => item.status)), new Set(['available', 'reserved', 'delivered']));

  // Datas espalhadas no passado e atividades no futuro.
  const created = saved.donations.map(item => Date.parse(item.createdAt));
  assert.ok(Math.max(...created) - Math.min(...created) > 12 * 60 * 60 * 1000);
  assert.ok(Math.max(...created) <= Date.now());
  const today = new Date().toISOString().slice(0, 10);
  for (const post of saved.posts.filter(item => item.eventDate)) assert.ok(post.eventDate > today);

  await repository.refresh();
  const login = authService.login({ email: PEOPLE.ana.email, password: DEMO_PASSWORD });
  assert.equal(login.user.name, PEOPLE.ana.name);
});

test('refuses to replace existing data unless forced', async () => {
  await seedDemo({ log: () => {} });
  const firstVersion = store.version;
  await assert.rejects(seedDemo({ log: () => {} }), /--force/);
  assert.equal(store.version, firstVersion);

  const imagesBefore = new Set(store.images.keys());
  await seedDemo({ force: true, log: () => {} });
  assert.notEqual(store.version, firstVersion);
  assert.equal(JSON.parse(store.data).users.length, Object.keys(PEOPLE).length);
  for (const id of imagesBefore) assert.equal(store.images.has(id), false);
});
