const http = require('http');
const fs = require('fs');
const path = require('path');
const repository = require('./repositories/jsonRepository');
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

const STORE_UNAVAILABLE = 'Não foi possível acessar o banco de dados. Tente novamente em instantes.';

// Segura a resposta montada pelo controller até os dados serem gravados.
function holdResponse(res) {
  const writeHead = res.writeHead;
  const end = res.end;
  let head = null;
  let body = null;
  res.writeHead = (...args) => { head = args; return res; };
  res.end = (...args) => { body = args; return res; };

  function restore() {
    res.writeHead = writeHead;
    res.end = end;
  }

  return {
    send() {
      restore();
      if (head) res.writeHead(...head);
      res.end(...(body || []));
    },
    fail() {
      restore();
      res.removeHeader('Set-Cookie');
      sendJson(res, 503, { error: STORE_UNAVAILABLE });
    }
  };
}

async function handleApiRequest(req, res, pathname) {
  if (!repository.usesRemoteStore()) {
    await handleApi(req, res, pathname);
    return;
  }

  await repository.runExclusive(async () => {
    try {
      await repository.refresh();
    } catch (error) {
      console.error(error);
      sendJson(res, 503, { error: STORE_UNAVAILABLE });
      return;
    }

    const response = holdResponse(res);
    await handleApi(req, res, pathname);
    try {
      await repository.flush();
      response.send();
    } catch (error) {
      console.error(error);
      response.fail();
    }
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      handleApiRequest(req, res, pathname).catch(error => {
        console.error(error);
        if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno do servidor.' });
      });
      return;
    }
    serveStatic(req, res);
  });
}

module.exports = { createServer, handleApiRequest };
