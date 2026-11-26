const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRedisStore, storeFromEnvironment } = require('./redisStore');

function fakeUpstash() {
  const keys = new Map();
  const calls = [];
  async function fetchImpl(url, options) {
    calls.push({ url, options, command: JSON.parse(options.body) });
    const [name, ...args] = JSON.parse(options.body);
    let result;
    if (name === 'GET') result = keys.has(args[0]) ? keys.get(args[0]) : null;
    if (name === 'MGET') result = args.map(key => (keys.has(key) ? keys.get(key) : null));
    if (name === 'MSET') {
      for (let index = 0; index < args.length; index += 2) keys.set(args[index], args[index + 1]);
      result = 'OK';
    }
    return { ok: true, status: 200, json: async () => ({ result }) };
  }
  return { calls, fetchImpl, keys };
}

test('talks to the Upstash REST API with the token and keeps data and version together', async () => {
  const upstash = fakeUpstash();
  const store = createRedisStore({ url: 'https://exemplo.upstash.io', token: 'segredo', fetchImpl: upstash.fetchImpl });

  assert.deepEqual(await store.read(), { data: null, version: null });
  await store.write({ users: [{ id: 'ana' }] }, 'v1');

  assert.equal(upstash.calls[0].url, 'https://exemplo.upstash.io');
  assert.equal(upstash.calls[0].options.headers.Authorization, 'Bearer segredo');
  assert.deepEqual(upstash.calls[1].command, ['MSET', 'projeto-doe:data', '{"users":[{"id":"ana"}]}', 'projeto-doe:version', 'v1']);
  assert.equal(await store.readVersion(), 'v1');
  assert.deepEqual(await store.read(), { data: { users: [{ id: 'ana' }] }, version: 'v1' });
});

test('reports Redis errors instead of pretending the data was saved', async () => {
  const store = createRedisStore({
    url: 'https://exemplo.upstash.io',
    token: 'errado',
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'WRONGPASS invalid token' }) })
  });
  await assert.rejects(store.write({}, 'v1'), error => error.message.includes('WRONGPASS'));
});

test('uses Redis only when the connection variables exist', () => {
  assert.equal(storeFromEnvironment({}), null);
  assert.ok(storeFromEnvironment({ KV_REST_API_URL: 'https://a', KV_REST_API_TOKEN: 'b' }));
  assert.ok(storeFromEnvironment({ UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 'b' }));
  assert.equal(storeFromEnvironment({ KV_REST_API_URL: 'https://a' }), null);
});
