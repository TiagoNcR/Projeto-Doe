const donationService = require('../services/donationService');
const socialService = require('../services/socialService');
const { currentUser, requireUser } = require('../middleware/session');
const { readJson, sendJson } = require('../utils/http');

function feed(req, res) {
  const filter = new URL(req.url, 'http://localhost').searchParams.get('filter');
  sendJson(res, 200, donationService.listDonations(currentUser(req), filter));
}

async function create(req, res) {
  const user = requireUser(req, 'Faça login para cadastrar uma doação.');
  const donation = donationService.createDonation(user, await readJson(req));
  sendJson(res, 201, { donation });
}

function like(req, res, donationId) {
  const user = requireUser(req, 'Faça login para curtir.');
  sendJson(res, 200, socialService.toggleLike(user, donationId));
}

async function comment(req, res, donationId) {
  const user = requireUser(req, 'Faça login para comentar.');
  await socialService.addComment(user, donationId, await readJson(req));
  sendJson(res, 201, { ok: true });
}

function remove(req, res, donationId) {
  const user = requireUser(req, 'Faça login.');
  donationService.removeDonation(user, donationId);
  sendJson(res, 200, { ok: true });
}

module.exports = { comment, create, feed, like, remove };
