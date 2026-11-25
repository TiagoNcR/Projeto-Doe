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

function registerPerson(email = 'pessoa@exemplo.com', password = 'senha-antiga') {
  return authService.register({ name: 'Pessoa Exemplo', email, type: 'Doador', password });
}

test('profile name and type can be edited with the same rules as registration', () => {
  const { user } = registerPerson();
  authService.updateProfile(user, { name: '  Pessoa Renomeada  ', type: 'Ambos' });
  assert.equal(user.name, 'Pessoa Renomeada');
  assert.equal(user.type, 'Ambos');

  assert.throws(() => authService.updateProfile(user, { name: 'AB' }), error => error.status === 400);
  assert.throws(() => authService.updateProfile(user, { type: 'Administrador' }), error => error.status === 400);
  assert.equal(user.name, 'Pessoa Renomeada', 'dados inválidos não alteram o perfil');
});

test('changing the password requires the current one and logs out the other sessions', () => {
  const { user, sessionId: firstSession } = registerPerson();
  const { sessionId: otherSession } = authService.login({ email: 'pessoa@exemplo.com', password: 'senha-antiga' });
  const other = registerPerson('outra@exemplo.com');

  assert.throws(
    () => authService.changePassword(user, firstSession, { currentPassword: 'errada', newPassword: 'senha-nova' }),
    error => error.status === 400
  );
  assert.throws(
    () => authService.changePassword(user, firstSession, { currentPassword: 'senha-antiga', newPassword: '123' }),
    error => error.status === 400
  );

  const result = authService.changePassword(user, firstSession, { currentPassword: 'senha-antiga', newPassword: 'senha-nova' });
  assert.equal(result.endedSessions, 1);
  const sessionIds = database.sessions.map(session => session.id);
  assert.ok(sessionIds.includes(firstSession), 'a sessão atual continua aberta');
  assert.ok(!sessionIds.includes(otherSession), 'as outras sessões da pessoa são encerradas');
  assert.ok(sessionIds.includes(other.sessionId), 'sessões de outras pessoas não são afetadas');

  assert.throws(() => authService.login({ email: 'pessoa@exemplo.com', password: 'senha-antiga' }), error => error.status === 401);
  assert.ok(authService.login({ email: 'pessoa@exemplo.com', password: 'senha-nova' }).sessionId);
});
