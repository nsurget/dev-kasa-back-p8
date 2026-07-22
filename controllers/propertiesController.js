const {
  listProperties,
  getPropertyDetails,
  createProperty,
  updateProperty,
  deleteProperty,
} = require('../services/propertiesService');

function statusFromError(e) {
  if (e && e.status) return e.status;
  if (e && e.message && /(UNIQUE|PRIMARY KEY)/i.test(e.message)) return 409;
  return 500;
}

async function list(req, res) {
  const db = req.app.locals.db;
  try {
    const rows = await listProperties(db);
    res.json(rows);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function getById(req, res) {
  const db = req.app.locals.db;
  try {
    const prop = await getPropertyDetails(db, req.params.id);
    if (!prop) return res.status(404).json({ error: 'Property not found' });
    res.json(prop);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function create(req, res) {
  const db = req.app.locals.db;
  try {
    const payload = req.body || {};
    if (req.user) {
      if (req.user.role !== 'admin') {
        payload.host_id = req.user.id;
        delete payload.host;
      } else if (!payload.host_id) {
        // Fallback for admin if no host is selected
        payload.host_id = req.user.id;
        delete payload.host;
      }
    }
    const created = await createProperty(db, payload);
    res.status(201).json(created);
  } catch (e) {
    const code = statusFromError(e);
    // Map message for validation consistency
    let msg = e.message;
    if (code === 409) msg = 'Property with same id already exists';
    if (msg === 'title is required') return res.status(400).json({ error: msg });
    if (msg.startsWith('host_id')) return res.status(400).json({ error: msg });
    res.status(code).json({ error: msg });
  }
}

async function update(req, res) {
  const db = req.app.locals.db;
  try {
    const payload = req.body || {};
    if (req.user && req.user.role !== 'admin') {
      delete payload.host_id;
      delete payload.host;
    }
    const updated = await updateProperty(db, req.params.id, payload);
    res.json(updated);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function remove(req, res) {
  const db = req.app.locals.db;
  try {
    await deleteProperty(db, req.params.id);
    res.status(204).end();
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
