'use strict';

const express = require('express');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { rateLimit } = require('express-rate-limit');
const { hashPassword, verifyPassword } = require('../security');
const { pool, withTransaction } = require('../postgres');

const router = express.Router();

async function sendVerificationEmail(destination, token) {
  const required = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'APP_BASE_URL'
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    const error = new Error('Configuration e-mail incomplète.');
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }

  const base = process.env.APP_BASE_URL.replace(/\/$/, '');
  let parsed;

  try {
    parsed = new URL(base);
  } catch {
    throw new Error('APP_BASE_URL invalide.');
  }

  if (
    parsed.protocol !== 'https:' &&
    parsed.hostname !== 'localhost' &&
    parsed.hostname !== '127.0.0.1'
  ) {
    throw new Error('APP_BASE_URL doit utiliser HTTPS.');
  }

  const port = Number(process.env.SMTP_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT invalide.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const link = new URL('/entreprises.html', base);
  link.searchParams.set('token', token);

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: destination,
    subject: 'Vérification de votre adresse – ODM TECH CONNECT',
    text:
      'Bonjour,\n\n' +
      'Pour vérifier votre adresse e-mail, ouvrez ce lien :\n' +
      link.toString() +
      '\n\nCe lien expire dans 24 heures.\n\nODM TECH CONNECT',
    html:
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#10243a">' +
      '<h2 style="color:#168bd2">ODM TECH CONNECT</h2>' +
      '<p>Bonjour,</p>' +
      '<p>Confirmez votre adresse e-mail en cliquant sur le bouton ci-dessous.</p>' +
      '<p><a href="' + link.toString() +
      '" style="display:inline-block;background:#168bd2;color:white;padding:14px 20px;border-radius:7px;text-decoration:none">Vérifier mon adresse e-mail</a></p>' +
      '<p>Ce lien expire dans 24 heures.</p>' +
      '<p>Connecter. Représenter. Développer.</p></div>'
  });
}

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

// INSCRIPTION D'UNE ENTREPRISE
router.post('/register', registerLimiter, async (req, res) => {
  let createdUserId = null;

  try {
    const { email, password, companyName, country, sector } = req.body || {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof companyName !== 'string' ||
      typeof country !== 'string' ||
      typeof sector !== 'string'
    ) {
      return res.status(400).json({
        error: 'Informations obligatoires manquantes.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = companyName.trim();
    const cleanCountry = country.trim();
    const cleanSector = sector.trim();

    if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
      cleanName.length < 2 ||
      cleanName.length > 120 ||
      cleanCountry.length < 2 ||
      cleanCountry.length > 100 ||
      cleanSector.length < 2 ||
      cleanSector.length > 100
    ) {
      return res.status(400).json({
        error: 'Certaines informations sont invalides.'
      });
    }

    const passwordHash = await hashPassword(password);

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await withTransaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id`,
        [cleanEmail, passwordHash]
      );

      const userId = userResult.rows[0].id;

      await client.query(
        `INSERT INTO companies (user_id, name, country, sector)
         VALUES ($1, $2, $3, $4)`,
        [userId, cleanName, cleanCountry, cleanSector]
      );

      await client.query(
        `INSERT INTO email_verifications (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
      );

      return { id: userId };
    });

    createdUserId = user.id;

    try {
      await sendVerificationEmail(cleanEmail, verificationToken);
    } catch (mailError) {
      // Évite de laisser un compte incomplet si l'envoi échoue.
      await pool.query(
        `DELETE FROM users
         WHERE id = $1 AND email_verified = FALSE`,
        [createdUserId]
      );

      createdUserId = null;
      throw mailError;
    }

    return res.status(201).json({
      message: 'Compte créé. Vérification de l’adresse e-mail en attente.'
    });

  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Cette adresse e-mail est déjà utilisée.'
      });
    }

    if (error.message && error.message.includes('mot de passe')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'Le service e-mail doit être configuré avant de pouvoir terminer une inscription.'
      });
    }

    console.error('Erreur inscription :', error.message);

    return res.status(500).json({
      error: 'Impossible de créer le compte pour le moment.'
    });
  }
});

// VÉRIFICATION DE L'ADRESSE E-MAIL
router.post('/verify-email', async (req, res) => {
  try {
    const token = req.body && req.body.token;

    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({
        error: 'Lien de vérification invalide.'
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const result = await withTransaction(async (client) => {
      const recordResult = await client.query(
        `SELECT user_id, expires_at
         FROM email_verifications
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );

      const record = recordResult.rows[0];

      if (!record) {
        return 'invalid';
      }

      if (new Date(record.expires_at).getTime() <= Date.now()) {
        await client.query(
          'DELETE FROM email_verifications WHERE token_hash = $1',
          [tokenHash]
        );

        return 'expired';
      }

      await client.query(
        'UPDATE users SET email_verified = TRUE WHERE id = $1',
        [record.user_id]
      );

      await client.query(
        'DELETE FROM email_verifications WHERE token_hash = $1',
        [tokenHash]
      );

      return 'verified';
    });

    if (result === 'invalid') {
      return res.status(400).json({
        error: 'Lien invalide ou déjà utilisé.'
      });
    }

    if (result === 'expired') {
      return res.status(400).json({
        error: 'Ce lien de vérification a expiré.'
      });
    }

    return res.status(200).json({
      message: 'Adresse e-mail vérifiée. Votre entreprise attend maintenant la validation administrative.'
    });

  } catch (error) {
    console.error('Erreur vérification e-mail :', error.message);

    return res.status(500).json({
      error: 'Impossible de vérifier cette adresse pour le moment.'
    });
  }
});

// CONNEXION
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.length > 254 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: 'Adresse e-mail ou mot de passe invalide.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.password_hash,
         u.role,
         u.email_verified,
         c.id AS company_id,
         c.approval_status
       FROM users u
       LEFT JOIN companies c ON c.user_id = u.id
       WHERE u.email = $1
       LIMIT 1`,
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({
        error: 'Adresse e-mail ou mot de passe incorrect.'
      });
    }

    let companyId = null;

    if (user.role === 'company') {
      if (user.email_verified !== true) {
        return res.status(403).json({
          error: 'Veuillez d’abord vérifier votre adresse e-mail.'
        });
      }

      if (!user.company_id) {
        return res.status(403).json({
          error: 'Aucun profil entreprise associé à ce compte.'
        });
      }

      if (user.approval_status !== 'approved') {
        return res.status(403).json({
          error: user.approval_status === 'rejected'
            ? 'Votre demande d’inscription a été refusée.'
            : 'Votre entreprise est en attente de validation.'
        });
      }

      companyId = user.company_id;

    } else if (user.role !== 'admin') {
      return res.status(403).json({
        error: 'Accès non autorisé.'
      });
    }

    req.session.regenerate((error) => {
      if (error) {
        console.error('Erreur création session :', error.message);

        return res.status(500).json({
          error: 'Impossible d’ouvrir la session.'
        });
      }

      req.session.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId
      };

      req.session.save((saveError) => {
        if (saveError) {
          console.error('Erreur sauvegarde session :', saveError.message);

          return res.status(500).json({
            error: 'Impossible de sauvegarder la session.'
          });
        }

        return res.status(200).json({
          message: 'Connexion réussie.',
          user: req.session.user
        });
      });
    });

  } catch (error) {
    console.error('Erreur connexion :', error.message);

    return res.status(500).json({
      error: 'Impossible de se connecter pour le moment.'
    });
  }
});

// VÉRIFICATION DE LA SESSION
router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      error: 'Aucune session active.'
    });
  }

  return res.status(200).json({
    user: req.session.user
  });
});

// DÉCONNEXION
router.post('/logout', (req, res) => {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  if (!req.session) {
    res.clearCookie('odm.sid', cookieOptions);

    return res.status(200).json({
      message: 'Déconnexion effectuée.'
    });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error('Erreur déconnexion :', error.message);

      return res.status(500).json({
        error: 'Impossible de fermer la session.'
      });
    }

    res.clearCookie('odm.sid', cookieOptions);

    return res.status(200).json({
      message: 'Déconnexion effectuée.'
    });
  });
});

module.exports = router;
