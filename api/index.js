// Ponto de entrada na Vercel. O vercel.json encaminha todo /api/* para esta função,
// e a Vercel mantém o endereço original em req.url, então as rotas de sempre funcionam.
const repository = require('../src/repositories/jsonRepository');
const { handleApiRequest } = require('../src/server');
const { sendJson } = require('../src/utils/http');

module.exports = async function handler(req, res) {
  // Sem Redis configurado, a função não teria onde gravar: o disco da Vercel é somente leitura.
  if (!repository.usesRemoteStore()) {
    sendJson(res, 500, {
      error: 'Banco de dados não configurado. Conecte um banco Redis (Upstash) ao projeto no painel da Vercel.'
    });
    return;
  }

  const pathname = new URL(req.url, 'http://localhost').pathname;
  await handleApiRequest(req, res, pathname);
};
