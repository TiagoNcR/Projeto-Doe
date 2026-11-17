const postService = require('../services/postService');
const socialService = require('../services/socialService');
const { requireUser } = require('../middleware/session');
const { readJson, sendJson } = require('../utils/http');

async function create(req, res) {
  const user = requireUser(req, 'Faça login para publicar.');
  const post = postService.createPost(user, await readJson(req));
  sendJson(res, 201, { post });
}

function like(req, res, postId) {
  const user = requireUser(req, 'Faça login para curtir.');
  sendJson(res, 200, socialService.toggleLike(user, postId, 'post'));
}

async function comment(req, res, postId) {
  const user = requireUser(req, 'Faça login para comentar.');
  await socialService.addComment(user, postId, await readJson(req), 'post');
  sendJson(res, 201, { ok: true });
}

function remove(req, res, postId) {
  const user = requireUser(req, 'Faça login.');
  postService.removePost(user, postId);
  sendJson(res, 200, { ok: true });
}

function events(req, res) {
  requireUser(req, 'Faça login para consultar o calendário.');
  const month = new URL(req.url, 'http://localhost').searchParams.get('month');
  sendJson(res, 200, { events: postService.listEvents(month) });
}

module.exports = { comment, create, events, like, remove };
