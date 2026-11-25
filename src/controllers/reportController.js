const reportService = require('../services/reportService');
const { requireUser } = require('../middleware/session');
const { readJson, sendJson } = require('../utils/http');

async function create(req, res) {
  const user = requireUser(req, 'Faça login para denunciar.');
  const result = reportService.createReport(user, await readJson(req));
  sendJson(res, result.alreadyReported ? 200 : 201, result);
}

module.exports = { create };
