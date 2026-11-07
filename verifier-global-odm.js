'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const root = process.cwd();
const checks = [];
const failures = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log((ok ? 'OK  ' : 'ECHEC') + ' | ' + name + (detail ? ' | ' + detail : ''));
  if (!ok) failures.push(name);
}

async function main() {
  console.log('\n===== VERIFICATION GLOBALE ODM TECH CONNECT =====\n');

  const files = [
    'server/app.js',
    'server/db.js',
    'server/routes/auth.js',
    'server/routes/partnerships.js',
    'server/routes/professional.js',
    'public/professional.html',
    'public/professional.js',
    'public/professional.css',
    'public/admin.html',
    'index.html',
    'en/index.html'
  ];

  for (const file of files) {
    check('Fichier ' + file, fs.existsSync(path.join(root, file)));
  }

  console.log('\n--- Syntaxe JavaScript ---');
  const jsFiles = [
    'server/app.js',
    'server/routes/professional.js',
    'server/routes/auth.js',
    'server/routes/partnerships.js',
    'public/professional.js'
  ];

  for (const file of jsFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      check('Syntaxe ' + file, true);
    } catch (error) {
      check('Syntaxe ' + file, false, String(error.stderr || error.message));
    }
  }

  console.log('\n--- Base de données ---');
  const db = new DatabaseSync(path.join(root, 'server/odm.sqlite'));
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    check('Intégrité SQLite', integrity.length === 1 && integrity[0].integrity_check === 'ok',
      JSON.stringify(integrity));

    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    check('Clés étrangères', foreignKeys.length === 0,
      foreignKeys.length + ' anomalie(s)');

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(row => row.name);

    for (const table of ['users', 'companies', 'partnership_requests',
                         'contact_requests', 'products', 'quote_requests']) {
      check('Table ' + table, tables.includes(table));
    }

    const admin = db.prepare(
      "SELECT COUNT(*) AS total FROM users WHERE role='admin'"
    ).get();
    check('Compte administrateur conservé', admin.total >= 1,
      admin.total + ' compte(s) administrateur(s)');

    const counts = {};
    for (const table of ['users', 'companies', 'products', 'quote_requests']) {
      counts[table] = db.prepare('SELECT COUNT(*) AS n FROM "' + table + '"').get().n;
    }
    console.log('Comptages :', JSON.stringify(counts));
  } finally {
    db.close();
  }

  console.log('\n--- Intégration des routes ---');
  const app = fs.readFileSync('server/app.js', 'utf8');
  check('Route professionnelle montée',
    app.includes("app.use('/api/professional', require('./routes/professional'))"));
  check('Page professionnelle montée',
    app.includes("app.use('/professional'"));
  check('Anciennes routes conservées',
    app.includes("'/api/partnerships'") && app.includes("'/api/companies'"));

  console.log('\n--- Test HTTP local ---');
  try {
    const base = 'http://127.0.0.1:' + (process.env.PORT || '3000');
    const health = await fetch(base + '/api/health');
    check('Serveur accessible', true, 'HTTP ' + health.status);

    const catalogue = await fetch(base + '/api/professional/catalogue');
    check('Catalogue public accessible', catalogue.status === 200,
      'HTTP ' + catalogue.status);

    const profile = await fetch(base + '/api/professional/profile');
    check('Profil protégé sans connexion',
      profile.status === 401 || profile.status === 403,
      'HTTP ' + profile.status);

    const page = await fetch(base + '/professional');
    check('Page professionnelle accessible', page.status === 200,
      'HTTP ' + page.status);
  } catch (error) {
    check('Tests HTTP', false,
      'Serveur inaccessible ou arrêté : ' + error.message);
    console.log('Les tests statiques et SQLite restent valables.');
  }

  console.log('\n===== BILAN =====');
  console.log('Contrôles : ' + checks.length);
  console.log('Réussis : ' + checks.filter(x => x.ok).length);
  console.log('Échecs : ' + failures.length);

  const report = {
    date: new Date().toISOString(),
    checks,
    failures
  };

  fs.writeFileSync(
    'rapport-verification-globale.json',
    JSON.stringify(report, null, 2)
  );

  console.log('Rapport : rapport-verification-globale.json');
  if (failures.length) process.exitCode = 1;
  else console.log('Tous les contrôles exécutés ont réussi.');
}

main().catch(error => {
  console.error('Erreur du vérificateur :', error);
  process.exitCode = 1;
});
