const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeDatabase } = require('./jsonRepository');

test('normalizes missing database collections', () => {
  const database = normalizeDatabase({});

  assert.deepEqual(database.users, []);
  assert.deepEqual(database.donations, []);
  assert.deepEqual(database.posts, []);
  assert.deepEqual(database.sessions, []);
  assert.deepEqual(database.messages, []);
});

test('normalizes social and message fields', () => {
  const database = normalizeDatabase({
    users: [{ id: 'user-1' }],
    donations: [{ id: 'donation-1' }],
    posts: [{ id: 'post-1', likes: null, comments: null }],
    sessions: [],
    messages: [{ senderId: 'user-1', readBy: null }]
  });

  assert.deepEqual(database.users[0].following, []);
  assert.deepEqual(database.donations[0].likes, []);
  assert.deepEqual(database.donations[0].comments, []);
  assert.deepEqual(database.posts[0].likes, []);
  assert.deepEqual(database.posts[0].comments, []);
  assert.deepEqual(database.messages[0].readBy, ['user-1']);
});
