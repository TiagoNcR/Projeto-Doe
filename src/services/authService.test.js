const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
let saveCount;
repository.getDatabase = () => database;
repository.saveDatabase = () => { saveCount += 1; };

const authService = require('./authService');

beforeEach(() => {
  database = { users: [], sessions: [] };
  saveCount = 0;
});

test('rejects malformed email addresses during registration', () => {
  for (const email of ['plain-address', 'user@', 'user@localhost', 'user name@example.com', 'user..name@example.com']) {
    assert.throws(
      () => authService.register({
        name: 'Pessoa Exemplo',
        email,
        type: 'Doador',
        password: 'senha-segura'
      }),
      error => error.status === 400
    );
  }
  assert.equal(database.users.length, 0);
  assert.equal(saveCount, 0);
});

test('rejects unsupported participant types during registration', () => {
  assert.throws(
    () => authService.register({
      name: 'Pessoa Exemplo',
      email: 'pessoa@example.com',
      type: 'Administrador',
      password: 'senha-segura'
    }),
    error => error.status === 400
  );
  assert.equal(database.users.length, 0);
  assert.equal(saveCount, 0);
});

test('registers a valid email and participant type', () => {
  const result = authService.register({
    name: 'Pessoa Exemplo',
    email: 'Pessoa+Doe@example.com',
    type: 'Beneficiário',
    password: 'senha-segura'
  });

  assert.equal(result.user.email, 'pessoa+doe@example.com');
  assert.equal(result.user.type, 'Beneficiário');
  assert.equal(database.users.length, 1);
  assert.equal(saveCount, 1);
});
