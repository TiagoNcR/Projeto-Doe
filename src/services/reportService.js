const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');

const REPORT_REASONS = new Set(['spam', 'golpe', 'ofensivo', 'inadequado', 'outro']);
const TARGET_TYPES = new Set(['user', 'post', 'donation']);

// Encontra o alvo da denúncia e quem é responsável por ele.
function findTarget(targetType, targetId) {
  const database = getDatabase();
  if (targetType === 'user') {
    const user = database.users.find(item => item.id === targetId);
    return user ? { ownerId: user.id } : null;
  }
  const collection = targetType === 'post' ? database.posts : database.donations;
  const item = collection.find(entry => entry.id === targetId);
  return item ? { ownerId: item.ownerId } : null;
}

function createReport(user, body) {
  const targetType = String(body.targetType || '');
  const targetId = String(body.targetId || '');
  const reason = String(body.reason || '');
  const details = String(body.details || '').trim().slice(0, 500);

  if (!TARGET_TYPES.has(targetType)) throw new HttpError(400, 'Tipo de denúncia inválido.');
  if (!REPORT_REASONS.has(reason)) throw new HttpError(400, 'Escolha o motivo da denúncia.');
  if (reason === 'outro' && details.length < 5) throw new HttpError(400, 'Descreva o motivo da denúncia.');

  const target = findTarget(targetType, targetId);
  if (!target) throw new HttpError(404, 'Não encontramos o que você quer denunciar.');
  if (target.ownerId === user.id) throw new HttpError(400, 'Você não pode denunciar a si mesmo nem o seu próprio conteúdo.');

  const database = getDatabase();
  if (!Array.isArray(database.reports)) database.reports = [];
  const existing = database.reports.find(report =>
    report.reporterId === user.id && report.targetType === targetType &&
    report.targetId === targetId && report.status === 'open'
  );
  if (existing) return { reported: true, alreadyReported: true };

  database.reports.push({
    id: crypto.randomUUID(),
    reporterId: user.id,
    targetType,
    targetId,
    targetOwnerId: target.ownerId,
    reason,
    details,
    status: 'open',
    createdAt: new Date().toISOString()
  });
  saveDatabase();
  return { reported: true, alreadyReported: false };
}

module.exports = { createReport };
