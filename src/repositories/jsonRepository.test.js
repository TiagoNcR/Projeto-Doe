const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { loadDatabase, normalizeDatabase } = require('./jsonRepository');

test('uses a fresh database only when the file does not exist', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'projeto-doe-json-'));
  try {
    const databasePath = path.join(directory, 'missing.json');
    assert.deepEqual(loadDatabase(databasePath), {
      users: [],
      donations: [],
      posts: [],
      sessions: [],
      messages: [],
      notifications: [],
      reports: [],
      images: {}
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('fails explicitly instead of replacing malformed database data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'projeto-doe-json-'));
  const databasePath = path.join(directory, 'data.json');
  const malformedData = '{"users": [';
  fs.writeFileSync(databasePath, malformedData);

  try {
    assert.throws(
      () => loadDatabase(databasePath),
      error => error.message.includes('contém JSON inválido') && error.cause instanceof SyntaxError
    );
    assert.equal(fs.readFileSync(databasePath, 'utf8'), malformedData);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('fails explicitly when the database path cannot be read', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'projeto-doe-json-'));

  try {
    assert.throws(
      () => loadDatabase(directory),
      error => error.message.includes('Não foi possível ler o banco de dados') && Boolean(error.cause)
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

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

test('moves photos stored inside old records to the images collection', () => {
  const photo = 'data:image/png;base64,AQID';
  const database = normalizeDatabase({
    users: [{ id: 'ana', profileImage: photo }, { id: 'bruno', profileImage: '' }],
    donations: [{ id: 'casaco', image: photo }],
    posts: [{ id: 'aviso', image: '' }]
  });

  const ids = [database.users[0].profileImageId, database.donations[0].imageId];
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) assert.deepEqual(database.images[id], { contentType: 'image/png', data: 'AQID' });
  assert.equal(Object.keys(database.images).length, 2);
  assert.equal('profileImage' in database.users[0], false);
  assert.equal('profileImage' in database.users[1], false);
  assert.equal('image' in database.donations[0], false);
  assert.equal('image' in database.posts[0], false);
  assert.equal(database.posts[0].imageId, undefined);
});
