const notificationService = require('../services/notificationService');
const { requireUser } = require('../middleware/session');
const { sendJson } = require('../utils/http');

function list(req, res) {
  const user = requireUser(req, 'Faça login para ver as notificações.');
  sendJson(res, 200, notificationService.listNotifications(user));
}

function markAllAsRead(req, res) {
  const user = requireUser(req, 'Faça login para ver as notificações.');
  sendJson(res, 200, notificationService.markAllAsRead(user));
}

module.exports = { list, markAllAsRead };
