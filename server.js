const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data.json');

function defaultDb() {
  return { users: [], donations: [], sessions: [] };
}

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return defaultDb();
  }
}

let db = readDb();

function writeDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return {
    salt,
    hash: crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  };
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, type: user.type, createdAt: user.createdAt };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    return index === -1 ? [part.trim(), ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function currentUser(req) {
  const sessionId = parseCookies(req).projeto_doe_session;
  const session = db.sessions.find(item => item.id === sessionId);
  if (!session) return null;
  return db.users.find(user => user.id === session.userId) || null;
}

function setCookie(res, value) {
  res.setHeader('Set-Cookie', `projeto_doe_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', 'projeto_doe_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 6 * 1024 * 1024) {
        reject(new Error('Corpo da requisição muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
  });
}

function publicDonation(item) {
  const owner = db.users.find(user => user.id === item.ownerId);
  return {
    ...item,
    ownerName: owner ? owner.name : 'Participante',
    ownerType: owner ? owner.type : 'Doador',
    likedByMe: false
  };
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    pathname = '/';
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(ROOT, relative));
  if (!filePath.startsWith(ROOT) || filePath === path.join(ROOT, 'data.json')) {
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

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url === '/api/me') {
    const user = currentUser(req);
    sendJson(res, 200, { user: user ? safeUser(user) : null });
    return;
  }

  if (req.method === 'POST' && url === '/api/auth/register') {
    try {
      const body = await readJson(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const type = String(body.type || 'Doador');
      const password = String(body.password || '');
      if (name.length < 3 || !email.includes('@') || password.length < 6) {
        sendJson(res, 400, { error: 'Confira nome, e-mail e senha (mínimo 6 caracteres).' });
        return;
      }
      if (db.users.some(user => user.email === email)) {
        sendJson(res, 409, { error: 'Este e-mail já está cadastrado.' });
        return;
      }
      const passwordData = hashPassword(password);
      const user = { id: crypto.randomUUID(), name, email, type, createdAt: new Date().toISOString(), ...passwordData };
      db.users.push(user);
      const session = { id: crypto.randomBytes(32).toString('hex'), userId: user.id };
      db.sessions.push(session);
      writeDb();
      setCookie(res, session.id);
      sendJson(res, 201, { user: safeUser(user) });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/auth/login') {
    try {
      const body = await readJson(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = db.users.find(item => item.email === email);
      if (!user) {
        sendJson(res, 401, { error: 'E-mail ou senha incorretos.' });
        return;
      }
      const candidate = hashPassword(password, user.salt).hash;
      if (!crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(user.hash))) {
        sendJson(res, 401, { error: 'E-mail ou senha incorretos.' });
        return;
      }
      const session = { id: crypto.randomBytes(32).toString('hex'), userId: user.id };
      db.sessions.push(session);
      writeDb();
      setCookie(res, session.id);
      sendJson(res, 200, { user: safeUser(user) });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/auth/logout') {
    const sessionId = parseCookies(req).projeto_doe_session;
    db.sessions = db.sessions.filter(session => session.id !== sessionId);
    writeDb();
    clearCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url === '/api/feed') {
    const user = currentUser(req);
    const donations = db.donations.slice().reverse().map(item => ({
      ...publicDonation(item),
      likedByMe: Boolean(user && item.likes.includes(user.id))
    }));
    sendJson(res, 200, { donations });
    return;
  }

  if (req.method === 'POST' && url === '/api/donations') {
    const user = currentUser(req);
    if (!user) {
      sendJson(res, 401, { error: 'Faça login para cadastrar uma doação.' });
      return;
    }
    try {
      const body = await readJson(req);
      const name = String(body.name || '').trim();
      if (!name) {
        sendJson(res, 400, { error: 'Informe o nome da peça.' });
        return;
      }
      if (body.image && (!String(body.image).startsWith('data:image/') || String(body.image).length > 5 * 1024 * 1024)) {
        sendJson(res, 400, { error: 'Envie uma imagem válida com até 5 MB.' });
        return;
      }
      const donation = {
        id: crypto.randomUUID(),
        name,
        category: String(body.category || 'Outros'),
        size: String(body.size || 'Único'),
        condition: String(body.condition || 'Boa'),
        description: String(body.description || '').trim().slice(0, 180),
        image: String(body.image || ''),
        ownerId: user.id,
        likes: [],
        comments: [],
        createdAt: new Date().toISOString()
      };
      db.donations.push(donation);
      writeDb();
      sendJson(res, 201, { donation: publicDonation(donation) });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const likeMatch = url.match(/^\/api\/donations\/([^/]+)\/like$/);
  if (likeMatch && req.method === 'POST') {
    const user = currentUser(req);
    if (!user) {
      sendJson(res, 401, { error: 'Faça login para curtir.' });
      return;
    }
    const donation = db.donations.find(item => item.id === likeMatch[1]);
    if (!donation) {
      sendJson(res, 404, { error: 'Doação não encontrada.' });
      return;
    }
    if (donation.likes.includes(user.id)) donation.likes = donation.likes.filter(id => id !== user.id);
    else donation.likes.push(user.id);
    writeDb();
    sendJson(res, 200, { liked: donation.likes.includes(user.id), likes: donation.likes.length });
    return;
  }

  const commentMatch = url.match(/^\/api\/donations\/([^/]+)\/comments$/);
  if (commentMatch && req.method === 'POST') {
    const user = currentUser(req);
    if (!user) {
      sendJson(res, 401, { error: 'Faça login para comentar.' });
      return;
    }
    try {
      const body = await readJson(req);
      const text = String(body.text || '').trim().slice(0, 180);
      if (!text) {
        sendJson(res, 400, { error: 'Escreva um comentário.' });
        return;
      }
      const donation = db.donations.find(item => item.id === commentMatch[1]);
      if (!donation) {
        sendJson(res, 404, { error: 'Doação não encontrada.' });
        return;
      }
      donation.comments.push({ id: crypto.randomUUID(), userId: user.id, name: user.name, text, createdAt: new Date().toISOString() });
      writeDb();
      sendJson(res, 201, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const deleteMatch = url.match(/^\/api\/donations\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const user = currentUser(req);
    if (!user) {
      sendJson(res, 401, { error: 'Faça login.' });
      return;
    }
    const donation = db.donations.find(item => item.id === deleteMatch[1]);
    if (!donation) {
      sendJson(res, 404, { error: 'Doação não encontrada.' });
      return;
    }
    if (donation.ownerId !== user.id) {
      sendJson(res, 403, { error: 'Você só pode excluir suas próprias doações.' });
      return;
    }
    db.donations = db.donations.filter(item => item.id !== deleteMatch[1]);
    writeDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'Rota não encontrada.' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost').pathname;
  if (url.startsWith('/api/')) handleApi(req, res, url);
  else serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Projeto Doe rodando em http://localhost:${PORT}`);
});
