const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const repository = require('../repositories/jsonRepository');

let database;
let saveCount;
repository.getDatabase = () => database;
repository.saveDatabase = () => { saveCount += 1; };

const messageService = require('./messageService');

const sender = { id: 'sender-1', name: 'Pessoa Remetente', type: 'Doador' };
const recipient = { id: 'recipient-1', name: 'Pessoa Destinatária', type: 'Beneficiário' };

beforeEach(() => {
  database = {
    users: [sender, recipient],
    messages: []
  };
  saveCount = 0;
});

test('new incoming messages are counted as unread only for their recipient', () => {
  messageService.sendMessage(sender, recipient.id, { text: 'Olá!' });

  const recipientConversations = messageService.listConversations(recipient).conversations;
  const senderConversations = messageService.listConversations(sender).conversations;

  assert.equal(recipientConversations[0].unreadCount, 1);
  assert.equal(senderConversations[0].unreadCount, 0);
});

test('opening a conversation marks incoming messages as read and persists the change', () => {
  messageService.sendMessage(sender, recipient.id, { text: 'Olá!' });

  const result = messageService.listMessages(recipient, sender.id);

  assert.equal(result.unreadCount, 0);
  assert.deepEqual(result.messages[0].readBy, [sender.id, recipient.id]);
  assert.equal(messageService.listConversations(recipient).conversations[0].unreadCount, 0);
  assert.equal(saveCount, 2);
});
