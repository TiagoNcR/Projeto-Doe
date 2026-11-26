const { HttpError } = require('./errors');

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendImage(res, image, cacheControl) {
  res.writeHead(200, {
    'Content-Type': image.contentType,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(image.buffer);
}

// Hospedagens sem servidor, como a Vercel, recusam corpos acima de 4,5 MB.
const MAX_BODY_LENGTH = 4 * 1024 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      body += chunk;
      if (body.length > MAX_BODY_LENGTH) {
        settled = true;
        reject(new HttpError(413, 'O envio é grande demais. Tente uma foto menor.'));
        req.resume();
      }
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const data = body ? JSON.parse(body) : {};
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new HttpError(400, 'O corpo da requisição deve ser um objeto JSON.');
        }
        settled = true;
        resolve(data);
      } catch (error) {
        settled = true;
        reject(error instanceof HttpError ? error : new HttpError(400, 'JSON inválido'));
      }
    });
    req.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

module.exports = { MAX_BODY_LENGTH, readJson, sendImage, sendJson };
