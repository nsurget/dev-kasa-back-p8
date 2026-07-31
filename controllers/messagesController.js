const messagesService = require('../services/messagesService');

async function getConversations(req, res) {
  try {
    const conversations = await messagesService.getUserConversations(req.user.id);
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function startConversation(req, res) {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' });
    }
    const conversation = await messagesService.getOrCreateConversation(req.user.id, targetUserId);
    res.status(201).json(conversation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getMessages(req, res) {
  try {
    const { id } = req.params;
    const messages = await messagesService.getConversationMessages(id, req.user.id);
    res.json(messages);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

async function markRead(req, res) {
  try {
    const { id } = req.params;
    const result = await messagesService.markAsRead(id, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  getConversations,
  startConversation,
  getMessages,
  markRead,
};
