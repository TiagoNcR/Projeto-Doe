const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./routes/apiRoutes');
const { sendJson } = require('./utils/http');

const root = path.resolve(__dirname, '..');

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    pathname = '/';
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(root, relative));
  const relativePath = path.relative(root, filePath);
  const isPublicFile = relativePath === 'index.html' ||
    relativePath.startsWith(`css${path.sep}`) ||
    relativePath.startsWith(`js${path.sep}`);
  if (path.isAbsolute(relativePath) || relativePath.startsWith(`..${path.sep}`) || !isPublicFile) {
    sendJson(res, 404, { error: 'Não encontrado' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: 'Não encontrado' });
      return;
    }
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      handleApi(req, res, pathname);
      return;
    }
    serveStatic(req, res);
  });
}

module.exports = { createServer };
