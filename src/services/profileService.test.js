const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
repository.getDatabase = () => database;
repository.saveDatabase = () => {};

const profileService = require('./profileService');

const validImage = 'data:image/png;base64,AQID';
let ana;
let bruno;
let carla;

function donation(id, ownerId, status) {
  return {
    id, ownerId, status, name: `Peça ${id}`, category: 'Casacos', size: 'M', condition: 'Boa',
    image: validImage, interests: [], reservedFor: null, likes: [], comments: [],
    createdAt: '2026-11-20T10:00:00.000Z'
  };
}

beforeEach(() => {
  ana = { id: 'ana', name: 'Ana Souza', email: 'ana@exemplo.com', type: 'Doador', following: [], createdAt: '2026-01-10T00:00:00.000Z' };
  bruno = { id: 'bruno', name: 'Bruno Lima', email: 'bruno@exemplo.com', type: 'Beneficiário', following: ['ana'], createdAt: '2026-02-10T00:00:00.000Z' };
  carla = { id: 'carla', name: 'Carla Dias', email: 'carla@exemplo.com', type: 'Beneficiário', following: ['ana', 'bruno'], createdAt: '2026-03-10T00:00:00.000Z' };
  database = {
    users: [ana, bruno, carla],
    donations: [donation('d1', 'ana', 'available'), donation('d2', 'ana', 'delivered'), donation('d3', 'bruno', 'available')],
    posts: [
      { id: 'p1', ownerId: 'ana', text: 'Olá!', likes: [], comments: [], createdAt: '2026-11-21T10:00:00.000Z' },
      { id: 'p2', ownerId: 'carla', text: 'Oi', likes: [], comments: [], createdAt: '2026-11-22T10:00:00.000Z' }
    ],
    messages: []
  };
});

test('profile shows public data and counts, without the e-mail', () => {
  const result = profileService.getProfile(bruno, 'ana');

  assert.deepEqual(result.profile, {
    id: 'ana', name: 'Ana Souza', type: 'Doador', avatarUrl: '', createdAt: '2026-01-10T00:00:00.000Z'
  });
  assert.equal(JSON.stringify(result.profile).includes('@'), false);
  assert.deepEqual(result.stats, { followers: 2, following: 0, donations: 2, delivered: 1, posts: 1 });
});

test('profile lists only the items of that person, newest first', () => {
  const result = profileService.getProfile(bruno, 'ana');
  assert.deepEqual(result.items.map(item => item.id), ['p1', 'd2', 'd1']);
  assert.ok(result.items.every(item => item.ownerId === 'ana'));
});

test('profile tells whether the viewer follows the person or is the person', () => {
  assert.equal(profileService.getProfile(bruno, 'ana').followingUser, true);
  assert.equal(profileService.getProfile(bruno, 'ana').isMe, false);
  assert.equal(profileService.getProfile(ana, 'bruno').followingUser, false);
  assert.equal(profileService.getProfile(ana, 'ana').isMe, true);
});

test('unknown profiles return 404', () => {
  assert.throws(() => profileService.getProfile(ana, 'nobody'), error => error.status === 404);
});
