const donationService = require('../services/donationService');
const feedService = require('../services/feedService');
const socialService = require('../services/socialService');
const { currentUser, requireUser } = require('../middleware/session');
const { readJson, sendJson } = require('../utils/http');

function feed(req, res) {
  const filter = new URL(req.url, 'http://localhost').searchParams.get('filter');
  sendJson(res, 200, feedService.listFeed(currentUser(req), filter));
}

async function create(req, res) {
  const user = requireUser(req, 'Faça login para cadastrar uma doação.');
  const donation = donationService.createDonation(user, await readJson(req));
  sendJson(res, 201, { donation });
}

function like(req, res, donationId) {
  const user = requireUser(req, 'Faça login para curtir.');
  sendJson(res, 200, socialService.toggleLike(user, donationId, 'donation'));
}

async function comment(req, res, donationId) {
  const user = requireUser(req, 'Faça login para comentar.');
  await socialService.addComment(user, donationId, await readJson(req), 'donation');
  sendJson(res, 201, { ok: true });
}

function remove(req, res, donationId) {
  const user = requireUser(req, 'Faça login.');
  donationService.removeDonation(user, donationId);
  sendJson(res, 200, { ok: true });
}

function interest(req, res, donationId) {
  const user = requireUser(req, 'Faça login para demonstrar interesse.');
  sendJson(res, 200, donationService.expressInterest(user, donationId));
}

async function updateStatus(req, res, donationId) {
  const user = requireUser(req, 'Faça login.');
  const donation = donationService.updateDonationStatus(user, donationId, await readJson(req));
  sendJson(res, 200, { donation });
}

module.exports = { comment, create, feed, interest, like, remove, updateStatus };
