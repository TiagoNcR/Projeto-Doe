const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
let saveCount;
repository.getDatabase = () => database;
repository.saveDatabase = () => { saveCount += 1; };

const notificationService = require('./notificationService');
const socialService = require('./socialService');
const donationService = require('./donationService');

let ana;
let bruno;
const validImage = 'data:image/png;base64,AQID';

beforeEach(() => {
  ana = { id: 'ana', name: 'Ana Souza', type: 'Doador', following: [] };
  bruno = { id: 'bruno', name: 'Bruno Lima', type: 'Beneficiário', following: [] };
  database = {
    users: [ana, bruno],
    donations: [],
    posts: [{ id: 'p1', ownerId: 'ana', text: 'Separei várias roupas de inverno para doar esta semana!', likes: [], comments: [] }],
    messages: [],
    notifications: []
  };
  saveCount = 0;
});

const listFor = user => notificationService.listNotifications(user);

test('liking notifies the owner once; unliking removes the notification', () => {
  socialService.toggleLike(bruno, 'p1', 'post');
  let result = listFor(ana);
  assert.equal(result.unreadCount, 1);
  assert.equal(result.notifications[0].type, 'like');
  assert.equal(result.notifications[0].actor.name, 'Bruno Lima');
  assert.equal(result.notifications[0].itemLabel, 'Separei várias roupas de inverno para do…');

  socialService.toggleLike(bruno, 'p1', 'post');
  assert.equal(listFor(ana).notifications.length, 0);

  socialService.toggleLike(bruno, 'p1', 'post');
  socialService.toggleLike(bruno, 'p1', 'post');
  socialService.toggleLike(bruno, 'p1', 'post');
  assert.equal(listFor(ana).notifications.length, 1);
});

test('people are never notified about their own actions', () => {
  socialService.toggleLike(ana, 'p1', 'post');
  socialService.addComment(ana, 'p1', { text: 'Ainda tenho mais!' }, 'post');
  assert.equal(listFor(ana).notifications.length, 0);
});

test('comments notify the owner with a preview of the text', () => {
  socialService.addComment(bruno, 'p1', { text: 'Que legal! Tenho interesse nos casacos.' }, 'post');
  const [notification] = listFor(ana).notifications;
  assert.equal(notification.type, 'comment');
  assert.equal(notification.preview, 'Que legal! Tenho interesse nos casacos.');
  assert.equal(notification.itemKind, 'post');
});

test('following notifies the person; unfollowing removes it', () => {
  socialService.toggleFollow(bruno, 'ana');
  assert.equal(listFor(ana).notifications[0].type, 'follow');
  socialService.toggleFollow(bruno, 'ana');
  assert.equal(listFor(ana).notifications.length, 0);
});

test('interest in a donation notifies the owner once', () => {
  const donation = donationService.createDonation(ana, { name: 'Casaco de lã', category: 'Casacos', size: 'M', image: validImage });
  donationService.expressInterest(bruno, donation.id);
  donationService.expressInterest(bruno, donation.id);

  const interests = listFor(ana).notifications.filter(item => item.type === 'interest');
  assert.equal(interests.length, 1);
  assert.equal(interests[0].itemLabel, 'Casaco de lã');
  assert.equal(interests[0].itemId, donation.id);
});

test('notifications are listed newest first, only for their recipient, and can be marked as read', () => {
  socialService.toggleFollow(bruno, 'ana');
  socialService.addComment(bruno, 'p1', { text: 'Oi!' }, 'post');

  assert.deepEqual(listFor(ana).notifications.map(item => item.type), ['comment', 'follow']);
  assert.equal(listFor(bruno).notifications.length, 0);

  saveCount = 0;
  notificationService.markAllAsRead(ana);
  assert.equal(listFor(ana).unreadCount, 0);
  assert.ok(listFor(ana).notifications.every(item => item.read));
  assert.equal(saveCount, 1);
  notificationService.markAllAsRead(ana);
  assert.equal(saveCount, 1, 'não salva de novo quando nada mudou');
});

test('each person keeps at most the 100 most recent notifications', () => {
  for (let index = 0; index < 105; index += 1) {
    notificationService.addNotification({ recipientId: 'ana', actorId: 'bruno', type: 'comment', itemId: 'p1', preview: `#${index}` });
  }
  const stored = database.notifications.filter(item => item.userId === 'ana');
  assert.equal(stored.length, 100);
  assert.equal(stored[0].preview, '#5');
  assert.equal(listFor(ana).notifications.length, 30);
  assert.equal(listFor(ana).unreadCount, 100);
});

test('the unread count used by the bell matches the notification list and respects blocks', () => {
  socialService.toggleLike(bruno, 'p1', 'post');
  socialService.toggleFollow(bruno, 'ana');
  assert.equal(notificationService.countUnread(ana), listFor(ana).unreadCount);
  assert.equal(notificationService.countUnread(ana), 2);

  ana.blocked = ['bruno'];
  assert.equal(notificationService.countUnread(ana), 0);
  delete ana.blocked;

  notificationService.markAllAsRead(ana);
  assert.equal(notificationService.countUnread(ana), 0);
});
