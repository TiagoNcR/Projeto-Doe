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

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      body += chunk;
      if (body.length > 6 * 1024 * 1024) {
        settled = true;
        reject(new HttpError(413, 'Corpo da requisição muito grande'));
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

module.exports = { readJson, sendImage, sendJson };
