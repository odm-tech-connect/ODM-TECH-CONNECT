import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../postgres.js';

const router = express.Router();

const partnershipLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

router.post('/', partnershipLimiter, async (req, res) => {
  try {
    const user = req.session && req.session.user;

    if (!user) {
      return res.status(401).json({
        error: 'Veuillez vous connecter.'
      });
    }

    if (
      user.role !== 'company' ||
      !Number.isInteger(Number(user.companyId))
    ) {
      return res.status(403).json({
        error: 'Seules les entreprises peuvent envoyer une demande.'
      });
    }

    const receiverCompanyId = Number(
      req.body && req.body.receiverCompanyId
    );

    const message = req.body && req.body.message;

    if (
      !Number.isInteger(receiverCompanyId) ||
      receiverCompanyId <= 0 ||
      typeof message !== 'string'
    ) {
      return res.status(400).json({
        error: 'Informations de partenariat invalides.'
      });
    }

    const cleanMessage = message.trim();

    if (cleanMessage.length < 10 || cleanMessage.length > 3000) {
      return res.status(400).json({
        error: 'Le message doit contenir entre 10 et 3000 caractères.'
      });
    }

    const senderCompanyId = Number(user.companyId);

    if (senderCompanyId === receiverCompanyId) {
      return res.status(400).json({
        error: 'Vous ne pouvez pas envoyer une demande à votre propre entreprise.'
      });
    }

    const senderResult = await pool.query(
      `SELECT c.id, c.approval_status
       FROM companies c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = $1
         AND u.email_verified = TRUE`,
      [senderCompanyId]
    );

    const sender = senderResult.rows[0];

    if (!sender || sender.approval_status !== 'approved') {
      return res.status(403).json({
        error: 'Votre entreprise doit être approuvée.'
      });
    }

    const receiverResult = await pool.query(
      `SELECT c.id
       FROM companies c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = $1
         AND c.approval_status = 'approved'
         AND u.email_verified = TRUE`,
      [receiverCompanyId]
    );

    if (!receiverResult.rows[0]) {
      return res.status(404).json({
        error: 'Entreprise destinataire introuvable ou non approuvée.'
      });
    }

    const existing = await pool.query(
      `SELECT id
       FROM partnership_requests
       WHERE sender_company_id = $1
         AND receiver_company_id = $2
         AND status = 'pending'
       LIMIT 1`,
      [senderCompanyId, receiverCompanyId]
    );

    if (existing.rows[0]) {
      return res.status(409).json({
        error: 'Une demande de partenariat est déjà en attente.'
      });
    }

    const result = await pool.query(
      `INSERT INTO partnership_requests (
         sender_company_id,
         receiver_company_id,
         message,
         status
       )
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [senderCompanyId, receiverCompanyId, cleanMessage]
    );

    return res.status(201).json({
      success: true,
      message: 'Votre demande de partenariat a été envoyée.',
      reference: Number(result.rows[0].id)
    });

  } catch (error) {
    console.error('Erreur création partenariat :', error.message);

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Une demande de partenariat existe déjà.'
      });
    }

    return res.status(500).json({
      error: 'Impossible d envoyer la demande de partenariat.'
    });
  }
});

export default router;
