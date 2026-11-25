const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
repository.getDatabase = () => database;
repository.saveDatabase = () => {};

const postService = require('./postService');

const organizer = { id: 'organizer-1', name: 'Instituição Exemplo', type: 'Instituição/Organizador' };
const donor = { id: 'donor-1', name: 'Pessoa Doadora', type: 'Doador' };
const validImage = 'data:image/png;base64,AQID';

beforeEach(() => {
  database = {
    users: [organizer, donor],
    posts: [],
    donations: []
  };
});

test('only institutions and organizers can add an event date to a post', () => {
  assert.throws(
    () => postService.createPost(donor, { text: 'Atividade', eventDate: '2026-04-15', image: validImage }),
    error => error.status === 403
  );
  assert.equal(postService.createPost(donor, { text: 'Publicação comum', image: validImage }).eventDate, undefined);
});

test('posts can be text-only', () => {
  assert.equal(postService.createPost(donor, { text: 'Mensagem somente textual' }).text, 'Mensagem somente textual');
});

test('event dates must be valid calendar dates', () => {
  assert.throws(
    () => postService.createPost(organizer, { text: 'Atividade', eventDate: '2026-02-30', image: validImage }),
    error => error.status === 400
  );
});

test('calendar results include only dated posts from the requested month', () => {
  postService.createPost(organizer, { text: 'Mutirão', eventDate: '2026-04-15', image: validImage });
  postService.createPost(organizer, { text: 'Encontro', eventDate: '2026-05-01', image: validImage });
  postService.createPost(organizer, { text: 'Aviso sem data', image: validImage });

  const events = postService.listEvents(donor, '2026-04');
  assert.equal(events.length, 1);
  assert.equal(events[0].text, 'Mutirão');
  assert.equal(events[0].ownerName, organizer.name);
  assert.equal(events[0].eventDate, '2026-04-15');
  assert.throws(() => postService.listEvents(donor, '2026-13'), error => error.status === 400);
});

test('calendar hides activities from people blocked in either direction', () => {
  postService.createPost(organizer, { text: 'Mutirão', eventDate: '2026-04-15', image: validImage });

  donor.blocked = ['organizer-1'];
  assert.equal(postService.listEvents(donor, '2026-04').length, 0);

  donor.blocked = [];
  organizer.blocked = ['donor-1'];
  assert.equal(postService.listEvents(donor, '2026-04').length, 0);
  assert.equal(postService.listEvents(organizer, '2026-04').length, 1);

  delete organizer.blocked;
  delete donor.blocked;
  assert.equal(postService.listEvents(donor, '2026-04').length, 1);
});
