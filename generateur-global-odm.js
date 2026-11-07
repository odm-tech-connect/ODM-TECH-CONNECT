'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = process.cwd();
const appPath = path.join(root, 'server/app.js');
const routePath = path.join(root, 'server/routes/professional.js');
const htmlPath = path.join(root, 'public/professional.html');
const jsPath = path.join(root, 'public/professional.js');
const cssPath = path.join(root, 'public/professional.css');

function stop(message) {
  console.error('\nARRÊT SÉCURISÉ : ' + message);
  process.exit(1);
}

for (const file of [
  'package.json',
  'server/app.js',
  'server/db.js',
  'server/odm.sqlite',
  'server/routes/partnerships.js',
  'server/routes/companies.js',
  'public/admin.html'
]) {
  if (!fs.existsSync(path.join(root, file))) stop('Fichier essentiel absent : ' + file);
}

for (const file of [routePath, htmlPath, jsPath, cssPath]) {
  if (fs.existsSync(file)) stop('Le fichier cible existe déjà, aucune écriture effectuée : ' + path.basename(file));
}

const app = fs.readFileSync(appPath, 'utf8');
const mount = /app\.use\(['"]\/api\/companies['"],\s*companiesRoutes\);/;

if (!mount.test(app)) {
  stop('Point de montage des entreprises non reconnu dans server/app.js. Aucun changement effectué.');
}

const backupDir = path.join(
  root, 'backups',
  'generateur-global-' + new Date().toISOString().replace(/[:.]/g, '-')
);
fs.mkdirSync(path.join(backupDir, 'fichiers'), { recursive: true });
fs.mkdirSync(path.join(backupDir, 'base-donnees'), { recursive: true });

console.log('[1/7] Sauvegarde de sécurité...');
fs.copyFileSync(appPath, path.join(backupDir, 'fichiers/app.js'));
fs.copyFileSync(
  path.join(root, 'server/routes/partnerships.js'),
  path.join(backupDir, 'fichiers/partnerships.js')
);

const db = new DatabaseSync(path.join(root, 'server/odm.sqlite'));
try {
  const dbBackup = path.join(backupDir, 'base-donnees/odm.sqlite');
  db.exec("VACUUM INTO '" + dbBackup.replace(/'/g, "''") + "'");

  console.log('[2/7] Préparation des tables professionnelles...');
  db.exec('BEGIN IMMEDIATE');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      availability TEXT NOT NULL DEFAULT 'on_request',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS quote_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_company_id INTEGER NOT NULL,
      seller_company_id INTEGER NOT NULL,
      product_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 1,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(buyer_company_id) REFERENCES companies(id),
      FOREIGN KEY(seller_company_id) REFERENCES companies(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_company
      ON products(company_id);

    CREATE INDEX IF NOT EXISTS idx_products_status
      ON products(status);

    CREATE INDEX IF NOT EXISTS idx_quotes_buyer
      ON quote_requests(buyer_company_id);

    CREATE INDEX IF NOT EXISTS idx_quotes_seller
      ON quote_requests(seller_company_id);
  `);

  db.exec('COMMIT');
} catch (error) {
  try { db.exec('ROLLBACK'); } catch {}
  db.close();
  stop('Création des tables impossible : ' + error.message);
}
db.close();

console.log('[3/7] Création des routes professionnelles...');

const routeCode = String.raw`
'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

function requireCompany(req, res, next) {
  if (!req.session || !req.session.companyId) {
    return res.status(401).json({ error: 'Connexion entreprise requise.' });
  }

  const company = db.prepare(
    'SELECT c.id, c.name, c.country, c.sector, c.description, c.website, c.approval_status, u.email_verified ' +
    'FROM companies c JOIN users u ON u.id = c.user_id WHERE c.id = ?'
  ).get(req.session.companyId);

  if (!company || company.approval_status !== 'approved' || company.email_verified !== 1) {
    return res.status(403).json({ error: 'Compte entreprise non vérifié ou non approuvé.' });
  }

  req.company = company;
  next();
}

function validText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

/* Catalogue public : placé avant la protection de connexion. */
router.get('/catalogue', (req, res) => {
  const products = db.prepare(
    "SELECT p.id, p.name, p.category, p.description, p.price, p.currency, p.availability, " +
    "c.id AS company_id, c.name AS company_name, c.country " +
    "FROM products p JOIN companies c ON c.id = p.company_id " +
    "JOIN users u ON u.id = c.user_id " +
    "WHERE p.status = 'active' AND c.approval_status = 'approved' AND u.email_verified = 1 " +
    "ORDER BY p.created_at DESC LIMIT 100"
  ).all();

  res.json({ products });
});

router.use(requireCompany);
router.use(writeLimiter);

router.get('/profile', (req, res) => {
  res.json({ company: req.company });
});

router.patch('/profile', (req, res) => {
  const sector = req.body && req.body.sector;
  const description = req.body && req.body.description;
  const website = req.body && req.body.website;

  if (!validText(sector, 100) || !validText(description, 2000)) {
    return res.status(400).json({ error: 'Secteur ou description invalide.' });
  }

  if (website !== undefined && website !== '' &&
      (typeof website !== 'string' || !/^https?:\/\/.{3,}/i.test(website))) {
    return res.status(400).json({ error: 'Adresse du site web invalide.' });
  }

  db.prepare(
    'UPDATE companies SET sector = ?, description = ?, website = ? WHERE id = ?'
  ).run(sector.trim(), description.trim(), website || null, req.company.id);

  res.json({ success: true, message: 'Profil mis à jour.' });
});

router.get('/products', (req, res) => {
  const products = db.prepare(
    'SELECT * FROM products WHERE company_id = ? ORDER BY created_at DESC'
  ).all(req.company.id);
  res.json({ products });
});

router.post('/products', (req, res) => {
  const b = req.body || {};

  if (!validText(b.name, 150) || !validText(b.category, 100) ||
      !validText(b.description, 2000)) {
    return res.status(400).json({ error: 'Nom, catégorie et description sont obligatoires.' });
  }

  const price = b.price === null || b.price === undefined || b.price === ''
    ? null : Number(b.price);

  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    return res.status(400).json({ error: 'Prix invalide.' });
  }

  const result = db.prepare(
    'INSERT INTO products (company_id, name, category, description, price, currency) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    req.company.id, b.name.trim(), b.category.trim(), b.description.trim(),
    price, validText(b.currency, 5) ? b.currency.trim().toUpperCase() : 'USD'
  );

  res.status(201).json({ success: true, productId: Number(result.lastInsertRowid) });
});

router.patch('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};

  if (!Number.isSafeInteger(id) || !validText(b.name, 150) ||
      !validText(b.category, 100) || !validText(b.description, 2000)) {
    return res.status(400).json({ error: 'Données du produit invalides.' });
  }

  const result = db.prepare(
    'UPDATE products SET name = ?, category = ?, description = ?, updated_at = CURRENT_TIMESTAMP ' +
    'WHERE id = ? AND company_id = ?'
  ).run(b.name.trim(), b.category.trim(), b.description.trim(), id, req.company.id);

  if (!result.changes) return res.status(404).json({ error: 'Produit introuvable.' });
  res.json({ success: true });
});

router.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });

  const result = db.prepare(
    "UPDATE products SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?"
  ).run(id, req.company.id);

  if (!result.changes) return res.status(404).json({ error: 'Produit introuvable.' });
  res.json({ success: true });
});

router.get('/partnerships', (req, res) => {
  const rows = db.prepare(
    'SELECT p.*, s.name AS sender_name, r.name AS receiver_name ' +
    'FROM partnership_requests p ' +
    'JOIN companies s ON s.id = p.sender_company_id ' +
    'JOIN companies r ON r.id = p.receiver_company_id ' +
    'WHERE p.sender_company_id = ? OR p.receiver_company_id = ? ' +
    'ORDER BY p.created_at DESC'
  ).all(req.company.id, req.company.id);

  res.json({ partnerships: rows });
});

router.patch('/partnerships/:id/respond', (req, res) => {
  const id = Number(req.params.id);
  const status = req.body && req.body.status;

  if (!Number.isSafeInteger(id) || !['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Réponse invalide.' });
  }

  const result = db.prepare(
    "UPDATE partnership_requests SET status = ? WHERE id = ? AND receiver_company_id = ? AND status = 'pending'"
  ).run(status, id, req.company.id);

  if (!result.changes) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
  res.json({ success: true });
});

router.post('/quotes', (req, res) => {
  const b = req.body || {};
  const sellerId = Number(b.sellerCompanyId);
  const productId = b.productId === null || b.productId === undefined || b.productId === ''
    ? null : Number(b.productId);
  const quantity = Number(b.quantity || 1);

  if (!Number.isSafeInteger(sellerId) || sellerId === req.company.id ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000 ||
      !validText(b.message, 2000)) {
    return res.status(400).json({ error: 'Demande de devis invalide.' });
  }

  const seller = db.prepare(
    "SELECT id FROM companies WHERE id = ? AND approval_status = 'approved'"
  ).get(sellerId);

  if (!seller) return res.status(404).json({ error: 'Entreprise destinataire introuvable.' });

  if (productId !== null) {
    const product = db.prepare(
      "SELECT id FROM products WHERE id = ? AND company_id = ? AND status = 'active'"
    ).get(productId, sellerId);
    if (!product) return res.status(400).json({ error: 'Produit indisponible.' });
  }

  const result = db.prepare(
    'INSERT INTO quote_requests (buyer_company_id, seller_company_id, product_id, quantity, message) VALUES (?, ?, ?, ?, ?)'
  ).run(req.company.id, sellerId, productId, quantity, b.message.trim());

  res.status(201).json({ success: true, quoteId: Number(result.lastInsertRowid) });
});

router.get('/quotes', (req, res) => {
  const quotes = db.prepare(
    'SELECT q.*, buyer.name AS buyer_name, seller.name AS seller_name, p.name AS product_name ' +
    'FROM quote_requests q ' +
    'JOIN companies buyer ON buyer.id = q.buyer_company_id ' +
    'JOIN companies seller ON seller.id = q.seller_company_id ' +
    'LEFT JOIN products p ON p.id = q.product_id ' +
    'WHERE q.buyer_company_id = ? OR q.seller_company_id = ? ' +
    'ORDER BY q.created_at DESC'
  ).all(req.company.id, req.company.id);

  res.json({ quotes });
});

module.exports = router;
`;

const html = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Espace professionnel | ODM TECH CONNECT</title>
<link rel="stylesheet" href="/professional.css">
</head>
<body>
<header><a class="brand" href="/">ODM TECH CONNECT</a><a href="/">Accueil</a></header>
<main>
<section class="intro">
<p class="eyebrow">CONNECTER · REPRÉSENTER · DÉVELOPPER</p>
<h1>Espace professionnel</h1>
<p>Gérez votre profil, vos produits, vos partenariats et vos demandes de devis.</p>
</section>
<div id="notice" role="status"></div>
<section class="panel">
<h2>Votre entreprise</h2>
<div id="profile">Chargement du profil...</div>
</section>
<section class="panel">
<h2>Ajouter un produit au catalogue</h2>
<form id="product-form">
<label>Nom du produit<input name="name" maxlength="150" required></label>
<label>Catégorie<input name="category" maxlength="100" required></label>
<label>Description<textarea name="description" maxlength="2000" required></textarea></label>
<label>Prix indicatif (facultatif)<input name="price" type="number" min="0" step="0.01"></label>
<label>Devise<input name="currency" value="USD" maxlength="5"></label>
<button type="submit">Ajouter le produit</button>
</form>
</section>
<section class="panel">
<h2>Mes produits</h2><div id="products">Chargement...</div>
</section>
<section class="panel">
<h2>Partenariats</h2><div id="partnerships">Chargement...</div>
</section>
<section class="panel">
<h2>Demandes de devis</h2><div id="quotes">Chargement...</div>
</section>
</main>
<footer>ODM TECH CONNECT — Plateforme professionnelle en développement.</footer>
<script src="/professional.js" defer></script>
</body>
</html>`;

const css = String.raw`
:root{font-family:Arial,sans-serif;color:#142b40;background:#f3f9fd}
*{box-sizing:border-box}body{margin:0}header{background:#fff;padding:18px 6%;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #dceaf4}
a{color:#087dbb;text-decoration:none}.brand{font-weight:800;letter-spacing:.4px;color:#087dbb}
main{max-width:950px;margin:30px auto;padding:0 16px}.intro{padding:30px 24px;background:linear-gradient(120deg,#dff3ff,#fff);border-radius:18px}
.eyebrow{color:#0783c5;font-weight:bold;letter-spacing:1px;font-size:12px}h1{font-size:32px;margin:8px 0}h2{font-size:20px}
.panel{background:#fff;margin:18px 0;padding:22px;border:1px solid #dfebf3;border-radius:14px}
label{display:block;font-weight:600;margin:12px 0}input,textarea{display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbdce8;border-radius:8px;font:inherit}
textarea{min-height:100px}button{background:#0783c5;color:white;border:0;padding:12px 18px;border-radius:8px;font-weight:bold;cursor:pointer}
.item{padding:13px 0;border-bottom:1px solid #e5edf3}.muted{color:#647b8d;font-size:14px}
#notice{margin:12px 0;color:#087dbb;font-weight:bold}footer{text-align:center;padding:25px;color:#63788a}
@media(max-width:600px){h1{font-size:26px}.panel{padding:16px}header{padding:15px}}
`;

const frontend = String.raw`
const notice = document.getElementById('notice');

async function api(url, options = {}) {
  const response = await fetch('/api/professional' + url, {
    credentials: 'same-origin',
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erreur de communication avec le serveur.');
  return data;
}

function showError(error) {
  notice.textContent = error.message;
}

async function loadAll() {
  try {
    const profile = await api('/profile');
    const c = profile.company;
    document.getElementById('profile').innerHTML =
      '<strong>' + escapeHtml(c.name) + '</strong><p>' +
      escapeHtml(c.country || '') + ' · ' + escapeHtml(c.sector || '') +
      '</p><p class="muted">' + escapeHtml(c.description || 'Aucune description.') + '</p>';

    const products = await api('/products');
    document.getElementById('products').innerHTML = products.products.length
      ? products.products.map(p => '<div class="item"><strong>' + escapeHtml(p.name) +
        '</strong><p>' + escapeHtml(p.category) + ' · ' + escapeHtml(p.status) +
        '</p><p class="muted">' + escapeHtml(p.description) + '</p></div>').join('')
      : '<p class="muted">Aucun produit enregistré.</p>';

    const partnerships = await api('/partnerships');
    document.getElementById('partnerships').innerHTML = partnerships.partnerships.length
      ? partnerships.partnerships.map(p => {
        const incoming = Number(p.receiver_company_id) === Number(c.id);
        return '<div class="item"><strong>' + escapeHtml(incoming ? p.sender_name : p.receiver_name) +
          '</strong><p>' + escapeHtml(p.message) + '</p><p class="muted">Statut : ' +
          escapeHtml(p.status) + '</p>' +
          (incoming && p.status === 'pending'
            ? '<button data-respond="' + p.id + '" data-status="accepted">Accepter</button> ' +
              '<button data-respond="' + p.id + '" data-status="rejected">Refuser</button>' : '') +
          '</div>';
      }).join('')
      : '<p class="muted">Aucune demande de partenariat.</p>';

    const quotes = await api('/quotes');
    document.getElementById('quotes').innerHTML = quotes.quotes.length
      ? quotes.quotes.map(q => '<div class="item"><strong>' +
        escapeHtml(q.product_name || 'Demande générale') + '</strong><p>' +
        escapeHtml(q.message) + '</p><p class="muted">' +
        escapeHtml(q.buyer_name) + ' → ' + escapeHtml(q.seller_name) +
        ' · ' + escapeHtml(q.status) + '</p></div>').join('')
      : '<p class="muted">Aucune demande de devis.</p>';
  } catch (error) {
    showError(error);
    document.getElementById('profile').textContent =
      'Connectez-vous avec un compte entreprise vérifié et approuvé pour accéder à cet espace.';
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

document.getElementById('product-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = Object.fromEntries(form.entries());
  if (data.price === '') data.price = null;
  else data.price = Number(data.price);
  try {
    await api('/products', { method: 'POST', body: JSON.stringify(data) });
    notice.textContent = 'Produit ajouté au catalogue.';
    event.currentTarget.reset();
    await loadAll();
  } catch (error) { showError(error); }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-respond]');
  if (!button) return;
  try {
    await api('/partnerships/' + encodeURIComponent(button.dataset.respond) + '/respond', {
      method: 'PATCH',
      body: JSON.stringify({ status: button.dataset.status })
    });
    notice.textContent = 'Réponse enregistrée.';
    await loadAll();
  } catch (error) { showError(error); }
});

loadAll();
`;

console.log('[4/7] Écriture des nouveaux fichiers...');
fs.writeFileSync(routePath, routeCode, { flag: 'wx' });
fs.writeFileSync(htmlPath, html, { flag: 'wx' });
fs.writeFileSync(cssPath, css, { flag: 'wx' });
fs.writeFileSync(jsPath, frontend, { flag: 'wx' });

console.log('[5/7] Intégration au serveur...');
const updatedApp = app.replace(
  mount,
  match => match + "\napp.use('/api/professional', require('./routes/professional'));\napp.use('/professional', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'public', 'professional.html')));"
);
fs.writeFileSync(appPath, updatedApp);

console.log('[6/7] Vérification des syntaxes...');
for (const file of [appPath, routePath, jsPath]) {
  require('child_process').execFileSync(process.execPath, ['--check', file]);
}

console.log('[7/7] Vérification des tables...');
const checkDb = new DatabaseSync(path.join(root, 'server/odm.sqlite'));
const tables = checkDb.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','quote_requests') ORDER BY name"
).all().map(row => row.name);
checkDb.close();

if (tables.length !== 2) stop('Les deux tables professionnelles ne sont pas présentes.');

console.log('\n======================================');
console.log('INSTALLATION PROFESSIONNELLE TERMINÉE');
console.log('======================================');
console.log('Espace : /professional');
console.log('API : /api/professional');
console.log('Modules : profil, produits, catalogue, partenariats, devis.');
console.log('Tables : ' + tables.join(', '));
console.log('Sauvegarde : ' + backupDir);
console.log('Les autres divisions restent à connecter à leurs services réels.');
console.log('======================================');
