const messageService = require('../services/messageService');
const { requireUser } = require('../middleware/session');
const { readJson, sendJson } = require('../utils/http');

function conversations(req, res) {
  const user = requireUser(req, 'Faça login para acessar suas mensagens.');
  sendJson(res, 200, messageService.listConversations(user));
}

function messages(req, res, contactId) {
  const user = requireUser(req, 'Faça login para acessar suas mensagens.');
  sendJson(res, 200, messageService.listMessages(user, contactId));
}

async function send(req, res, contactId) {
  const user = requireUser(req, 'Faça login para acessar suas mensagens.');
  const result = messageService.sendMessage(user, contactId, await readJson(req));
  sendJson(res, 201, result);
}

module.exports = { conversations, messages, send };
