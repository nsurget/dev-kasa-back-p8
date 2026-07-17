const jwt = require('jsonwebtoken');
const { getPropertyOwnerId } = require('../services/propertiesService');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';

function authenticate(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const [scheme, token] = auth.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = { id: payload.id, role: payload.role, name: payload.name, email: payload.email };
    } catch (e) {
      // invalid token -> ignore for authenticate(), but requireAuth will block
    }
  }
  next();
}

function requireAuth(req, res, next) {
  authenticate(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'authentication required' });
    next();
  });
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin required' });
    next();
  });
}

function requireRole(roles = []) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return function (req, res, next) {
    requireAuth(req, res, () => {
      if (!allowed.includes(req.user.role)) {
        return res.status(403).json({ error: 'insufficient role' });
      }
      next();
    });
  };
}

function requireSelfOrAdmin(param = 'id') {
  return function (req, res, next) {
    requireAuth(req, res, () => {
      const requestedId = String(req.params && req.params[param]);
      if (req.user.role === 'admin' || String(req.user.id) === requestedId) return next();
      return res.status(403).json({ error: 'forbidden' });
    });
  };
}

function requirePropertyOwnerOrAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    if (req.user.role === 'admin') return next();
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'forbidden: owner or admin role required' });

    const db = req.app.locals.db;
    const propertyId = req.params.id;

    try {
      const ownerId = await getPropertyOwnerId(db, propertyId);
      if (!ownerId) {
        return res.status(404).json({ error: 'Property not found' });
      }

      if (Number(req.user.id) !== Number(ownerId)) {
        return res.status(403).json({ error: 'forbidden: you do not own this property' });
      }

      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = {
  authenticate,
  requireAuth,
  requireAdmin,
  requireRole,
  requireSelfOrAdmin,
  requirePropertyOwnerOrAdmin
};
