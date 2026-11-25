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
