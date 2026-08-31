const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const messagesService = require('./services/messagesService');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required and must not be left unset.');
}
const JWT_SECRET = process.env.JWT_SECRET;

const allowedOrigins = [
  'https://kasa.nsurget.fr',
  'http://kasa.nsurget.fr',
  'http://localhost:3000',
  'http://localhost:5173',
];

function initSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
    },
  });

  // Socket Authentication Middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Authentication token required'));
      }
      const payload = jwt.verify(token, JWT_SECRET);
      socket.user = { id: payload.id, name: payload.name };
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    // Join user's personal room for global notifications
    const userRoom = `user_${socket.user.id}`;
    socket.join(userRoom);

    // Join specific conversation room
    socket.on('join_conversation', ({ conversationId }) => {
      if (conversationId) {
        socket.join(`conversation_${conversationId}`);
      }
    });

    // Leave specific conversation room
    socket.on('leave_conversation', ({ conversationId }) => {
      if (conversationId) {
        socket.leave(`conversation_${conversationId}`);
      }
    });

    // Send Message
    socket.on('send_message', async ({ conversationId, content }, callback) => {
      try {
        const { message, recipientId } = await messagesService.saveMessage(conversationId, socket.user.id, content);
        
        // Broadcast message to room
        io.to(`conversation_${conversationId}`).emit('new_message', message);

        // Notify recipient's personal room to refresh conversation list/badge
        io.to(`user_${recipientId}`).emit('conversation_updated', { conversationId, message });
        io.to(`user_${socket.user.id}`).emit('conversation_updated', { conversationId, message });

        if (typeof callback === 'function') {
          callback({ success: true, message });
        }
      } catch (err) {
        if (typeof callback === 'function') {
          callback({ error: err.message });
        }
      }
    });

    // Typing Indicators
    socket.on('typing', ({ conversationId }) => {
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit('user_typing', {
          userId: socket.user.id,
          conversationId,
        });
      }
    });

    socket.on('stop_typing', ({ conversationId }) => {
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit('user_stop_typing', {
          userId: socket.user.id,
          conversationId,
        });
      }
    });

    // Mark messages as read
    socket.on('mark_read', async ({ conversationId }) => {
      if (conversationId) {
        try {
          await messagesService.markAsRead(conversationId, socket.user.id);
          io.to(`conversation_${conversationId}`).emit('messages_read', {
            conversationId,
            readByUserId: socket.user.id,
          });
        } catch (err) {
          console.error('Error in mark_read socket handler:', err);
        }
      }
    });

    socket.on('disconnect', () => {
      // Cleanup handled automatically by socket.io
    });
  });

  return io;
}

module.exports = { initSocketServer };
