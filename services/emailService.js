const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

/**
 * Creates and returns a Nodemailer transporter if SMTP credentials are configured.
 * @returns {import('nodemailer').Transporter|null}
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !pass) {
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure, // true for 465, false for 587 (TLS/STARTTLS)
    auth: {
      user: user || undefined,
      pass: pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Logs email to console and local mail log file when SMTP is not configured.
 * @param {Object} options 
 * @param {string} options.to 
 * @param {string} options.subject 
 * @param {string} options.text 
 * @param {string} [options.html] 
 */
function logEmailLocally({ to, subject, text, html }) {
  const mailContent = `
============================================================
TO: ${to}
SUBJECT: ${subject}

${text}
============================================================
  `;
  console.log(mailContent);

  try {
    const logDir = path.join(__dirname, '../data/logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(path.join(logDir, 'mail.log'), `${new Date().toISOString()} - ${mailContent}\n`);
  } catch (err) {
    console.error('Failed to log email to file:', err);
  }
}

/**
 * Sends email via Brevo HTTP REST API (uses port 443 HTTPS - never blocked by cloud hosting).
 */
async function sendViaBrevoApi({ to, subject, text, html }) {
  const apiKey = process.env.BREVO_API_KEY || process.env.SMTP_PASS;
  if (!apiKey) return null;

  const rawFrom = process.env.EMAIL_FROM || 'nsurget <nepasrepondre@nsurget.fr>';
  let senderName = 'Kasa';
  let senderEmail = 'nepasrepondre@nsurget.fr';

  const match = rawFrom.match(/^(.*)<(.*)>$/);
  if (match) {
    senderName = match[1].trim() || 'Kasa';
    senderEmail = match[2].trim();
  } else if (rawFrom.includes('@')) {
    senderEmail = rawFrom.trim();
  }

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to }],
    subject: subject,
    textContent: text,
    htmlContent: html || text,
  };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    console.log(`[EmailService] Email successfully sent via Brevo HTTPS API to ${to}. MessageId: ${data.messageId}`);
    return { ok: true, messageId: data.messageId };
  } catch (err) {
    console.error(`[EmailService] Brevo HTTPS API error:`, err.message);
    console.log(`[EmailService] Affichage du contenu de l'email dans la console pour le développement local :`);
    logEmailLocally({ to, subject, text, html });
    return null;
  }
}

/**
 * Core function to send an email via Brevo API, SMTP or local log fallback.
 * @param {Object} options 
 * @param {string} options.to 
 * @param {string} options.subject 
 * @param {string} options.text 
 * @param {string} [options.html] 
 */
async function sendMail({ to, subject, text, html }) {
  // 1. Try Brevo HTTP API first (port 443 - zero timeout risk)
  const brevoRes = await sendViaBrevoApi({ to, subject, text, html });
  if (brevoRes && brevoRes.ok) {
    return brevoRes;
  }

  // 2. Fallback to Nodemailer SMTP
  const transporter = getTransporter();
  const from = process.env.EMAIL_FROM || 'Kasa <noreply@kasa.fr>';

  if (!transporter) {
    console.log('[EmailService] SMTP credentials not provided.');
    return { ok: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`[EmailService] Email successfully sent via SMTP to ${to}. MessageId: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EmailService] Failed to send email via SMTP to ${to}:`, error);
    return { ok: false, fallback: true, error: error.message };
  }
}

/**
 * Sends account verification email.
 * @param {string} email 
 * @param {string} token 
 */
async function sendVerificationEmail(email, token) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const verificationLink = `${frontendUrl}/verify-email?token=${token}`;

  const subject = 'Confirmez votre adresse email - Kasa';
  const text = `Bonjour,

Merci de vous être inscrit sur Kasa.
Veuillez confirmer votre adresse email en cliquant sur le lien suivant:
${verificationLink}

Ce lien expirera dans 24 heures.

Si vous n'avez pas créé de compte, vous pouvez ignorer cet email.`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #99331a;">Bienvenue sur Kasa</h2>
      <p>Bonjour,</p>
      <p>Merci de vous être inscrit sur Kasa. Veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous :</p>
      <div style="margin: 25px 0;">
        <a href="${verificationLink}" style="background-color: #99331a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Confirmer mon email
        </a>
      </div>
      <p style="font-size: 12px; color: #666;">
        Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :<br/>
        <a href="${verificationLink}" style="color: #99331a;">${verificationLink}</a>
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 30px;">Si vous n'avez pas créé de compte Kasa, vous pouvez ignorer cet email.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

/**
 * Sends password reset email.
 * @param {string} email 
 * @param {string} token 
 */
async function sendPasswordResetEmail(email, token) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  const subject = 'Réinitialisation de votre mot de passe - Kasa';
  const text = `Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe Kasa.
Cliquez sur le lien suivant pour choisir un nouveau mot de passe :
${resetLink}

Ce lien est valable 1 heure.

Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #99331a;">Kasa - Réinitialisation du mot de passe</h2>
      <p>Bonjour,</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
      <div style="margin: 25px 0;">
        <a href="${resetLink}" style="background-color: #99331a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Réinitialiser le mot de passe
        </a>
      </div>
      <p style="font-size: 12px; color: #666;">
        Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :<br/>
        <a href="${resetLink}" style="color: #99331a;">${resetLink}</a>
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 30px;">Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer ce message.</p>
    </div>
  `;

  return sendMail({ to: email, subject, text, html });
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
