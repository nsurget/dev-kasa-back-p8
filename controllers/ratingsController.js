const { listRatingsForProperty, addRating } = require('../services/ratingsService');

function statusFromError(e) {
  if (e && e.status) return e.status;
  return 500;
}

async function listForProperty(req, res) {
  const db = req.app.locals.db;
  try {
    const ratings = await listRatingsForProperty(db, req.params.id);
    res.json(ratings);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function add(req, res) {
  const db = req.app.locals.db;
  try {
    // user_id always comes from the authenticated session, never from the
    // request body, to prevent a caller from posting ratings as another user.
    const { score, comment } = req.body || {};
    const result = await addRating(db, req.params.id, { user_id: req.user.id, score, comment });
    res.status(201).json(result);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

module.exports = {
  listForProperty,
  add,
};
