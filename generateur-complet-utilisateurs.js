'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, 'server/odm.sqlite');
const APP_PATH = path.join(ROOT, 'server/app.js');
const ROUTE_PATH = path.join(ROOT, 'server/routes/professional.js');
const HTML_PATH = path.join(ROOT, 'public/professional.html');
const JS_PATH = path.join(ROOT, 'public/professional.js');
const CSS_PATH = path.join(ROOT, 'public/professional.css');

function stop(message) {
  console.error('\nARRÊT DE SÉCURITÉ : ' + message);
  process.exit(1);
}

function backupFile(file, folder) {
  if (!fs.existsSync(file)) return;
  const destination = path.join(folder, path.basename(file));
  fs.copyFileSync(file, destination);
  console.log('Sauvegarde : ' + destination);
}

console.log('\n==========================================');
console.log(' ODM TECH CONNECT - GENERATEUR');
console.log(' Extension de l’espace professionnel');
console.log('==========================================\n');

for (const file of [
  'server/app.js',
  'server/db.js',
  'server/routes/auth.js',
  'server/routes/partnerships.js',
  'server/routes/companies.js',
  'server/odm.sqlite',
  'public'
]) {
  if (!fs.existsSync(path.join(ROOT, file))) {
    stop('Élément indispensable absent : ' + file);
  }
}

if (fs.existsSync(ROUTE_PATH) ||
    fs.existsSync(HTML_PATH) ||
    fs.existsSync(JS_PATH) ||
    fs.existsSync(CSS_PATH)) {
  stop('Un ou plusieurs fichiers de destination existent déjà. Aucun fichier ne sera écrasé.');
}

let app = fs.readFileSync(APP_PATH, 'utf8');

if (!app.includes("app.use('/api/companies', companiesRoutes);")) {
  stop('Le point de montage des routes entreprises est introuvable.');
}

if (app.includes("require('./routes/professional')")) {
  stop('La route professionnelle semble déjà montée.');
}

const backupDir = path.join(
  ROOT,
  'backups',
  'avant-generateur-' + new Date().toISOString().replace(/[:.]/g, '-')
);
fs.mkdirSync(backupDir, { recursive: true });

backupFile(APP_PATH, backupDir);

const dbBackup = path.join(backupDir, 'odm.sqlite');
const escapedBackup = dbBackup.replace(/'/g, "''");

let db;
try {
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 10000;');
  db.exec(`VACUUM INTO '${escapedBackup}'`);
  console.log('Sauvegarde SQLite créée.');
} catch (error) {
  if (db) db.close();
  stop('Impossible de sauvegarder la base : ' + error.message);
}

try {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(row => row.name);

  for (const table of [
    'users',
    'companies',
    'partnership_requests'
  ]) {
    if (!tables.includes(table)) {
      stop('Table existante indispensable absente : ' + table);
    }
  }

  const columns = db.prepare(
    'PRAGMA table_info(companies)'
  ).all().map(row => row.name);

  for (const column of ['id', 'user_id', 'name', 'country', 'sector', 'approval_status']) {
    if (!columns.includes(column)) {
      stop('Colonne companies absente : ' + column);
    }
  }

  db.exec('BEGIN IMMEDIATE');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      price REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','published','archived')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_company
      ON products(company_id);

    CREATE INDEX IF NOT EXISTS idx_products_status
      ON products(status);

    CREATE TABLE IF NOT EXISTS quote_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_company_id INTEGER NOT NULL,
      supplier_company_id INTEGER NOT NULL,
      product_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 1,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','answered','accepted','rejected','closed')),
      response TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(buyer_company_id) REFERENCES companies(id),
      FOREIGN KEY(supplier_company_id) REFERENCES companies(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_buyer
      ON quote_requests(buyer_company_id);

    CREATE INDEX IF NOT EXISTS idx_quotes_supplier
      ON quote_requests(supplier_company_id);
  `);

  db.exec('COMMIT');
  console.log('Tables produits et demandes de devis créées ou déjà présentes.');
} catch (error) {
  try { db.exec('ROLLBACK'); } catch {}
  db.close();
  stop('Échec de création des tables : ' + error.message);
}

db.close();

const routeCode = String.raw`
'use strict';

const express = require('express');
const db = require('../db');
const router = express.Router();

function requireCompany(req, res, next) {
  const user = req.session && req.session.user;

  if (!user) {
    return res.status(401).json({ error: 'Connexion requise.' });
  }

  if (user.role !== 'company' || !Number.isInteger(Number(user.companyId))) {
    return res.status(403).json({ error: 'Accès réservé aux comptes entreprise.' });
  }

  const company = db.prepare(
    "SELECT id, approval_status FROM companies WHERE id = ? AND user_id = ?"
  ).get(Number(user.companyId), Number(user.id));

  if (!company || company.approval_status !== 'approved') {
    return res.status(403).json({ error: 'Votre entreprise doit être approuvée.' });
  }

  req.company = company;
  next();
}

router.use(requireCompany);

// Profil professionnel
router.get('/profile', (req, res) => {
  const profile = db.prepare(`
    SELECT id, name, country, sector, description, website, approval_status, created_at
    FROM companies
    WHERE id = ?
  `).get(req.company.id);

  res.json({ success: true, profile });
});

router.patch('/profile', (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const country = typeof body.country === 'string' ? body.country.trim() : '';
  const sector = typeof body.sector === 'string' ? body.sector.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const website = typeof body.website === 'string' ? body.website.trim() : '';

  if (name.length < 2 || name.length > 120 ||
      country.length < 2 || country.length > 100 ||
      sector.length < 2 || sector.length > 100 ||
      description.length > 3000 ||
      website.length > 255) {
    return res.status(400).json({ error: 'Informations invalides.' });
  }

  if (website && !/^https?:\/\/[^\s]+$/i.test(website)) {
    return res.status(400).json({ error: 'Adresse du site web invalide.' });
  }

  db.prepare(`
    UPDATE companies
    SET name = ?, country = ?, sector = ?, description = ?, website = ?
    WHERE id = ?
  `).run(name, country, sector, description, website || null, req.company.id);

  res.json({ success: true, message: 'Profil mis à jour.' });
});

// Demandes de partenariat reçues et envoyées
router.get('/partnerships', (req, res) => {
  const sent = db.prepare(`
    SELECT p.id, p.message, p.status, p.created_at,
           c.name AS company_name, c.country, 'sent' AS direction
    FROM partnership_requests p
    JOIN companies c ON c.id = p.receiver_company_id
    WHERE p.sender_company_id = ?
    ORDER BY p.created_at DESC
  `).all(req.company.id);

  const received = db.prepare(`
    SELECT p.id, p.message, p.status, p.created_at,
           c.name AS company_name, c.country, 'received' AS direction
    FROM partnership_requests p
    JOIN companies c ON c.id = p.sender_company_id
    WHERE p.receiver_company_id = ?
    ORDER BY p.created_at DESC
  `).all(req.company.id);

  res.json({ success: true, sent, received });
});

router.patch('/partnerships/:id/respond', (req, res) => {
  const id = Number(req.params.id);
  const status = req.body && req.body.status;

  if (!Number.isInteger(id) || id <= 0 ||
      !['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Réponse invalide.' });
  }

  const result = db.prepare(`
    UPDATE partnership_requests
    SET status = ?
    WHERE id = ? AND receiver_company_id = ? AND status = 'pending'
  `).run(status, id, req.company.id);

  if (!result.changes) {
    return res.status(404).json({
      error: 'Demande introuvable, déjà traitée ou non destinée à votre entreprise.'
    });
  }

  res.json({ success: true, message: 'Réponse enregistrée.' });
});

// Gestion des produits
router.get('/products', (req, res) => {
  const products = db.prepare(`
    SELECT id, name, description, category, price, currency,
           stock_quantity, status, created_at, updated_at
    FROM products
    WHERE company_id = ?
    ORDER BY created_at DESC
  `).all(req.company.id);

  res.json({ success: true, products });
});

router.post('/products', (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const description = typeof b.description === 'string' ? b.description.trim() : '';
  const category = typeof b.category === 'string' ? b.category.trim() : '';
  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : 'USD';
  const price = b.price === null || b.price === '' ? null : Number(b.price);
  const stock = Number(b.stock_quantity || 0);
  const status = b.status === 'published' ? 'published' : 'draft';

  if (name.length < 2 || name.length > 150 ||
      description.length > 3000 || category.length > 100 ||
      !/^[A-Z]{3}$/.test(currency) ||
      (price !== null && (!Number.isFinite(price) || price < 0)) ||
      !Number.isInteger(stock) || stock < 0 || stock > 100000000) {
    return res.status(400).json({ error: 'Informations produit invalides.' });
  }

  const result = db.prepare(`
    INSERT INTO products
      (company_id, name, description, category, price, currency,
       stock_quantity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.company.id, name, description, category, price,
         currency, stock, status);

  res.status(201).json({
    success: true,
    productId: Number(result.lastInsertRowid)
  });
});

router.patch('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Identifiant invalide.' });
  }

  const existing = db.prepare(
    'SELECT * FROM products WHERE id = ? AND company_id = ?'
  ).get(id, req.company.id);

  if (!existing) {
    return res.status(404).json({ error: 'Produit introuvable.' });
  }

  const name = typeof b.name === 'string' ? b.name.trim() : existing.name;
  const description = typeof b.description === 'string' ? b.description.trim() : existing.description;
  const category = typeof b.category === 'string' ? b.category.trim() : existing.category;
  const price = b.price === undefined ? existing.price :
    (b.price === null || b.price === '' ? null : Number(b.price));
  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : existing.currency;
  const stock = b.stock_quantity === undefined ? existing.stock_quantity : Number(b.stock_quantity);
  const status = ['draft', 'published', 'archived'].includes(b.status) ? b.status : existing.status;

  if (name.length < 2 || name.length > 150 ||
      description.length > 3000 || category.length > 100 ||
      !/^[A-Z]{3}$/.test(currency) ||
      (price !== null && (!Number.isFinite(price) || price < 0)) ||
      !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Informations produit invalides.' });
  }

  db.prepare(`
    UPDATE products SET name=?, description=?, category=?, price=?,
      currency=?, stock_quantity=?, status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=?
  `).run(name, description, category, price, currency, stock, status,
         id, req.company.id);

  res.json({ success: true, message: 'Produit mis à jour.' });
});

router.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Identifiant invalide.' });
  }

  const result = db.prepare(
    "UPDATE products SET status='archived', updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?"
  ).run(id, req.company.id);

  if (!result.changes) {
    return res.status(404).json({ error: 'Produit introuvable.' });
  }

  res.json({ success: true, message: 'Produit archivé.' });
});

// Catalogue public des entreprises approuvées
router.get('/catalogue', (req, res) => {
  const search = typeof req.query.search === 'string'
    ? req.query.search.trim().slice(0, 100) : '';

  const products = db.prepare(`
    SELECT p.id, p.name, p.description, p.category, p.price,
           p.currency, p.stock_quantity, c.id AS company_id,
           c.name AS company_name, c.country
    FROM products p
    JOIN companies c ON c.id = p.company_id
    JOIN users u ON u.id = c.user_id
    WHERE p.status='published'
      AND c.approval_status='approved'
      AND u.email_verified=1
      AND (? = '' OR p.name LIKE ? OR p.category LIKE ? OR c.name LIKE ?)
    ORDER BY p.created_at DESC
    LIMIT 100
  `).all(search, `%${search}%`, `%${search}%`, `%${search}%`);

  res.json({ success: true, products });
});

// Demandes de devis
router.get('/quotes', (req, res) => {
  const quotes = db.prepare(`
    SELECT q.*, buyer.name AS buyer_name, supplier.name AS supplier_name,
           CASE WHEN q.buyer_company_id = ? THEN 'sent' ELSE 'received' END AS direction
    FROM quote_requests q
    JOIN companies buyer ON buyer.id = q.buyer_company_id
    JOIN companies supplier ON supplier.id = q.supplier_company_id
    WHERE q.buyer_company_id = ? OR q.supplier_company_id = ?
    ORDER BY q.created_at DESC
  `).all(req.company.id, req.company.id, req.company.id);

  res.json({ success: true, quotes });
});

router.post('/quotes', (req, res) => {
  const b = req.body || {};
  const supplierId = Number(b.supplier_company_id);
  const productId = b.product_id ? Number(b.product_id) : null;
  const quantity = Number(b.quantity);
  const message = typeof b.message === 'string' ? b.message.trim() : '';

  if (!Number.isInteger(supplierId) || supplierId <= 0 ||
      supplierId === req.company.id ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 100000000 ||
      message.length < 10 || message.length > 3000) {
    return res.status(400).json({ error: 'Demande de devis invalide.' });
  }

  const supplier = db.prepare(`
    SELECT id FROM companies
    WHERE id=? AND approval_status='approved'
  `).get(supplierId);

  if (!supplier) {
    return res.status(404).json({ error: 'Fournisseur introuvable.' });
  }

  if (productId !== null) {
    const product = db.prepare(`
      SELECT id FROM products
      WHERE id=? AND company_id=? AND status='published'
    `).get(productId, supplierId);

    if (!product) {
      return res.status(400).json({ error: 'Produit indisponible.' });
    }
  }

  const result = db.prepare(`
    INSERT INTO quote_requests
      (buyer_company_id, supplier_company_id, product_id, quantity, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.company.id, supplierId, productId, quantity, message);

  res.status(201).json({
    success: true,
    quoteId: Number(result.lastInsertRowid)
  });
});

router.patch('/quotes/:id/respond', (req, res) => {
  const id = Number(req.params.id);
  const status = req.body && req.body.status;
  const response = typeof (req.body && req.body.response) === 'string'
    ? req.body.response.trim() : '';

  if (!Number.isInteger(id) || id <= 0 ||
      !['answered', 'accepted', 'rejected'].includes(status) ||
      response.length > 3000) {
    return res.status(400).json({ error: 'Réponse invalide.' });
  }

  const result = db.prepare(`
    UPDATE quote_requests
    SET status=?, response=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND supplier_company_id=?
      AND status='pending'
  `).run(status, response, id, req.company.id);

  if (!result.changes) {
    return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
  }

  res.json({ success: true, message: 'Réponse enregistrée.' });
});

module.exports = router;
`;

const htmlCode = String.raw`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Espace professionnel | ODM TECH CONNECT</title>
<link rel="stylesheet" href="/professional.css">
</head>
<body>
<header class="top">
  <a href="/" class="brand">ODM <span>TECH CONNECT</span></a>
  <nav><a href="/">Accueil</a><button id="logout" hidden>Déconnexion</button></nav>
</header>
<main>
  <section class="intro">
    <p class="eyebrow">ODM BUSINESS NETWORK</p>
    <h1>Espace professionnel</h1>
    <p>Gérez votre profil, vos produits et vos relations commerciales.</p>
  </section>

  <section id="loginPanel" class="panel">
    <h2>Connexion professionnelle</h2>
    <form id="loginForm">
      <label>E-mail<input name="email" type="email" required autocomplete="username"></label>
      <label>Mot de passe<input name="password" type="password" required autocomplete="current-password"></label>
      <button>Se connecter</button>
    </form>
    <p id="loginMessage" class="message"></p>
    <p class="hint">L'inscription d'une entreprise et sa validation restent soumises aux règles d'approbation d'ODM TECH CONNECT.</p>
  </section>

  <section id="workspace" hidden>
    <div class="welcome panel">
      <div><p class="eyebrow">TABLEAU DE BORD</p><h2 id="companyTitle">Mon entreprise</h2></div>
      <span id="accountStatus" class="status">Compte professionnel</span>
    </div>

    <div class="grid">
      <section class="panel">
        <h2>Mon profil</h2>
        <form id="profileForm">
          <label>Nom de l'entreprise<input name="name" required maxlength="120"></label>
          <label>Pays<input name="country" required maxlength="100"></label>
          <label>Secteur<input name="sector" required maxlength="100"></label>
          <label>Site web<input name="website" type="url" placeholder="https://..."></label>
          <label>Description<textarea name="description" rows="4" maxlength="3000"></textarea></label>
          <button>Enregistrer le profil</button>
        </form>
      </section>

      <section class="panel">
        <h2>Ajouter un produit</h2>
        <form id="productForm">
          <label>Nom du produit<input name="name" required maxlength="150"></label>
          <label>Catégorie<input name="category" maxlength="100"></label>
          <label>Description<textarea name="description" rows="3"></textarea></label>
          <div class="two">
            <label>Prix<input name="price" type="number" min="0" step="0.01"></label>
            <label>Devise<input name="currency" value="USD" maxlength="3"></label>
          </div>
          <label>Quantité en stock<input name="stock_quantity" type="number" min="0" value="0"></label>
          <label>Publication<select name="status"><option value="draft">Brouillon</option><option value="published">Publier</option></select></label>
          <button>Ajouter le produit</button>
        </form>
      </section>
    </div>

    <section class="panel">
      <h2>Mes produits</h2><div id="products" class="records">Chargement…</div>
    </section>

    <section class="panel">
      <h2>Partenariats</h2>
      <h3>Demandes reçues</h3><div id="received" class="records"></div>
      <h3>Demandes envoyées</h3><div id="sent" class="records"></div>
    </section>

    <section class="panel">
      <h2>Demandes de devis</h2>
      <div id="quotes" class="records"></div>
    </section>
    <p id="appMessage" class="message" role="status"></p>
  </section>
</main>
<footer>ODM TECH CONNECT · Connecter. Représenter. Développer.</footer>
<script src="/professional.js" defer></script>
</body>
</html>`;

const jsCode = String.raw`'use strict';

const $ = (id) => document.getElementById(id);
const loginPanel = $('loginPanel');
const workspace = $('workspace');
const appMessage = $('appMessage');

async function api(url, options = {}) {
  const response = await fetch('/api/professional' + url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? {'Content-Type': 'application/json'} : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showMessage(message, error = false) {
  appMessage.textContent = message;
  appMessage.className = error ? 'message error' : 'message success';
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text || '';
  if (className) element.className = className;
  return element;
}

async function loadProfile() {
  const data = await api('/profile');
  const p = data.profile;
  $('companyTitle').textContent = p.name;
  $('accountStatus').textContent = p.approval_status;
  const form = $('profileForm');
  for (const key of ['name','country','sector','website','description']) {
    form.elements[key].value = p[key] || '';
  }
}

async function loadProducts() {
  const data = await api('/products');
  const target = $('products');
  target.replaceChildren();

  if (!data.products.length) {
    target.append(node('p', 'Aucun produit enregistré.'));
    return;
  }

  for (const p of data.products) {
    const card = node('article', '', 'record');
    card.append(node('strong', p.name));
    card.append(node('p', (p.category || 'Sans catégorie') + ' · ' +
      (p.price === null ? 'Prix sur demande' : p.price + ' ' + p.currency)));
    card.append(node('p', 'Stock : ' + p.stock_quantity + ' · Statut : ' + p.status));
    if (p.status !== 'archived') {
      const button = node('button', 'Archiver');
      button.type = 'button';
      button.addEventListener('click', async () => {
        try {
          await api('/products/' + p.id, {method:'DELETE'});
          await loadProducts();
          showMessage('Produit archivé.');
        } catch (e) { showMessage(e.message, true); }
      });
      card.append(button);
    }
    target.append(card);
  }
}

async function loadPartnerships() {
  const data = await api('/partnerships');

  for (const [key, list] of [['received', data.received], ['sent', data.sent]]) {
    const target = $(key);
    target.replaceChildren();

    if (!list.length) {
      target.append(node('p', 'Aucune demande.'));
      continue;
    }

    for (const item of list) {
      const card = node('article', '', 'record');
      card.append(node('strong', item.company_name));
      card.append(node('p', item.message));
      card.append(node('p', 'Statut : ' + item.status));

      if (key === 'received' && item.status === 'pending') {
        for (const status of ['accepted','rejected']) {
          const button = node('button', status === 'accepted' ? 'Accepter' : 'Refuser');
          button.type = 'button';
          button.addEventListener('click', async () => {
            try {
              await api('/partnerships/' + item.id + '/respond', {
                method:'PATCH',
                body:JSON.stringify({status})
              });
              await loadPartnerships();
              showMessage('Réponse enregistrée.');
            } catch (e) { showMessage(e.message, true); }
          });
          card.append(button);
        }
      }
      target.append(card);
    }
  }
}

async function loadQuotes() {
  const data = await api('/quotes');
  const target = $('quotes');
  target.replaceChildren();

  if (!data.quotes.length) {
    target.append(node('p', 'Aucune demande de devis.'));
    return;
  }

  for (const q of data.quotes) {
    const card = node('article', '', 'record');
    card.append(node('strong', q.direction === 'sent'
      ? 'Destinataire : ' + q.supplier_name
      : 'Demandeur : ' + q.buyer_name));
    card.append(node('p', q.message));
    card.append(node('p', 'Quantité : ' + q.quantity + ' · Statut : ' + q.status));

    if (q.direction === 'received' && q.status === 'pending') {
      const input = document.createElement('textarea');
      input.placeholder = 'Votre réponse commerciale';
      input.maxLength = 3000;
      card.append(input);

      for (const status of ['answered','accepted','rejected']) {
        const button = node('button',
          status === 'answered' ? 'Répondre' :
          status === 'accepted' ? 'Accepter' : 'Refuser');
        button.type = 'button';
        button.addEventListener('click', async () => {
          try {
            await api('/quotes/' + q.id + '/respond', {
              method:'PATCH',
              body:JSON.stringify({status,response:input.value})
            });
            await loadQuotes();
            showMessage('Réponse enregistrée.');
          } catch (e) { showMessage(e.message, true); }
        });
        card.append(button);
      }
    }
    target.append(card);
  }
}

async function loadWorkspace() {
  loginPanel.hidden = true;
  workspace.hidden = false;
  $('logout').hidden = false;
  try {
    await Promise.all([
      loadProfile(), loadProducts(), loadPartnerships(), loadQuotes()
    ]);
  } catch (e) {
    showMessage(e.message, true);
  }
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  try {
    const response = await fetch('/api/auth/login', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Connexion impossible.');
    await loadWorkspace();
  } catch (e) {
    $('loginMessage').textContent = e.message;
  }
});

$('logout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', {
      method:'POST', credentials:'same-origin'
    });
  } finally {
    location.reload();
  }
});

$('profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/profile', {
      method:'PATCH',
      body:JSON.stringify(formData(event.currentTarget))
    });
    await loadProfile();
    showMessage('Profil professionnel enregistré.');
  } catch (e) { showMessage(e.message, true); }
});

$('productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  data.price = data.price === '' ? null : Number(data.price);
  data.stock_quantity = Number(data.stock_quantity);
  try {
    await api('/products', {
      method:'POST',
      body:JSON.stringify(data)
    });
    event.currentTarget.reset();
    await loadProducts();
    showMessage('Produit ajouté.');
  } catch (e) { showMessage(e.message, true); }
});

// Vérifie si une session existe déjà sans exposer les données privées.
(async () => {
  try {
    const response = await fetch('/api/auth/me', {credentials:'same-origin'});
    if (response.ok) {
      const data = await response.json();
      if (data.user && data.user.role === 'company') await loadWorkspace();
    }
  } catch {}
})();
`;

const cssCode = String.raw`*{box-sizing:border-box}
:root{font-family:Arial,sans-serif;color:#142c40;background:#f2f8fc}
body{margin:0}
.top{background:#fff;border-bottom:1px solid #dce8f0;padding:18px 5%;display:flex;justify-content:space-between;align-items:center}
.brand{font-weight:800;color:#102e48;text-decoration:none;letter-spacing:.4px}
.brand span{color:#40bde9}
nav a{color:#24435a;text-decoration:none;margin-right:18px}
main{max-width:1100px;margin:35px auto;padding:0 18px}
.intro{padding:28px 4px 18px}
h1{font-size:clamp(30px,5vw,46px);margin:8px 0;color:#102e48}
h2{color:#123650;margin-top:0}
h3{color:#267da4}
.eyebrow{font-size:12px;letter-spacing:2px;color:#219bc8;font-weight:bold}
.panel{background:#fff;border:1px solid #dce8f0;border-radius:15px;padding:24px;margin:18px 0;box-shadow:0 5px 20px #183b5210}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
label{display:block;font-size:14px;font-weight:600;margin:13px 0;color:#29465b}
input,textarea,select{display:block;width:100%;margin-top:7px;padding:12px;border:1px solid #c9d9e5;border-radius:8px;font:inherit;background:#fff;color:#19354a}
button{border:0;border-radius:8px;padding:11px 16px;margin:6px 6px 4px 0;background:#38bce8;color:#06283e;font-weight:bold;cursor:pointer}
button:hover{filter:brightness(.96)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.records{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.record{border:1px solid #dce8f0;border-radius:10px;padding:15px;overflow-wrap:anywhere}
.record p{line-height:1.5;color:#496174}
.status{background:#e4f7fd;color:#0879a6;padding:8px 12px;border-radius:30px;font-size:12px}
.welcome{display:flex;justify-content:space-between;align-items:center;gap:12px}
.message{padding:10px 0}
.error{color:#b42318}
.success{color:#087b50}
.hint{font-size:13px;color:#64798a;line-height:1.5}
footer{text-align:center;padding:30px;color:#688093;font-size:13px}
[hidden]{display:none!important}
@media(max-width:720px){.grid{grid-template-columns:1fr}.welcome{align-items:flex-start;flex-direction:column}.panel{padding:18px}.two{grid-template-columns:1fr}}
`;

try {
  fs.writeFileSync(ROUTE_PATH, routeCode, { flag: 'wx' });
  fs.writeFileSync(HTML_PATH, htmlCode, { flag: 'wx' });
  fs.writeFileSync(JS_PATH, jsCode, { flag: 'wx' });
  fs.writeFileSync(CSS_PATH, cssCode, { flag: 'wx' });

  app = app.replace(
    "const companiesRoutes = require('./routes/companies');",
    "const companiesRoutes = require('./routes/companies');\nconst professionalRoutes = require('./routes/professional');"
  );

  app = app.replace(
    "app.use('/api/companies', companiesRoutes);",
    "app.use('/api/companies', companiesRoutes);\napp.use('/api/professional', professionalRoutes);"
  );

  fs.writeFileSync(APP_PATH, app);
} catch (error) {
  console.error('\nErreur pendant la création :', error.message);
  console.error('Sauvegarde disponible dans :', backupDir);
  console.error('Ne supprime aucun fichier. Vérification manuelle nécessaire.');
  process.exit(1);
}

console.log('\n==========================================');
console.log(' GÉNÉRATION TERMINÉE');
console.log('==========================================');
console.log('Nouveaux fichiers :');
console.log('- server/routes/professional.js');
console.log('- public/professional.html');
console.log('- public/professional.js');
console.log('- public/professional.css');
console.log('- Tables products et quote_requests');
console.log('- Route API /api/professional');
console.log('\nSauvegarde : ' + backupDir);
console.log('\nLa génération ne prouve pas encore le fonctionnement.');
console.log('Le contrôle indépendant reste obligatoire.');
console.log('==========================================');
