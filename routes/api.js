const express = require('express');
const router = express.Router();

const dbReady = require('../middlewares/dbReady');
const { requireRole, requireAdmin, requireSelfOrAdmin, requireAuth, requirePropertyOwnerOrAdmin } = require('../middlewares/auth');
const properties = require('../controllers/propertiesController');
const users = require('../controllers/usersController');
const ratings = require('../controllers/ratingsController');
const favorites = require('../controllers/favoritesController');
const uploads = require('../controllers/uploadsController');

// Ensure DB is ready for all API routes
router.use(dbReady);

// Properties
router.get('/properties', properties.list);
router.get('/properties/:id', properties.getById);
router.post('/properties', requireRole(['owner','admin']), properties.create);
router.patch('/properties/:id', requirePropertyOwnerOrAdmin, properties.update);
router.delete('/properties/:id', requirePropertyOwnerOrAdmin, properties.remove);

// Users
router.get('/users', requireAdmin, users.list);
router.get('/users/:id', requireAuth, users.getById);
router.post('/users', requireAdmin, users.create);
router.patch('/users/:id', requireSelfOrAdmin('id'), users.update);
router.delete('/users/:id', requireSelfOrAdmin('id'), users.remove);

// Ratings for properties
router.get('/properties/:id/ratings', ratings.listForProperty);
router.post('/properties/:id/ratings', requireAuth, ratings.add);

// Favorites
router.post('/properties/:id/favorite', requireAuth, favorites.addForProperty);
router.delete('/properties/:id/favorite', requireAuth, favorites.removeForProperty);
router.get('/users/:id/favorites', requireSelfOrAdmin('id'), favorites.listForUser);

// Uploads
router.post('/uploads/image', requireAuth, uploads.uploadImage);

// Delete one or multiple uploaded images by filename or URL
router.delete('/uploads/images', requireRole(['owner','admin']), uploads.deleteImages);

// Messaging / Conversations
const messages = require('../controllers/messagesController');
router.get('/conversations', requireAuth, messages.getConversations);
router.post('/conversations', requireAuth, messages.startConversation);
router.get('/conversations/:id/messages', requireAuth, messages.getMessages);
router.put('/conversations/:id/read', requireAuth, messages.markRead);

module.exports = router;
