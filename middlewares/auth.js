const jwt = require('jsonwebtoken');
const { getPropertyOwnerId } = require('../services/propertiesService');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required and must not be left unset.');
}
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Best-effort authentication middleware: reads a `Bearer` JWT from the
 * Authorization header and, if valid, attaches a minimal `req.user` object
 * ({id, role, name, email}) from its payload. Unlike `requireAuth`, this
 * never rejects the request — an absent or invalid token simply leaves
 * `req.user` unset, so it can be used on routes with optional auth.
 *
 * @param {import('express').Request} req - Incoming request.
 * @param {import('express').Response} res - Outgoing response (unused, kept for middleware signature).
 * @param {import('express').NextFunction} next - Express next-middleware callback.
 * @returns {void}
 */
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

/**
 * Rejects the request with 401 unless `authenticate` was able to attach a
 * valid `req.user`. Use on any route that must not be reachable anonymously.
 *
 * @param {import('express').Request} req - Incoming request.
 * @param {import('express').Response} res - Outgoing response.
 * @param {import('express').NextFunction} next - Express next-middleware callback.
 * @returns {void}
 */
function requireAuth(req, res, next) {
  authenticate(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'authentication required' });
    next();
  });
}

/**
 * Rejects the request with 401/403 unless the authenticated user has the
 * `admin` role.
 *
 * @param {import('express').Request} req - Incoming request.
 * @param {import('express').Response} res - Outgoing response.
 * @param {import('express').NextFunction} next - Express next-middleware callback.
 * @returns {void}
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin required' });
    next();
  });
}

/**
 * Builds a middleware that rejects the request with 401/403 unless the
 * authenticated user's role is included in `roles`.
 *
 * @param {string|string[]} [roles=[]] - Role or list of roles allowed through.
 * @returns {import('express').RequestHandler} Express middleware.
 */
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

/**
 * Builds a middleware that rejects the request with 401/403 unless the
 * authenticated user is either an admin or the resource owner, identified by
 * comparing `req.user.id` to the route param named `param` (e.g. `/users/:id`).
 *
 * @param {string} [param='id'] - Name of the route param holding the target user id.
 * @returns {import('express').RequestHandler} Express middleware.
 */
function requireSelfOrAdmin(param = 'id') {
  return function (req, res, next) {
    requireAuth(req, res, () => {
      const requestedId = String(req.params && req.params[param]);
      if (req.user.role === 'admin' || String(req.user.id) === requestedId) return next();
      return res.status(403).json({ error: 'forbidden' });
    });
  };
}

/**
 * Rejects the request with 401/403/404 unless the authenticated user is an
 * admin, or an `owner` who actually owns the property identified by the
 * `:id` route param. Looks up real ownership in the database rather than
 * trusting any client-supplied owner id.
 *
 * @param {import('express').Request} req - Incoming request; expects `req.app.locals.db` and `req.params.id`.
 * @param {import('express').Response} res - Outgoing response.
 * @param {import('express').NextFunction} next - Express next-middleware callback.
 * @returns {Promise<void>}
 */
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
