import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../postgres.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Vous devez être connecté.' });
  }
  next();
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, product_id, quantity, created_at FROM cart_items WHERE user_id = $1 ORDER BY created_at DESC',
      [req.session.user.id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Impossible de charger le panier.' });
  }
});

const cartLimiter = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

router.post('/', requireAuth, cartLimiter, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body || {};
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Produit invalide.' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return res.status(400).json({ error: 'Quantité invalide.' });
    const userId = req.session.user.id;
    const existing = await pool.query('SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
    if (existing.rows.length > 0) {
      await pool.query('UPDATE cart_items SET quantity = quantity + $1 WHERE id = $2', [quantity, existing.rows[0].id]);
    } else {
      await pool.query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)', [userId, productId, quantity]);
    }
    return res.status(201).json({ message: 'Produit ajouté au panier.' });
  } catch (error) {
    return res.status(500).json({ error: 'Impossible d ajouter au panier.' });
  }
});

router.put('/:itemId', requireAuth, async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const { quantity } = req.body || {};
    if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Quantité invalide.' });
    await pool.query('UPDATE cart_items SET quantity = $1 WHERE id = $2 AND user_id = $3', [quantity, itemId, req.session.user.id]);
    return res.status(200).json({ message: 'Quantité mise à jour.' });
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

router.delete('/:itemId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [parseInt(req.params.itemId, 10), req.session.user.id]);
    return res.status(200).json({ message: 'Produit retiré.' });
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

router.delete('/', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.session.user.id]);
    return res.status(200).json({ message: 'Panier vidé.' });
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

export default router;
