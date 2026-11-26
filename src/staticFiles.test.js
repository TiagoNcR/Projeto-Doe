const assert = require('node:assert/strict');
const { after, afterEach, before, test } = require('node:test');
const repository = require('./repositories/jsonRepository');
const { createServer } = require('./server');

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

afterEach(() => {
  delete process.env.VERCEL;
});

test('serves the page, the stylesheet and the script with their types', async () => {
  for (const [pathname, type] of [
    ['/', 'text/html'],
    ['/index.html', 'text/html'],
    ['/css/style.css', 'text/css'],
    ['/js/app.js', 'text/javascript']
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get('content-type'), new RegExp(type), pathname);
  }
});

test('nothing else in the project folder is public', async () => {
  for (const pathname of ['/data.json', '/server.js', '/src/server.js', '/package.json', '/README.md', '/css/../data.json', '/js/nao-existe.js']) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 404, pathname);
  }
});

test('unchanged files answer 304 so the browser reuses its copy', async () => {
  const first = await fetch(`${baseUrl}/css/style.css`);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const again = await fetch(`${baseUrl}/css/style.css`, { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
});

test('on Vercel without Redis, the API explains what is missing instead of failing to write', async () => {
  repository.useRemoteStore(null);
  process.env.VERCEL = '1';
  const response = await fetch(`${baseUrl}/api/me`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Redis/);
  assert.equal((await fetch(`${baseUrl}/css/style.css`)).status, 200);
});
