const test = require('node:test');
const assert = require('node:assert/strict');
const { initialize } = require('../db');
const messagesService = require('../services/messagesService');

test('messagesService unit tests', async (t) => {
  // Initialize in-memory / file DB
  const db = await initialize();
  await db.runAsync('DELETE FROM messages');
  await db.runAsync('DELETE FROM conversations');

  let convId;

  await t.test('getOrCreateConversation normalizes user IDs (u1 < u2)', async () => {
    // Calling with (5, 2)
    const conv1 = await messagesService.getOrCreateConversation(5, 2);
    assert.equal(conv1.user1_id, 2);
    assert.equal(conv1.user2_id, 5);

    // Calling with (2, 5) returns the SAME conversation
    const conv2 = await messagesService.getOrCreateConversation(2, 5);
    assert.equal(conv2.id, conv1.id);
    assert.equal(conv2.user1_id, 2);
    assert.equal(conv2.user2_id, 5);

    convId = conv1.id;
  });

  await t.test('saveMessage and getConversationMessages', async () => {
    const res1 = await messagesService.saveMessage(convId, 2, 'Hello from user 2');
    assert.equal(res1.message.content, 'Hello from user 2');
    assert.equal(res1.message.sender_id, 2);
    assert.equal(res1.recipientId, 5);

    const res2 = await messagesService.saveMessage(convId, 5, 'Hi back from user 5');
    assert.equal(res2.message.content, 'Hi back from user 5');
    assert.equal(res2.recipientId, 2);

    const msgs = await messagesService.getConversationMessages(convId, 2);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].content, 'Hello from user 2');
    assert.equal(msgs[1].content, 'Hi back from user 5');
  });

  await t.test('getUserConversations & unread count', async () => {
    // User 2 sees 1 unread message from User 5
    const conversations = await messagesService.getUserConversations(2);
    assert.ok(conversations.length > 0);
    const targetConv = conversations.find(c => c.id === convId);
    assert.ok(targetConv);
    assert.equal(targetConv.unread_count, 1);

    // Mark as read
    await messagesService.markAsRead(convId, 2);

    const updatedConvs = await messagesService.getUserConversations(2);
    const updatedConv = updatedConvs.find(c => c.id === convId);
    assert.equal(updatedConv.unread_count, 0);

    // Teardown: clean up test data so it doesn't pollute SQLite DB
    await db.runAsync('DELETE FROM messages WHERE conversation_id = ?', [convId]);
    await db.runAsync('DELETE FROM conversations WHERE id = ?', [convId]);
  });
});
