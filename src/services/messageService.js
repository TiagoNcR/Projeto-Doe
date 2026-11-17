const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../repositories/jsonRepository');
const { HttpError } = require('../utils/errors');
const { avatarUrl } = require('../utils/serializers');

function getContact(userId) {
  const contact = getDatabase().users.find(item => item.id === userId);
  if (!contact) throw new HttpError(404, 'Participante não encontrado.');
  return contact;
}

function isConversationMessage(message, firstUserId, secondUserId) {
  return (message.senderId === firstUserId && message.recipientId === secondUserId) ||
    (message.senderId === secondUserId && message.recipientId === firstUserId);
}

function unreadMessageCount(messages, userId) {
  return messages.filter(message =>
    message.recipientId === userId &&
    Array.isArray(message.readBy) &&
    !message.readBy.includes(userId)
  ).length;
}

function listConversations(user) {
  const database = getDatabase();
  const conversations = database.users
    .filter(contact => contact.id !== user.id)
    .map(contact => {
      const messages = database.messages.filter(message =>
        isConversationMessage(message, user.id, contact.id)
      );
      const latest = messages[messages.length - 1];
      return {
        id: contact.id,
        name: contact.name,
        type: contact.type,
        avatarUrl: avatarUrl(contact),
        lastMessage: latest ? latest.text : '',
        lastMessageAt: latest ? latest.createdAt : '',
        lastMessageFromMe: Boolean(latest && latest.senderId === user.id),
        unreadCount: unreadMessageCount(messages, user.id)
      };
    })
    .sort((left, right) =>
      (Date.parse(right.lastMessageAt) || 0) - (Date.parse(left.lastMessageAt) || 0) ||
      left.name.localeCompare(right.name, 'pt-BR')
    );
  return { conversations };
}

function listMessages(user, contactId) {
  const contact = getContact(contactId);
  if (contact.id === user.id) throw new HttpError(400, 'Não é possível abrir uma conversa consigo mesmo.');

  const database = getDatabase();
  const conversationMessages = database.messages
    .filter(message => isConversationMessage(message, user.id, contact.id));
  let hasUnreadMessages = false;
  for (const message of conversationMessages) {
    if (message.recipientId !== user.id) continue;
    const readBy = Array.isArray(message.readBy) ? message.readBy : [message.senderId];
    if (!readBy.includes(user.id)) {
      message.readBy = [...readBy, user.id];
      hasUnreadMessages = true;
    } else if (!Array.isArray(message.readBy)) {
      message.readBy = readBy;
      hasUnreadMessages = true;
    }
  }
  if (hasUnreadMessages) saveDatabase();

  const messages = conversationMessages
    .map(message => ({
      ...message,
      senderName: database.users.find(item => item.id === message.senderId)?.name || 'Participante'
    }));
  return { messages, unreadCount: unreadMessageCount(conversationMessages, user.id) };
}

function sendMessage(user, contactId, body) {
  const contact = getContact(contactId);
  if (contact.id === user.id) throw new HttpError(400, 'Não é possível abrir uma conversa consigo mesmo.');
  const text = String(body.text || '').trim();
  if (!text || text.length > 1000) {
    throw new HttpError(400, 'A mensagem deve ter entre 1 e 1000 caracteres.');
  }

  const message = {
    id: crypto.randomUUID(),
    senderId: user.id,
    recipientId: contact.id,
    text,
    createdAt: new Date().toISOString(),
    readBy: [user.id]
  };
  getDatabase().messages.push(message);
  saveDatabase();
  return { message: { ...message, senderName: user.name } };
}

module.exports = { listConversations, listMessages, sendMessage };
