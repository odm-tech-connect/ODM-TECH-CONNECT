'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { pool } = require('../postgres');

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Trop de demandes. Veuillez réessayer plus tard.'
  }
});

router.post('/', contactLimiter, async (req, res) => {
  try {
    const {
      requestType,
      companyName,
      country,
      contactName,
      email,
      sector,
      collaboration,
      message,
      language,
      consent
    } = req.body || {};

    const fields = [
      requestType,
      companyName,
      country,
      contactName,
      email,
      sector,
      collaboration,
      message
    ];

    if (!fields.every(value => typeof value === 'string')) {
      return res.status(400).json({
        error: 'Veuillez remplir tous les champs obligatoires.'
      });
    }

    const clean = fields.map(value => value.trim());

    const [
      cleanType,
      cleanCompany,
      cleanCountry,
      cleanContact,
      cleanEmail,
      cleanSector,
      cleanCollaboration,
      cleanMessage
    ] = clean;

    if (
      cleanType.length < 2 || cleanType.length > 80 ||
      cleanCompany.length < 2 || cleanCompany.length > 120 ||
      cleanCountry.length < 2 || cleanCountry.length > 100 ||
      cleanContact.length < 2 || cleanContact.length > 120 ||
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
      cleanSector.length < 2 || cleanSector.length > 100 ||
      cleanCollaboration.length < 2 || cleanCollaboration.length > 120 ||
      cleanMessage.length < 10 || cleanMessage.length > 5000
    ) {
      return res.status(400).json({
        error: 'Certaines informations sont invalides ou trop longues.'
      });
    }

    if (consent !== true) {
      return res.status(400).json({
        error: 'Votre consentement est obligatoire.'
      });
    }

    const cleanLanguage = language === 'en' ? 'en' : 'fr';

    const result = await pool.query(
      `INSERT INTO contact_requests (
         request_type,
         company_name,
         country,
         contact_name,
         email,
         sector,
         collaboration,
         message,
         language,
         consent_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id`,
      [
        cleanType,
        cleanCompany,
        cleanCountry,
        cleanContact,
        cleanEmail.toLowerCase(),
        cleanSector,
        cleanCollaboration,
        cleanMessage,
        cleanLanguage
      ]
    );

    return res.status(201).json({
      success: true,
      message: cleanLanguage === 'en'
        ? 'Your enquiry has been received.'
        : 'Votre demande a bien été reçue.',
      reference: Number(result.rows[0].id)
    });

  } catch (error) {
    console.error('Erreur réception demande :', error.message);

    return res.status(500).json({
      error: 'Impossible de recevoir votre demande pour le moment.'
    });
  }
});

module.exports = router;
