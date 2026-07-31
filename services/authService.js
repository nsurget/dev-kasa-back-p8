const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function hashPassword(password, salt = null) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts[0] !== 'scrypt' || parts.length !== 3) return false;
  const salt = parts[1];
  const expected = parts[2];
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
}

function signToken(user) {
  const payload = { id: user.id, role: user.role, name: user.name, email: user.email || null };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

const emailService = require('./emailService');

async function sendVerificationEmail(email, token) {
  return emailService.sendVerificationEmail(email, token);
}


async function register(db, { name, email, password, picture = null }) {
  if (!name) {
    const err = new Error('name is required'); err.status = 400; throw err;
  }
  if (!email) {
    const err = new Error('email is required'); err.status = 400; throw err;
  }
  if (!password || String(password).length < 6) {
    const err = new Error('password must be at least 6 characters'); err.status = 400; throw err;
  }
  
  const role = 'client'; // Enforced minimum privilege role
  const password_hash = hashPassword(String(password));
  const verification_token = crypto.randomBytes(32).toString('hex');
  
  try {
    const r = await db.runAsync(
      'INSERT INTO users(name, email, password_hash, picture, role, is_verified, verification_token, owner_request_status) VALUES (?,?,?,?,?,0,?,\'none\')',
      [name, email, password_hash, picture, role, verification_token]
    );
    const user = await db.getAsync('SELECT id, name, email, picture, role, is_verified, owner_request_status FROM users WHERE id = ?', [r.lastID]);
    await sendVerificationEmail(email, verification_token);
    return { ok: true, message: 'Inscription réussie. Veuillez valider votre adresse email.', user };
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) { const err = new Error('Cet email est déjà enregistré'); err.status = 409; throw err; }
    throw e;
  }
}

async function login(db, { email, password }) {
  if (!email || !password) { const err = new Error('email and password are required'); err.status = 400; throw err; }
  const user = await db.getAsync('SELECT id, name, email, picture, role, password_hash, is_verified, owner_request_status FROM users WHERE email = ?', [email]);
  if (!user || !user.password_hash || !verifyPassword(String(password), user.password_hash)) {
    const err = new Error('invalid credentials'); err.status = 401; throw err;
  }
  if (user.is_verified === 0) {
    const err = new Error('Veuillez vérifier votre adresse email pour activer votre compte.');
    err.status = 403;
    throw err;
  }
  const { password_hash, is_verified, ...publicUser } = user;
  const token = signToken(publicUser);
  return { token, user: publicUser };
}

async function verifyEmail(db, { token }) {
  if (!token) {
    const err = new Error('Token requis');
    err.status = 400;
    throw err;
  }
  const user = await db.getAsync('SELECT id FROM users WHERE verification_token = ?', [token]);
  if (!user) {
    const err = new Error('Token de validation invalide ou expiré');
    err.status = 400;
    throw err;
  }
  await db.runAsync('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?', [user.id]);
  return { ok: true, message: 'Votre adresse email a bien été validée.' };
}

async function resendVerification(db, { email }) {
  if (!email) {
    const err = new Error('Email requis');
    err.status = 400;
    throw err;
  }
  const user = await db.getAsync('SELECT id, is_verified FROM users WHERE email = ?', [email]);
  if (!user) {
    // Avoid email enumeration, return success-like response
    return { ok: true, message: 'Un email de validation a été envoyé si l\'adresse existe.' };
  }
  if (user.is_verified) {
    const err = new Error('Ce compte est déjà validé');
    err.status = 400;
    throw err;
  }
  const token = crypto.randomBytes(32).toString('hex');
  await db.runAsync('UPDATE users SET verification_token = ? WHERE id = ?', [token, user.id]);
  await sendVerificationEmail(email, token);
  return { ok: true, message: 'Un nouvel email de confirmation a été envoyé.' };
}

async function requestPasswordReset(db, { email }) {
  if (!email) { const err = new Error('email is required'); err.status = 400; throw err; }
  const user = await db.getAsync('SELECT id, email FROM users WHERE email = ?', [email]);
  // Always respond with success to avoid user enumeration
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000; // 1 hour
  if (user) {
    await db.runAsync('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id]);
    try {
      await emailService.sendPasswordResetEmail(user.email, token);
    } catch (e) {
      console.error('Failed to send password reset email:', e);
    }
  }
  const resp = { ok: true, message: 'If the email exists, a reset link has been sent.' };
  if (process.env.NODE_ENV !== 'production') resp.token = token;
  return resp;
}

async function resetPassword(db, { token, password }) {
  if (!token || !password) { const err = new Error('token and password are required'); err.status = 400; throw err; }
  if (String(password).length < 6) { const err = new Error('password must be at least 6 characters'); err.status = 400; throw err; }
  const now = Date.now();
  const user = await db.getAsync('SELECT id FROM users WHERE reset_token = ? AND IFNULL(reset_expires, 0) > ?', [token, now]);
  if (!user) { const err = new Error('invalid or expired token'); err.status = 400; throw err; }
  const password_hash = hashPassword(String(password));
  await db.runAsync('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [password_hash, user.id]);
  return { ok: true };
}

module.exports = {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  hashPassword,
  verifyPassword,
  signToken,
  verifyEmail,
  resendVerification,
};
