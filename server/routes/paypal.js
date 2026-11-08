import express from 'express';
import { pool } from '../postgres.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Vous devez être connecté.' });
  next();
}

const PAYPAL_BASE = process.env.NODE_ENV === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function getPayPalToken() {
  const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET).toString('base64');
  const res = await fetch(PAYPAL_BASE + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token;
}

// POST /api/paypal/create-order — Créer une commande PayPal
router.post('/create-order', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { orderId } = req.body || {};

    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Commande invalide.' });

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [orderId, userId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Commande introuvable.' });

    const order = orderResult.rows[0];
    const token = await getPayPalToken();

    const paypalRes = await fetch(PAYPAL_BASE + '/v2/checkout/orders', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: String(order.id),
          amount: { currency_code: order.currency, value: order.total_amount.toFixed(2) },
          description: 'ODM Tech Connect - Commande #' + order.id
        }],
        application_context: {
          brand_name: 'ODM TECH CONNECT',
          return_url: (process.env.APP_BASE_URL || '') + '/cart.html?paypal=success&order=' + orderId,
          cancel_url: (process.env.APP_BASE_URL || '') + '/cart.html?paypal=cancelled',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING'
        }
      })
    });

    const paypalData = await paypalRes.json();
    if (!paypalRes.ok) return res.status(400).json({ error: 'Erreur PayPal: ' + (paypalData.message || '') });

    await pool.query('UPDATE orders SET payment_reference = $1, payment_status = $2 WHERE id = $3', [paypalData.id, 'pending', orderId]);

    const approveLink = paypalData.links.find(l => l.rel === 'approve');
    return res.status(200).json({ paypalOrderId: paypalData.id, approveUrl: approveLink ? approveLink.href : null });
  } catch (error) {
    console.error('Erreur PayPal create:', error.message);
    return res.status(500).json({ error: 'Impossible de créer le paiement PayPal.' });
  }
});

// POST /api/paypal/capture — Capturer le paiement après approbation
router.post('/capture', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { paypalOrderId, orderId } = req.body || {};

    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Commande invalide.' });
    if (!paypalOrderId) return res.status(400).json({ error: 'ID PayPal manquant.' });

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [orderId, userId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Commande introuvable.' });

    const token = await getPayPalToken();
    const captureRes = await fetch(PAYPAL_BASE + '/v2/checkout/orders/' + paypalOrderId + '/capture', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    });

    const captureData = await captureRes.json();
    if (!captureRes.ok) return res.status(400).json({ error: 'Paiement échoué: ' + (captureData.message || '') });

    await pool.query("UPDATE orders SET payment_status = 'paid', status = 'paid', payment_reference = $1 WHERE id = $2", [paypalOrderId, orderId]);

    const sellerId = orderResult.rows[0].seller_id;
    await pool.query("INSERT INTO notifications (user_id, type, title, content, link) VALUES ($1, 'payment', 'Paiement recu', 'Paiement PayPal confirme pour la commande #' || $2, '/dashboard')", [sellerId, orderId]);

    return res.status(200).json({ message: 'Paiement confirme avec succes.', status: 'paid' });
  } catch (error) {
    console.error('Erreur PayPal capture:', error.message);
    return res.status(500).json({ error: 'Impossible de confirmer le paiement.' });
  }
});

export default router;
