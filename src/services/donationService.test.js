const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
repository.getDatabase = () => database;
repository.saveDatabase = () => {};

const donationService = require('./donationService');

const owner = { id: 'owner-1', name: 'Pessoa Doadora', type: 'Doador', following: [] };
const interested = { id: 'interested-1', name: 'Pessoa Interessada', type: 'Beneficiário', following: [] };
const other = { id: 'other-1', name: 'Outra Pessoa', type: 'Beneficiário', following: [] };
const validImage = 'data:image/png;base64,AQID';

function createDonation() {
  return donationService.createDonation(owner, {
    name: 'Casaco de lã',
    category: 'Casacos',
    size: 'M',
    condition: 'Boa',
    image: validImage
  });
}

beforeEach(() => {
  database = {
    users: [owner, interested, other],
    donations: [],
    posts: [],
    messages: []
  };
});

test('new donations start available and without interests', () => {
  const donation = createDonation();
  assert.equal(donation.status, 'available');
  assert.equal(donation.interestCount, 0);
  assert.deepEqual(donation.interests, []);
});

test('expressing interest records it once and messages the owner only once', () => {
  const { id } = createDonation();

  const first = donationService.expressInterest(interested, id);
  const second = donationService.expressInterest(interested, id);

  assert.equal(first.contactId, owner.id);
  assert.equal(first.alreadyInterested, false);
  assert.equal(second.alreadyInterested, true);
  assert.equal(first.donation.interestedByMe, true);
  assert.equal(database.donations[0].interests.length, 1);
  assert.equal(database.messages.length, 1);
  assert.equal(database.messages[0].senderId, interested.id);
  assert.equal(database.messages[0].recipientId, owner.id);
  assert.match(database.messages[0].text, /Casaco de lã/);
});

test('owners cannot express interest in their own donation', () => {
  const { id } = createDonation();
  assert.throws(() => donationService.expressInterest(owner, id), error => error.status === 400);
});

test('reserved or delivered donations reject new interest but keep the conversation for interested people', () => {
  const { id } = createDonation();
  donationService.expressInterest(interested, id);
  donationService.updateDonationStatus(owner, id, { status: 'reserved', reservedFor: interested.id });

  assert.throws(() => donationService.expressInterest(other, id), error => error.status === 409);
  assert.equal(donationService.expressInterest(interested, id).contactId, owner.id);

  donationService.updateDonationStatus(owner, id, { status: 'delivered' });
  assert.throws(() => donationService.expressInterest(other, id), error => error.status === 409);
});

test('only the owner can change the status, and only to valid values', () => {
  const { id } = createDonation();
  assert.throws(
    () => donationService.updateDonationStatus(interested, id, { status: 'delivered' }),
    error => error.status === 403
  );
  assert.throws(
    () => donationService.updateDonationStatus(owner, id, { status: 'sold' }),
    error => error.status === 400
  );
});

test('a donation can only be reserved for someone who expressed interest', () => {
  const { id } = createDonation();
  assert.throws(
    () => donationService.updateDonationStatus(owner, id, { status: 'reserved' }),
    error => error.status === 400
  );
  assert.throws(
    () => donationService.updateDonationStatus(owner, id, { status: 'reserved', reservedFor: other.id }),
    error => error.status === 400
  );
});

test('reserving notifies the chosen person once, delivering keeps them and making available clears them', () => {
  const { id } = createDonation();
  donationService.expressInterest(interested, id);

  const reserved = donationService.updateDonationStatus(owner, id, { status: 'reserved', reservedFor: interested.id });
  donationService.updateDonationStatus(owner, id, { status: 'reserved', reservedFor: interested.id });
  assert.equal(reserved.status, 'reserved');
  assert.equal(reserved.reservedFor, interested.id);
  const notices = database.messages.filter(message => message.senderId === owner.id);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].recipientId, interested.id);

  const delivered = donationService.updateDonationStatus(owner, id, { status: 'delivered' });
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.reservedFor, interested.id);

  const available = donationService.updateDonationStatus(owner, id, { status: 'available' });
  assert.equal(available.reservedFor, null);
});

test('only the owner sees who is interested; others see the count and their own state', () => {
  const { id } = createDonation();
  donationService.expressInterest(interested, id);
  donationService.updateDonationStatus(owner, id, { status: 'reserved', reservedFor: interested.id });

  const asOwner = donationService.listDonations(owner).donations[0];
  const asInterested = donationService.listDonations(interested).donations[0];
  const asOther = donationService.listDonations(other).donations[0];

  assert.deepEqual(asOwner.interests.map(item => item.name), [interested.name]);
  assert.equal(asInterested.interests, undefined);
  assert.equal(asInterested.reservedFor, undefined);
  assert.equal(asInterested.reservedForMe, true);
  assert.equal(asOther.interestCount, 1);
  assert.equal(asOther.interestedByMe, false);
  assert.equal(asOther.reservedForMe, false);
});

function addDonation(fields) {
  return donationService.createDonation(owner, { category: 'Outros', size: 'M', condition: 'Boa', image: validImage, ...fields });
}

test('search ignores accents and case, and matches the start of words in name, description or category', () => {
  addDonation({ name: 'Calça jeans', category: 'Calças', size: '38' });
  addDonation({ name: 'Blusa', description: 'Tecido de LÃ, bem quentinha', category: 'Camisetas' });
  addDonation({ name: 'Tênis branco', category: 'Calçados' });

  const names = query => donationService.searchDonations(other, { q: query }).items.map(item => item.name);
  assert.deepEqual(names('calca jeans'), ['Calça jeans']);
  // "calça" e "calçados" começam igual, então a busca por "calca" encontra os dois
  assert.deepEqual(names('calca'), ['Tênis branco', 'Calça jeans']);
  assert.deepEqual(names('LA quentinha'), ['Blusa']);
  assert.deepEqual(names('calcados'), ['Tênis branco']);
  assert.deepEqual(names('TEN'), ['Tênis branco']);
  assert.deepEqual(names('usa'), []);
  assert.deepEqual(names('tenis preto'), []);
  assert.equal(names('').length, 3);
});

test('search filters by exact category and size, newest first', () => {
  addDonation({ name: 'Casaco infantil', category: 'Casacos', size: 'Infantil' });
  addDonation({ name: 'Casaco adulto', category: 'Casacos', size: 'G' });
  addDonation({ name: 'Camiseta infantil', category: 'Camisetas', size: 'Infantil' });

  const names = criteria => donationService.searchDonations(other, criteria).items.map(item => item.name);
  assert.deepEqual(names({ category: 'Casacos' }), ['Casaco adulto', 'Casaco infantil']);
  assert.deepEqual(names({ size: 'Infantil' }), ['Camiseta infantil', 'Casaco infantil']);
  assert.deepEqual(names({ category: 'Casacos', size: 'Infantil' }), ['Casaco infantil']);
});

test('search can show only available donations, keeping the feed shape', () => {
  const reserved = addDonation({ name: 'Casaco reservado', category: 'Casacos' });
  addDonation({ name: 'Casaco livre', category: 'Casacos' });
  donationService.expressInterest(interested, reserved.id);
  donationService.updateDonationStatus(owner, reserved.id, { status: 'reserved', reservedFor: interested.id });

  const all = donationService.searchDonations(other, { category: 'Casacos' }).items;
  const available = donationService.searchDonations(other, { category: 'Casacos', onlyAvailable: true }).items;
  assert.equal(all.length, 2);
  assert.deepEqual(available.map(item => item.name), ['Casaco livre']);
  assert.equal(available[0].kind, 'donation');
  assert.equal(available[0].interests, undefined);
});
