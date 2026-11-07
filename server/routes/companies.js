import express from 'express';
import { pool } from '../postgres.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string'
      ? req.query.search.trim().slice(0, 100)
      : '';

    const country = typeof req.query.country === 'string'
      ? req.query.country.trim().slice(0, 100)
      : '';

    const sector = typeof req.query.sector === 'string'
      ? req.query.sector.trim().slice(0, 100)
      : '';

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
      50
    );

    const offset = Math.max(
      Number.parseInt(req.query.offset, 10) || 0,
      0
    );

    const conditions = [
      "c.approval_status = 'approved'",
      'u.email_verified = TRUE'
    ];

    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(c.name ILIKE $${params.length} OR c.description ILIKE $${params.length})`
      );
    }

    if (country) {
      params.push(`%${country}%`);
      conditions.push(`c.country ILIKE $${params.length}`);
    }

    if (sector) {
      params.push(`%${sector}%`);
      conditions.push(`c.sector ILIKE $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM companies c
       JOIN users u ON u.id = c.user_id
       WHERE ${where}`,
      params
    );

    const listParams = [...params, limit, offset];

    const companiesResult = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.country,
         c.sector,
         c.description,
         c.website,
         c.created_at
       FROM companies c
       JOIN users u ON u.id = c.user_id
       WHERE ${where}
       ORDER BY LOWER(c.name) ASC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams
    );

    return res.json({
      success: true,
      total: totalResult.rows[0].total,
      limit,
      offset,
      companies: companiesResult.rows
    });

  } catch (error) {
    console.error('Erreur annuaire :', error.message);
    return res.status(500).json({
      error: 'Impossible de charger l annuaire.'
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'Identifiant invalide.'
      });
    }

    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.country,
         c.sector,
         c.description,
         c.website,
         c.created_at
       FROM companies c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = $1
         AND c.approval_status = 'approved'
         AND u.email_verified = TRUE`,
      [id]
    );

    const company = result.rows[0];

    if (!company) {
      return res.status(404).json({
        error: 'Entreprise introuvable.'
      });
    }

    return res.json({
      success: true,
      company
    });

  } catch (error) {
    console.error('Erreur fiche entreprise :', error.message);
    return res.status(500).json({
      error: 'Impossible de charger cette entreprise.'
    });
  }
});

export default router;
