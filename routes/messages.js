const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const messagesController = require('../controllers/messagesController');

router.get('/conversations', requireAuth, messagesController.getConversations);
router.post('/conversations', requireAuth, messagesController.startConversation);
router.get('/conversations/:id/messages', requireAuth, messagesController.getMessages);
router.put('/conversations/:id/read', requireAuth, messagesController.markRead);

module.exports = router;
