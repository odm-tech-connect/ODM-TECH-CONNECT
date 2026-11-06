'use strict';

const express = require('express');
const { pool } = require('../postgres');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      error: 'Connexion administrateur requise.'
    });
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Accès réservé à l’administration.'
    });
  }

  next();
}

router.use(requireAdmin);

router.get('/dashboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM companies) AS companies,
        (SELECT COUNT(*) FROM companies WHERE approval_status = 'pending') AS pending_companies,
        (SELECT COUNT(*) FROM contact_requests WHERE status = 'new') AS new_contacts,
        (SELECT COUNT(*) FROM partnership_requests WHERE status = 'pending') AS pending_partnerships
    `);

    const row = result.rows[0];

    res.json({
      success: true,
      statistics: {
        companies: Number(row.companies),
        pendingCompanies: Number(row.pending_companies),
        newContacts: Number(row.new_contacts),
        pendingPartnerships: Number(row.pending_partnerships)
      }
    });
  } catch (error) {
    console.error('Erreur tableau de bord :', error.message);
    res.status(500).json({
      error: 'Impossible de charger les statistiques.'
    });
  }
});

router.get('/companies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.country,
        c.sector,
        c.description,
        c.website,
        c.approval_status,
        c.created_at,
        u.email,
        u.email_verified
      FROM companies c
      JOIN users u ON u.id = c.user_id
      ORDER BY c.created_at DESC
    `);

    res.json({ success: true, companies: result.rows });
  } catch (error) {
    console.error('Erreur liste entreprises :', error.message);
    res.status(500).json({
      error: 'Impossible de charger les entreprises.'
    });
  }
});

router.patch('/companies/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    if (status === 'approved') {
      const verification = await pool.query(`
        SELECT u.email_verified
        FROM companies c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
      `, [id]);

      if (verification.rowCount === 0 || verification.rows[0].email_verified !== true) {
        return res.status(403).json({
          error: 'Vérifiez l’adresse e-mail de cette entreprise avant de l’approuver.'
        });
      }
    }

    const result = await pool.query(`
      UPDATE companies
      SET approval_status = $1
      WHERE id = $2
    `, [status, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Entreprise introuvable.' });
    }

    res.json({
      success: true,
      message: status === 'approved'
        ? 'Entreprise approuvée.'
        : 'Entreprise refusée.'
    });
  } catch (error) {
    console.error('Erreur statut entreprise :', error.message);
    res.status(500).json({
      error: 'Impossible de modifier le statut.'
    });
  }
});

router.get('/contacts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, request_type, company_name, country,
        contact_name, email, sector, collaboration,
        message, language, status, created_at
      FROM contact_requests
      ORDER BY created_at DESC
    `);

    res.json({ success: true, contacts: result.rows });
  } catch (error) {
    console.error('Erreur liste des contacts :', error.message);
    res.status(500).json({
      error: 'Impossible de charger les demandes.'
    });
  }
});

router.patch('/contacts/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    if (!['new', 'reviewing', 'answered', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const result = await pool.query(`
      UPDATE contact_requests
      SET status = $1
      WHERE id = $2
    `, [status, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Demande introuvable.' });
    }

    res.json({
      success: true,
      message: 'Statut de la demande mis à jour.',
      status
    });
  } catch (error) {
    console.error('Erreur statut contact :', error.message);
    res.status(500).json({
      error: 'Impossible de modifier le statut.'
    });
  }
});

router.get('/partnerships', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.sender_company_id,
        p.receiver_company_id,
        p.message,
        p.status,
        p.created_at,
        sender.name AS sender_name,
        sender.country AS sender_country,
        sender.sector AS sender_sector,
        receiver.name AS receiver_name,
        receiver.country AS receiver_country,
        receiver.sector AS receiver_sector
      FROM partnership_requests p
      JOIN companies sender ON sender.id = p.sender_company_id
      JOIN companies receiver ON receiver.id = p.receiver_company_id
      ORDER BY p.created_at DESC
    `);

    res.json({ success: true, partnerships: result.rows });
  } catch (error) {
    console.error('Erreur liste des partenariats :', error.message);
    res.status(500).json({
      error: 'Impossible de charger les demandes de partenariat.'
    });
  }
});

router.patch('/partnerships/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const result = await pool.query(`
      UPDATE partnership_requests
      SET status = $1
      WHERE id = $2
    `, [status, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Demande introuvable.' });
    }

    res.json({
      success: true,
      message: status === 'accepted'
        ? 'Demande de partenariat acceptée.'
        : 'Demande de partenariat refusée.',
      status
    });
  } catch (error) {
    console.error('Erreur statut partenariat :', error.message);
    res.status(500).json({
      error: 'Impossible de modifier le statut du partenariat.'
    });
  }
});

module.exports = router;
