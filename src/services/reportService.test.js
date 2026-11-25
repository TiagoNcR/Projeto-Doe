const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
repository.getDatabase = () => database;
repository.saveDatabase = () => {};

const reportService = require('./reportService');

const ana = { id: 'ana', name: 'Ana Souza' };
const bruno = { id: 'bruno', name: 'Bruno Lima' };

beforeEach(() => {
  database = {
    users: [ana, bruno],
    posts: [{ id: 'p-bruno', ownerId: 'bruno', text: 'Promoção imperdível!' }],
    donations: [{ id: 'd-bruno', ownerId: 'bruno', name: 'Casaco' }],
    reports: []
  };
});

test('people can report a profile, a post or a donation', () => {
  for (const [targetType, targetId] of [['user', 'bruno'], ['post', 'p-bruno'], ['donation', 'd-bruno']]) {
    const result = reportService.createReport(ana, { targetType, targetId, reason: 'spam' });
    assert.deepEqual(result, { reported: true, alreadyReported: false });
  }
  assert.deepEqual(database.reports.map(report => [report.targetType, report.targetOwnerId, report.status]), [
    ['user', 'bruno', 'open'], ['post', 'bruno', 'open'], ['donation', 'bruno', 'open']
  ]);
});

test('reporting the same thing twice does not create a duplicate', () => {
  reportService.createReport(ana, { targetType: 'post', targetId: 'p-bruno', reason: 'spam' });
  const again = reportService.createReport(ana, { targetType: 'post', targetId: 'p-bruno', reason: 'golpe' });
  assert.equal(again.alreadyReported, true);
  assert.equal(database.reports.length, 1);
});

test('reports need a valid reason, and "outro" needs a description', () => {
  const badRequest = error => error.status === 400;
  assert.throws(() => reportService.createReport(ana, { targetType: 'post', targetId: 'p-bruno', reason: '' }), badRequest);
  assert.throws(() => reportService.createReport(ana, { targetType: 'post', targetId: 'p-bruno', reason: 'outro' }), badRequest);
  assert.throws(() => reportService.createReport(ana, { targetType: 'comentario', targetId: 'p-bruno', reason: 'spam' }), badRequest);
  const ok = reportService.createReport(ana, { targetType: 'post', targetId: 'p-bruno', reason: 'outro', details: 'Está vendendo roupas em vez de doar.' });
  assert.equal(ok.reported, true);
  assert.equal(database.reports[0].details, 'Está vendendo roupas em vez de doar.');
});

test('people cannot report themselves, their own content, or something that does not exist', () => {
  assert.throws(() => reportService.createReport(bruno, { targetType: 'user', targetId: 'bruno', reason: 'spam' }), error => error.status === 400);
  assert.throws(() => reportService.createReport(bruno, { targetType: 'post', targetId: 'p-bruno', reason: 'spam' }), error => error.status === 400);
  assert.throws(() => reportService.createReport(ana, { targetType: 'post', targetId: 'nada', reason: 'spam' }), error => error.status === 404);
});
