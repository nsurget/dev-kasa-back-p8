const { getDb } = require('../db');

/**
 * Get or create a conversation between two users.
 * Standardizes user IDs so user1_id < user2_id to prevent duplicates.
 */
async function getOrCreateConversation(currentUserId, targetUserId) {
  const u1Id = Number(currentUserId);
  const u2Id = Number(targetUserId);

  if (isNaN(u1Id) || isNaN(u2Id)) {
    throw new Error('Invalid user IDs');
  }

  if (u1Id === u2Id) {
    throw new Error('Cannot start a conversation with yourself');
  }

  const user1_id = Math.min(u1Id, u2Id);
  const user2_id = Math.max(u1Id, u2Id);

  const db = getDb();

  let conversation = await db.getAsync(
    `SELECT * FROM conversations WHERE user1_id = ? AND user2_id = ?`,
    [user1_id, user2_id]
  );

  if (!conversation) {
    const res = await db.runAsync(
      `INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)`,
      [user1_id, user2_id]
    );
    conversation = await db.getAsync(
      `SELECT * FROM conversations WHERE id = ?`,
      [res.lastID]
    );
  }

  return conversation;
}

/**
 * Get all conversations for a user with the latest message and unread count.
 */
async function getUserConversations(userId) {
  const uid = Number(userId);
  const db = getDb();

  const query = `
    SELECT 
      c.id,
      c.user1_id,
      c.user2_id,
      c.updated_at,
      u.id AS other_user_id,
      u.name AS other_user_name,
      u.picture AS other_user_picture,
      m.content AS last_message,
      m.created_at AS last_message_time,
      m.sender_id AS last_message_sender_id,
      (
        SELECT COUNT(*) 
        FROM messages msg 
        WHERE msg.conversation_id = c.id 
          AND msg.sender_id != ? 
          AND msg.is_read = 0
      ) AS unread_count
    FROM conversations c
    JOIN users u ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages 
      WHERE conversation_id = c.id 
      ORDER BY created_at DESC, id DESC 
      LIMIT 1
    )
    WHERE c.user1_id = ? OR c.user2_id = ?
    ORDER BY c.updated_at DESC
  `;

  return await db.allAsync(query, [uid, uid, uid, uid]);
}

/**
 * Get all messages for a specific conversation.
 */
async function getConversationMessages(conversationId, userId) {
  const db = getDb();
  const cid = Number(conversationId);
  const uid = Number(userId);

  // Check user belongs to conversation
  const conv = await db.getAsync(
    `SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)`,
    [cid, uid, uid]
  );

  if (!conv) {
    throw new Error('Conversation not found or access denied');
  }

  const messages = await db.allAsync(
    `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.is_read, m.created_at, u.name AS sender_name, u.picture AS sender_picture
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC, m.id ASC`,
    [cid]
  );

  return messages;
}

/**
 * Save a new message and update conversation timestamp.
 */
async function saveMessage(conversationId, senderId, content) {
  const db = getDb();
  const cid = Number(conversationId);
  const sid = Number(senderId);

  if (!content || !content.trim()) {
    throw new Error('Message content cannot be empty');
  }

  // Ensure conversation exists
  const conv = await db.getAsync(
    `SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)`,
    [cid, sid, sid]
  );

  if (!conv) {
    throw new Error('Conversation not found or access denied');
  }

  const res = await db.runAsync(
    `INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)`,
    [cid, sid, content.trim()]
  );

  await db.runAsync(
    `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [cid]
  );

  const newMessage = await db.getAsync(
    `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.is_read, m.created_at, u.name AS sender_name, u.picture AS sender_picture
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    [res.lastID]
  );

  const recipientId = conv.user1_id === sid ? conv.user2_id : conv.user1_id;

  return { message: newMessage, recipientId };
}

/**
 * Mark messages in conversation as read for the current user.
 */
async function markAsRead(conversationId, userId) {
  const db = getDb();
  const cid = Number(conversationId);
  const uid = Number(userId);

  await db.runAsync(
    `UPDATE messages 
     SET is_read = 1 
     WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
    [cid, uid]
  );

  return { success: true };
}

module.exports = {
  getOrCreateConversation,
  getUserConversations,
  getConversationMessages,
  saveMessage,
  markAsRead,
};
