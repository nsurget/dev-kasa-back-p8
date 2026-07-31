const { deleteUploadedFile } = require('../utils/fileUtils');

async function listUsers(db) {
  return await db.allAsync('SELECT id, name, email, picture, role, is_verified, owner_request_status FROM users ORDER BY id DESC');
}

async function getUser(db, id) {
  return await db.getAsync('SELECT id, name, email, picture, role, is_verified, owner_request_status FROM users WHERE id = ?', [id]);
}

async function createUser(db, { name, picture = null, role = 'client', email = null, password_hash = null, is_verified = 1 }) {
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  if (!['owner', 'client', 'admin'].includes(role)) {
    const err = new Error('invalid role');
    err.status = 400;
    throw err;
  }
  try {
    const r = await db.runAsync(
      'INSERT INTO users(name, email, password_hash, picture, role, is_verified, owner_request_status) VALUES (?,?,?,?,?,?,\'none\')',
      [name, email, password_hash, picture, role, is_verified]
    );
    return await getUser(db, r.lastID);
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) {
      const err = new Error('User already exists');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

async function updateUser(db, id, changes, { allowAdminRole = false } = {}) {
  // Check if picture is changing to delete old avatar file
  if (Object.prototype.hasOwnProperty.call(changes || {}, 'picture')) {
    const currentUser = await db.getAsync('SELECT picture FROM users WHERE id = ?', [id]);
    if (currentUser && currentUser.picture && currentUser.picture !== changes.picture) {
      deleteUploadedFile(currentUser.picture);
    }
  }

  const allowedFields = ['name', 'picture', 'role', 'owner_request_status'];
  const fields = [];
  const params = [];
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(changes || {}, key)) {
      if (key === 'role') {
        const role = changes.role;
        if (!['owner', 'client', 'admin'].includes(role)) {
          const err = new Error('invalid role');
          err.status = 400;
          throw err;
        }
        if (!allowAdminRole) {
          const err = new Error('forbidden to change user role');
          err.status = 403;
          throw err;
        }
      }
      if (key === 'owner_request_status') {
        const status = changes.owner_request_status;
        if (!['none', 'pending', 'approved', 'rejected'].includes(status)) {
          const err = new Error('invalid request status');
          err.status = 400;
          throw err;
        }
        // Non-admins can only submit a request to 'pending' or cancel it to 'none'
        if (!allowAdminRole && (status === 'approved' || status === 'rejected')) {
          const err = new Error('only admin can approve or reject request');
          err.status = 403;
          throw err;
        }
      }
      fields.push(`${key} = ?`);
      params.push(changes[key]);
    }
  }
  if (fields.length === 0) {
    const err = new Error('No fields to update');
    err.status = 400;
    throw err;
  }
  params.push(id);
  const r = await db.runAsync(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  if (r.changes === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return await getUser(db, id);
}

async function deleteUser(db, id) {
  // Delete physical avatar file of user
  const u = await db.getAsync('SELECT picture FROM users WHERE id = ?', [id]);
  if (u && u.picture) {
    deleteUploadedFile(u.picture);
  }

  // Delete all properties owned by this user (and their physical files)
  const userProperties = await db.allAsync('SELECT id FROM properties WHERE host_id = ?', [id]);
  const { deleteProperty } = require('./propertiesService');
  for (const p of userProperties) {
    try {
      await deleteProperty(db, p.id);
    } catch (_) {}
  }
  
  // Delete the user (cascades favorites, ratings)
  const r = await db.runAsync('DELETE FROM users WHERE id = ?', [id]);
  if (r.changes === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
