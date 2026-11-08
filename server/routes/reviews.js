import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../postgres.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Vous devez être connecté.' });
  next();
}

router.get('/:companyId', async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId, 10);
    const result = await pool.query(
      `SELECT r.id, r.rating, r.title, r.content, r.is_verified_purchase, r.created_at, u.email AS reviewer_email, c.name AS reviewer_name
       FROM reviews r JOIN users u ON u.id = r.reviewer_id LEFT JOIN companies c ON c.user_id = u.id
       WHERE r.company_id = $1 ORDER BY r.created_at DESC`, [companyId]
    );
    const avgResult = await pool.query('SELECT AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as total FROM reviews WHERE company_id = $1', [companyId]);
    return res.status(200).json({ reviews: result.rows, average: avgResult.rows[0].avg_rating || 0, total: avgResult.rows[0].total || 0 });
  } catch (error) { return res.status(500).json({ error: 'Impossible de charger les avis.' }); }
});

const reviewLimiter = rateLimit({ windowMs: 3600000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

router.post('/', requireAuth, reviewLimiter, async (req, res) => {
  try {
    const { companyId, rating, title, content } = req.body || {};
    if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ error: 'Entreprise invalide.' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'La note doit être entre 1 et 5.' });
    if (!content || content.trim().length < 10) return res.status(400).json({ error: 'L avis doit contenir au moins 10 caractères.' });
    const reviewerId = req.session.user.id;
    const existing = await pool.query('SELECT id FROM reviews WHERE reviewer_id = $1 AND company_id = $2', [reviewerId, companyId]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Vous avez déjà laissé un avis.' });
    const verifiedPurchase = await pool.query('SELECT 1 FROM orders o JOIN companies c ON c.user_id = o.seller_id WHERE o.buyer_id = $1 AND c.id = $2 AND o.status = $3 LIMIT 1', [reviewerId, companyId, 'delivered']);
    const isVerified = verifiedPurchase.rows.length > 0;
    await pool.query('INSERT INTO reviews (reviewer_id, company_id, rating, title, content, is_verified_purchase) VALUES ($1, $2, $3, $4, $5, $6)', [reviewerId, companyId, rating, title || null, content.trim(), isVerified]);
    return res.status(201).json({ message: 'Avis publié.', verified: isVerified });
  } catch (error) { return res.status(500).json({ error: 'Impossible de publier l avis.' }); }
});

export default router;
