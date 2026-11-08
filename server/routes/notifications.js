import express from 'express';
import { pool } from '../postgres.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Vous devez être connecté.' });
  next();
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, type, title, content, link, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.session.user.id]);
    const unreadResult = await pool.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE', [req.session.user.id]);
    return res.status(200).json({ notifications: result.rows, unreadCount: parseInt(unreadResult.rows[0].count, 10) });
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [parseInt(req.params.id, 10), req.session.user.id]);
    return res.status(200).json({ message: 'Marqué comme lu.' });
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [req.session.user.id]);
    return res.status(200).json({ message: 'Toutes lues.' });
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

export default router;
