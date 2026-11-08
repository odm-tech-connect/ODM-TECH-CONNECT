import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { pool, withTransaction } from '../postgres.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Vous devez être connecté.' });
  }
  next();
}

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

// GET /api/messages — Liste des conversations
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const result = await pool.query(
      `SELECT DISTINCT
         CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
         u.email AS other_user_email,
         c.name AS other_user_name,
         (SELECT content FROM messages m2
          WHERE (m2.sender_id = $1 AND m2.receiver_id = other_user_id)
             OR (m2.receiver_id = $1 AND m2.sender_id = other_user_id)
          ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
         (SELECT created_at FROM messages m2
          WHERE (m2.sender_id = $1 AND m2.receiver_id = other_user_id)
             OR (m2.receiver_id = $1 AND m2.sender_id = other_user_id)
          ORDER BY m2.created_at DESC LIMIT 1) AS last_message_time,
         (SELECT COUNT(*) FROM messages m3
          WHERE m3.sender_id = other_user_id AND m3.receiver_id = $1 AND m3.is_read = FALSE) AS unread_count
       FROM messages m
       JOIN users u ON u.id = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
       LEFT JOIN companies c ON c.user_id = u.id
       WHERE m.sender_id = $1 OR m.receiver_id = $1
       ORDER BY last_message_time DESC NULLS LAST`,
      [userId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erreur liste conversations :', error.message);
    return res.status(500).json({ error: 'Impossible de charger les conversations.' });
  }
});

// GET /api/messages/search?q= — Rechercher un utilisateur
router.get('/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(200).json([]);
    }

    const userId = req.session.user.id;
    const result = await pool.query(
      `SELECT u.id, u.email, c.name
       FROM users u
       LEFT JOIN companies c ON c.user_id = u.id
       WHERE u.id != $1
         AND u.email_verified = TRUE
         AND (c.name ILIKE $2 OR u.email ILIKE $2)
       ORDER BY c.name ASC
       LIMIT 20`,
      [userId, `%${q}%`]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erreur recherche utilisateurs :', error.message);
    return res.status(500).json({ error: 'Impossible de rechercher.' });
  }
});

// GET /api/messages/:userId — Conversation avec un utilisateur
router.get('/:otherUserId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const otherUserId = parseInt(req.params.otherUserId, 10);

    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      return res.status(400).json({ error: 'Utilisateur invalide.' });
    }

    const result = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at
       FROM messages m
       WHERE (m.sender_id = $1 AND m.receiver_id = $2)
          OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at ASC`,
      [userId, otherUserId]
    );

    await pool.query(
      `UPDATE messages SET is_read = TRUE
       WHERE receiver_id = $1 AND sender_id = $2 AND is_read = FALSE`,
      [userId, otherUserId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erreur conversation :', error.message);
    return res.status(500).json({ error: 'Impossible de charger la conversation.' });
  }
});

// POST /api/messages — Envoyer un message
router.post('/', requireAuth, messageLimiter, async (req, res) => {
  try {
    const senderId = req.session.user.id;
    const { receiverId, content } = req.body || {};

    if (!Number.isInteger(receiverId) || receiverId <= 0) {
      return res.status(400).json({ error: 'Destinataire invalide.' });
    }

    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Le message ne peut pas être vide.' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ error: 'Le message est trop long (5000 caractères max).' });
    }

    if (receiverId === senderId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous envoyer un message à vous-même.' });
    }

    const message = await withTransaction(async (client) => {
      const receiverResult = await client.query(
        'SELECT id FROM users WHERE id = $1 AND email_verified = TRUE',
        [receiverId]
      );

      if (receiverResult.rows.length === 0) {
        const error = new Error('Destinataire introuvable.');
        error.code = 'NOT_FOUND';
        throw error;
      }

      const insertResult = await client.query(
        `INSERT INTO messages (sender_id, receiver_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, created_at`,
        [senderId, receiverId, content.trim()]
      );

      return insertResult.rows[0];
    });

    return res.status(201).json({
      message: 'Message envoyé.',
      data: message
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Destinataire introuvable.' });
    }
    console.error('Erreur envoi message :', error.message);
    return res.status(500).json({ error: 'Impossible d envoyer le message.' });
  }
});

export default router;
