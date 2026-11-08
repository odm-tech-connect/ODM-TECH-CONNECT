import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { pool, withTransaction } from '../postgres.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Vous devez être connecté.' });
  next();
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role = req.query.role || 'buyer';
    let query, params;
    if (role === 'seller') {
      query = `SELECT o.*, u.email AS buyer_email, c.name AS buyer_name FROM orders o JOIN users u ON u.id = o.buyer_id LEFT JOIN companies c ON c.user_id = u.id WHERE o.seller_id = $1 ORDER BY o.created_at DESC`;
      params = [userId];
    } else {
      query = `SELECT o.*, u.email AS seller_email, c.name AS seller_name FROM orders o JOIN users u ON u.id = o.seller_id LEFT JOIN companies c ON c.user_id = u.id WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`;
      params = [userId];
    }
    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (error) { return res.status(500).json({ error: 'Impossible de charger les commandes.' }); }
});

router.get('/:orderId', requireAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const userId = req.session.user.id;
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [orderId, userId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Commande introuvable.' });
    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    return res.status(200).json({ order: orderResult.rows[0], items: itemsResult.rows });
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

const orderLimiter = rateLimit({ windowMs: 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });

router.post('/', requireAuth, orderLimiter, async (req, res) => {
  try {
    const buyerId = req.session.user.id;
    const { shippingAddress, shippingCountry, paymentMethod, notes } = req.body || {};
    if (!shippingAddress || !shippingCountry) return res.status(400).json({ error: 'Adresse et pays de livraison requis.' });
    if (!paymentMethod) return res.status(400).json({ error: 'Méthode de paiement requise.' });
    const order = await withTransaction(async (client) => {
      const cartResult = await client.query('SELECT product_id, quantity FROM cart_items WHERE user_id = $1', [buyerId]);
      if (cartResult.rows.length === 0) throw new Error('PANIER_VIDE');
      let totalAmount = 0;
      const items = [];
      for (const item of cartResult.rows) {
        const productResult = await client.query('SELECT id, seller_id, name, price FROM products WHERE id = $1', [item.product_id]);
        if (productResult.rows.length === 0) throw new Error('Produit introuvable.');
        const product = productResult.rows[0];
        const subtotal = parseFloat(product.price) * item.quantity;
        totalAmount += subtotal;
        items.push({ productId: product.id, sellerId: product.seller_id, productName: product.name, unitPrice: parseFloat(product.price), quantity: item.quantity, subtotal });
      }
      const sellerId = items[0].sellerId;
      const orderResult = await client.query('INSERT INTO orders (buyer_id, seller_id, total_amount, currency, shipping_address, shipping_country, payment_method, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id', [buyerId, sellerId, totalAmount, 'USD', shippingAddress, shippingCountry, paymentMethod, notes || null]);
      const orderId = orderResult.rows[0].id;
      for (const item of items) {
        await client.query('INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal) VALUES ($1, $2, $3, $4, $5, $6)', [orderId, item.productId, item.productName, item.unitPrice, item.quantity, item.subtotal]);
      }
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [buyerId]);
      await client.query('INSERT INTO notifications (user_id, type, title, content, link) VALUES ($1, $2, $3, $4, $5)', [sellerId, 'order', 'Nouvelle commande', 'Vous avez recu une nouvelle commande #' + orderId, '/dashboard']);
      return { id: orderId, totalAmount };
    });
    return res.status(201).json({ message: 'Commande créée.', orderId: order.id, totalAmount: order.totalAmount });
  } catch (error) {
    if (error.message === 'PANIER_VIDE') return res.status(400).json({ error: 'Votre panier est vide.' });
    return res.status(500).json({ error: 'Impossible de créer la commande.' });
  }
});

router.patch('/:orderId/status', requireAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const { status } = req.body || {};
    const validStatuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
    const userId = req.session.user.id;
    const order = await pool.query('SELECT seller_id, buyer_id FROM orders WHERE id = $1', [orderId]);
    if (order.rows.length === 0) return res.status(404).json({ error: 'Commande introuvable.' });
    if (order.rows[0].seller_id !== userId && status !== 'cancelled') return res.status(403).json({ error: 'Action non autorisée.' });
    await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, orderId]);
    const notifyUserId = order.rows[0].seller_id === userId ? order.rows[0].buyer_id : order.rows[0].seller_id;
    await pool.query('INSERT INTO notifications (user_id, type, title, content, link) VALUES ($1, $2, $3, $4, $5)', [notifyUserId, 'order_status', 'Statut mis à jour', 'Commande #' + orderId + ' est maintenant: ' + status, '/dashboard']);
    return res.status(200).json({ message: 'Statut mis à jour.' });
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

export default router;
