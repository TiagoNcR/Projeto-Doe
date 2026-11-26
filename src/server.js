const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const repository = require('./repositories/jsonRepository');
const { handleApi } = require('./routes/apiRoutes');
const { sendJson } = require('./utils/http');

// Só estes arquivos são públicos. Os caminhos ficam escritos por extenso de propósito: na Vercel,
// o pacote do servidor leva apenas os arquivos que o código cita assim.
const INDEX_FILE = { file: path.join(__dirname, '..', 'index.html'), type: 'text/html; charset=utf-8' };
const PUBLIC_FILES = new Map([
  ['/', INDEX_FILE],
  ['/index.html', INDEX_FILE],
  ['/css/style.css', { file: path.join(__dirname, '..', 'css', 'style.css'), type: 'text/css; charset=utf-8' }],
  ['/js/app.js', { file: path.join(__dirname, '..', 'js', 'app.js'), type: 'text/javascript; charset=utf-8' }]
]);

function serveStatic(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const entry = PUBLIC_FILES.get(pathname);
  if (!entry) {
    sendJson(res, 404, { error: 'Não encontrado' });
    return;
  }

  fs.readFile(entry.file, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: 'Não encontrado' });
      return;
    }
    // Com o ETag, o navegador confere se o arquivo mudou e recebe 304 sem baixá-lo de novo.
    const etag = `"${crypto.createHash('sha1').update(content).digest('base64url')}"`;
    const headers = { 'Content-Type': entry.type, 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
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

const STORE_NOT_CONFIGURED = 'Banco de dados não configurado. Conecte um banco Redis (Upstash) ao projeto no painel da Vercel e faça um novo deploy.';

async function handleApiRequest(req, res, pathname) {
  if (!repository.usesRemoteStore()) {
    // Na Vercel o disco é somente leitura: sem o Redis, não há onde gravar.
    if (process.env.VERCEL) {
      sendJson(res, 503, { error: STORE_NOT_CONFIGURED });
      return;
    }
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
