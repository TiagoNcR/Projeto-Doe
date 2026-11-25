const authController = require('../controllers/authController');
const donationController = require('../controllers/donationController');
const messageController = require('../controllers/messageController');
const postController = require('../controllers/postController');
const socialController = require('../controllers/socialController');
const { HttpError } = require('../utils/errors');
const { sendJson } = require('../utils/http');

const routes = [
  { method: 'GET', pattern: /^\/api\/me$/, handler: authController.me },
  { method: 'POST', pattern: /^\/api\/auth\/register$/, handler: authController.register },
  { method: 'POST', pattern: /^\/api\/auth\/login$/, handler: authController.login },
  { method: 'PUT', pattern: /^\/api\/auth\/avatar$/, handler: authController.updateAvatar },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/, handler: authController.logout },
  { method: 'GET', pattern: /^\/api\/events$/, handler: postController.events },
  { method: 'GET', pattern: /^\/api\/feed$/, handler: donationController.feed },
  { method: 'GET', pattern: /^\/api\/users\/([^/]+)\/avatar$/, handler: authController.avatar },
  { method: 'POST', pattern: /^\/api\/users\/([^/]+)\/follow$/, handler: socialController.toggleFollow },
  { method: 'GET', pattern: /^\/api\/users\/([^/]+)\/profile$/, handler: socialController.profile },
  { method: 'GET', pattern: /^\/api\/conversations$/, handler: messageController.conversations },
  {
    method: 'GET',
    pattern: /^\/api\/conversations\/([^/]+)\/messages$/,
    handler: messageController.messages
  },
  {
    method: 'POST',
    pattern: /^\/api\/conversations\/([^/]+)\/messages$/,
    handler: messageController.send
  },
  { method: 'POST', pattern: /^\/api\/posts$/, handler: postController.create },
  { method: 'POST', pattern: /^\/api\/posts\/([^/]+)\/like$/, handler: postController.like },
  { method: 'POST', pattern: /^\/api\/posts\/([^/]+)\/comments$/, handler: postController.comment },
  { method: 'DELETE', pattern: /^\/api\/posts\/([^/]+)$/, handler: postController.remove },
  { method: 'POST', pattern: /^\/api\/donations$/, handler: donationController.create },
  { method: 'POST', pattern: /^\/api\/donations\/([^/]+)\/like$/, handler: donationController.like },
  {
    method: 'POST',
    pattern: /^\/api\/donations\/([^/]+)\/comments$/,
    handler: donationController.comment
  },
  {
    method: 'POST',
    pattern: /^\/api\/donations\/([^/]+)\/interest$/,
    handler: donationController.interest
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/donations\/([^/]+)\/status$/,
    handler: donationController.updateStatus
  },
  { method: 'DELETE', pattern: /^\/api\/donations\/([^/]+)$/, handler: donationController.remove }
];

async function handleApi(req, res, pathname) {
  const route = routes.find(item => item.method === req.method && item.pattern.test(pathname));
  if (!route) {
    sendJson(res, 404, { error: 'Rota não encontrada.' });
    return;
  }

  const params = pathname.match(route.pattern).slice(1);
  try {
    await route.handler(req, res, ...params);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    console.error(error);
    sendJson(res, 500, { error: 'Erro interno do servidor.' });
  }
}

module.exports = { handleApi };
