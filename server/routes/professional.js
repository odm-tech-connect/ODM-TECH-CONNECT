import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../postgres.js';

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

async function requireCompany(req, res, next) {
  try {
    const user = req.session && req.session.user;

    if (!user || user.role !== 'company' || !user.companyId) {
      return res.status(401).json({
        error: 'Connexion entreprise requise.'
      });
    }

    const result = await pool.query(`
      SELECT
        c.id, c.name, c.country, c.sector,
        c.description, c.website, c.approval_status,
        u.email_verified
      FROM companies c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = $1 AND u.id = $2
    `, [user.companyId, user.id]);

    const company = result.rows[0];

    if (!company ||
        company.approval_status !== 'approved' ||
        company.email_verified !== true) {
      return res.status(403).json({
        error: 'Compte entreprise non vérifié ou non approuvé.'
      });
    }

    req.company = company;
    next();
  } catch (error) {
    console.error('Erreur vérification entreprise :', error.message);
    res.status(500).json({
      error: 'Impossible de vérifier le compte entreprise.'
    });
  }
}

function validText(value, max) {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= max;
}

router.get('/catalogue', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id, p.name, p.category, p.description,
        p.price, p.currency, p.availability,
        c.id AS company_id,
        c.name AS company_name,
        c.country
      FROM products p
      JOIN companies c ON c.id = p.company_id
      JOIN users u ON u.id = c.user_id
      WHERE p.status = 'active'
        AND c.approval_status = 'approved'
        AND u.email_verified = TRUE
      ORDER BY p.created_at DESC
      LIMIT 100
    `);

    res.json({ products: result.rows });
  } catch (error) {
    console.error('Erreur catalogue public :', error.message);
    res.status(500).json({
      error: 'Impossible de charger le catalogue.'
    });
  }
});

router.use(requireCompany);
router.use(writeLimiter);

router.get('/profile', (req, res) => {
  res.json({ company: req.company });
});

router.patch('/profile', async (req, res) => {
  try {
    const sector = req.body && req.body.sector;
    const description = req.body && req.body.description;
    const website = req.body && req.body.website;

    if (!validText(sector, 100) || !validText(description, 2000)) {
      return res.status(400).json({
        error: 'Secteur ou description invalide.'
      });
    }

    if (website !== undefined && website !== '' &&
        (typeof website !== 'string' || !/^https?:\/\/.{3,}/i.test(website))) {
      return res.status(400).json({
        error: 'Adresse du site web invalide.'
      });
    }

    await pool.query(`
      UPDATE companies
      SET sector = $1, description = $2, website = $3
      WHERE id = $4
    `, [
      sector.trim(),
      description.trim(),
      website || null,
      req.company.id
    ]);

    res.json({
      success: true,
      message: 'Profil mis à jour.'
    });
  } catch (error) {
    console.error('Erreur modification profil :', error.message);
    res.status(500).json({
      error: 'Impossible de modifier le profil.'
    });
  }
});

router.get('/products', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM products
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [req.company.id]);

    res.json({ products: result.rows });
  } catch (error) {
    console.error('Erreur liste produits :', error.message);
    res.status(500).json({
      error: 'Impossible de charger les produits.'
    });
  }
});

router.post('/products', async (req, res) => {
  try {
    const b = req.body || {};

    if (!validText(b.name, 150) ||
        !validText(b.category, 100) ||
        !validText(b.description, 2000)) {
      return res.status(400).json({
        error: 'Nom, catégorie et description sont obligatoires.'
      });
    }

    const price = b.price === null || b.price === undefined || b.price === ''
      ? null
      : Number(b.price);

    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return res.status(400).json({ error: 'Prix invalide.' });
    }

    const result = await pool.query(`
      INSERT INTO products
        (company_id, name, category, description, price, currency)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      req.company.id,
      b.name.trim(),
      b.category.trim(),
      b.description.trim(),
      price,
      validText(b.currency, 5) ? b.currency.trim().toUpperCase() : 'USD'
    ]);

    res.status(201).json({
      success: true,
      productId: Number(result.rows[0].id)
    });
  } catch (error) {
    console.error('Erreur création produit :', error.message);
    res.status(500).json({
      error: 'Impossible de créer le produit.'
    });
  }
});

router.patch('/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};

    if (!Number.isSafeInteger(id) || id <= 0 ||
        !validText(b.name, 150) ||
        !validText(b.category, 100) ||
        !validText(b.description, 2000)) {
      return res.status(400).json({
        error: 'Données du produit invalides.'
      });
    }

    const result = await pool.query(`
      UPDATE products
      SET name = $1,
          category = $2,
          description = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND company_id = $5
    `, [
      b.name.trim(),
      b.category.trim(),
      b.description.trim(),
      id,
      req.company.id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur modification produit :', error.message);
    res.status(500).json({
      error: 'Impossible de modifier le produit.'
    });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'Identifiant invalide.'
      });
    }

    const result = await pool.query(`
      UPDATE products
      SET status = 'inactive',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND company_id = $2
    `, [id, req.company.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression produit :', error.message);
    res.status(500).json({
      error: 'Impossible de désactiver le produit.'
    });
  }
});

router.get('/partnerships', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.*,
        s.name AS sender_name,
        r.name AS receiver_name
      FROM partnership_requests p
      JOIN companies s ON s.id = p.sender_company_id
      JOIN companies r ON r.id = p.receiver_company_id
      WHERE p.sender_company_id = $1
         OR p.receiver_company_id = $1
      ORDER BY p.created_at DESC
    `, [req.company.id]);

    res.json({ partnerships: result.rows });
  } catch (error) {
    console.error('Erreur partenariats entreprise :', error.message);
    res.status(500).json({
      error: 'Impossible de charger les partenariats.'
    });
  }
});

router.patch('/partnerships/:id/respond', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = req.body && req.body.status;

    if (!Number.isSafeInteger(id) || id <= 0 ||
        !['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Réponse invalide.' });
    }

    const result = await pool.query(`
      UPDATE partnership_requests
      SET status = $1
      WHERE id = $2
        AND receiver_company_id = $3
        AND status = 'pending'
    `, [status, id, req.company.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Demande introuvable ou déjà traitée.'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur réponse partenariat :', error.message);
    res.status(500).json({
      error: 'Impossible de répondre à la demande.'
    });
  }
});

router.post('/quotes', async (req, res) => {
  try {
    const b = req.body || {};
    const sellerId = Number(b.sellerCompanyId);
    const productId = b.productId === null ||
      b.productId === undefined ||
      b.productId === ''
      ? null
      : Number(b.productId);
    const quantity = Number(b.quantity || 1);

    if (!Number.isSafeInteger(sellerId) || sellerId <= 0 ||
        sellerId === req.company.id ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 || quantity > 100000 ||
        !validText(b.message, 2000)) {
      return res.status(400).json({
        error: 'Demande de devis invalide.'
      });
    }

    const seller = await pool.query(`
      SELECT c.id
      FROM companies c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = $1
        AND c.approval_status = 'approved'
        AND u.email_verified = TRUE
    `, [sellerId]);

    if (seller.rowCount === 0) {
      return res.status(404).json({
        error: 'Entreprise destinataire introuvable.'
      });
    }

    if (productId !== null) {
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Produit invalide.' });
      }

      const product = await pool.query(`
        SELECT id
        FROM products
        WHERE id = $1
          AND company_id = $2
          AND status = 'active'
      `, [productId, sellerId]);

      if (product.rowCount === 0) {
        return res.status(400).json({
          error: 'Produit indisponible.'
        });
      }
    }

    const result = await pool.query(`
      INSERT INTO quote_requests
        (buyer_company_id, seller_company_id, product_id, quantity, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      req.company.id,
      sellerId,
      productId,
      quantity,
      b.message.trim()
    ]);

    res.status(201).json({
      success: true,
      quoteId: Number(result.rows[0].id)
    });
  } catch (error) {
    console.error('Erreur création devis :', error.message);
    res.status(500).json({
      error: 'Impossible de créer la demande de devis.'
    });
  }
});

router.get('/quotes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        q.*,
        buyer.name AS buyer_name,
        seller.name AS seller_name,
        p.name AS product_name
      FROM quote_requests q
      JOIN companies buyer ON buyer.id = q.buyer_company_id
      JOIN companies seller ON seller.id = q.seller_company_id
      LEFT JOIN products p ON p.id = q.product_id
      WHERE q.buyer_company_id = $1
         OR q.seller_company_id = $1
      ORDER BY q.created_at DESC
    `, [req.company.id]);

    res.json({ quotes: result.rows });
  } catch (error) {
    console.error('Erreur liste devis :', error.message);
    res.status(500).json({
      error: 'Impossible de charger les demandes de devis.'
    });
  }
});

export default router;
