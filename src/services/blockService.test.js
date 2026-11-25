const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
repository.getDatabase = () => database;
repository.saveDatabase = () => {};

const blockService = require('./blockService');
const donationService = require('./donationService');
const feedService = require('./feedService');
const messageService = require('./messageService');
const notificationService = require('./notificationService');
const profileService = require('./profileService');
const socialService = require('./socialService');

const validImage = 'data:image/png;base64,AQID';
let ana;
let bruno;
let carla;

beforeEach(() => {
  ana = { id: 'ana', name: 'Ana Souza', type: 'Doador', following: ['bruno'] };
  bruno = { id: 'bruno', name: 'Bruno Lima', type: 'Beneficiário', following: ['ana'] };
  carla = { id: 'carla', name: 'Carla Dias', type: 'Beneficiário', following: [] };
  database = {
    users: [ana, bruno, carla],
    donations: [],
    posts: [
      { id: 'p-ana', ownerId: 'ana', text: 'Post da Ana', likes: [], comments: [], createdAt: '2026-11-20T10:00:00.000Z' },
      { id: 'p-bruno', ownerId: 'bruno', text: 'Post do Bruno', likes: [], comments: [], createdAt: '2026-11-21T10:00:00.000Z' }
    ],
    messages: [],
    notifications: []
  };
});

const feedIds = user => feedService.listFeed(user).items.map(item => item.id);

test('blocking hides each other\'s posts, comments and conversations, in both directions', () => {
  socialService.addComment(bruno, 'p-ana', { text: 'Comentário do Bruno' }, 'post');
  socialService.addComment(carla, 'p-ana', { text: 'Comentário da Carla' }, 'post');
  messageService.sendMessage(bruno, 'ana', { text: 'Oi Ana' });

  blockService.block(ana, 'bruno');

  assert.deepEqual(feedIds(ana), ['p-ana']);
  assert.deepEqual(feedIds(bruno), ['p-bruno']);
  assert.deepEqual(feedService.listFeed(ana).items[0].comments.map(item => item.name), ['Carla Dias']);
  assert.deepEqual(feedIds(carla), ['p-bruno', 'p-ana'], 'outras pessoas continuam vendo os dois');
  assert.deepEqual(messageService.listConversations(ana).conversations.map(item => item.id), ['carla']);
  assert.deepEqual(messageService.listConversations(bruno).conversations.map(item => item.id), ['carla']);
});

test('blocked people cannot message, follow, like, comment or show interest', () => {
  const donation = donationService.createDonation(ana, { name: 'Casaco', category: 'Casacos', size: 'M', image: validImage });
  blockService.block(ana, 'bruno');

  const forbidden = error => error.status === 403;
  assert.throws(() => messageService.sendMessage(bruno, 'ana', { text: 'Oi' }), forbidden);
  assert.throws(() => messageService.sendMessage(ana, 'bruno', { text: 'Oi' }), forbidden);
  assert.throws(() => messageService.listMessages(bruno, 'ana'), forbidden);
  assert.throws(() => socialService.toggleFollow(bruno, 'ana'), forbidden);
  assert.throws(() => socialService.toggleLike(bruno, 'p-ana', 'post'), forbidden);
  assert.throws(() => socialService.addComment(bruno, 'p-ana', { text: 'Oi' }, 'post'), forbidden);
  assert.throws(() => donationService.expressInterest(bruno, donation.id), forbidden);
  assert.equal(donationService.searchDonations(bruno, {}).items.length, 0);
});

test('blocking removes follows, interests, reservations and notifications between the two', () => {
  const donation = donationService.createDonation(ana, { name: 'Casaco', category: 'Casacos', size: 'M', image: validImage });
  donationService.expressInterest(bruno, donation.id);
  donationService.updateDonationStatus(ana, donation.id, { status: 'reserved', reservedFor: 'bruno' });
  socialService.toggleLike(bruno, 'p-ana', 'post');
  assert.ok(notificationService.listNotifications(ana).notifications.length > 0);

  blockService.block(ana, 'bruno');

  assert.deepEqual(ana.following, []);
  assert.deepEqual(bruno.following, []);
  assert.equal(database.donations[0].status, 'available');
  assert.equal(database.donations[0].reservedFor, null);
  assert.deepEqual(database.donations[0].interests, []);
  assert.equal(notificationService.listNotifications(ana).notifications.length, 0);
  assert.equal(notificationService.listNotifications(bruno).notifications.length, 0);
});

test('the blocker sees a minimal profile to unblock; the blocked person cannot find the profile', () => {
  blockService.block(ana, 'bruno');

  const asBlocker = profileService.getProfile(ana, 'bruno');
  assert.equal(asBlocker.blockedByMe, true);
  assert.deepEqual(asBlocker.items, []);
  assert.throws(() => profileService.getProfile(bruno, 'ana'), error => error.status === 404);
  assert.deepEqual(blockService.listBlocked(ana).blocked.map(item => item.name), ['Bruno Lima']);
});

test('unblocking restores visibility but not the old follows', () => {
  blockService.block(ana, 'bruno');
  blockService.unblock(ana, 'bruno');

  assert.deepEqual(feedIds(ana), ['p-bruno', 'p-ana']);
  assert.doesNotThrow(() => messageService.sendMessage(bruno, 'ana', { text: 'Oi de novo' }));
  assert.deepEqual(ana.following, []);
  assert.equal(profileService.getProfile(bruno, 'ana').blockedByMe, false);
});

test('people cannot block themselves', () => {
  assert.throws(() => blockService.block(ana, 'ana'), error => error.status === 400);
  assert.throws(() => blockService.block(ana, 'ninguem'), error => error.status === 404);
});
