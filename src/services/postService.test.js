const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
repository.getDatabase = () => database;
repository.saveDatabase = () => {};

const postService = require('./postService');

const organizer = { id: 'organizer-1', name: 'Instituição Exemplo', type: 'Instituição/Organizador' };
const donor = { id: 'donor-1', name: 'Pessoa Doadora', type: 'Doador' };

beforeEach(() => {
  database = {
    users: [organizer, donor],
    posts: [],
    donations: []
  };
});

test('only institutions and organizers can add an event date to a post', () => {
  assert.throws(
    () => postService.createPost(donor, { text: 'Atividade', eventDate: '2026-04-15' }),
    error => error.status === 403
  );
  assert.equal(postService.createPost(donor, { text: 'Publicação comum' }).eventDate, undefined);
});

test('event dates must be valid calendar dates', () => {
  assert.throws(
    () => postService.createPost(organizer, { text: 'Atividade', eventDate: '2026-02-30' }),
    error => error.status === 400
  );
});

test('calendar results include only dated posts from the requested month', () => {
  postService.createPost(organizer, { text: 'Mutirão', eventDate: '2026-04-15' });
  postService.createPost(organizer, { text: 'Encontro', eventDate: '2026-05-01' });
  postService.createPost(organizer, { text: 'Aviso sem data' });

  const events = postService.listEvents('2026-04');
  assert.equal(events.length, 1);
  assert.equal(events[0].text, 'Mutirão');
  assert.equal(events[0].ownerName, organizer.name);
  assert.equal(events[0].eventDate, '2026-04-15');
  assert.throws(() => postService.listEvents('2026-13'), error => error.status === 400);
});
