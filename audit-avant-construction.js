'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = process.cwd();
const results = [];
let errors = 0;
let warnings = 0;

function report(level, label, detail = '') {
  if (level === 'ERREUR') errors++;
  if (level === 'ATTENTION') warnings++;
  results.push({ level, label, detail });
  console.log(`[${level}] ${label}${detail ? ' — ' + detail : ''}`);
}

function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}

function read(file) {
  try {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return '';
  }
}

function checkFile(file, required = true) {
  if (exists(file)) {
    report('OK', 'Fichier présent', file);
    return true;
  }
  report(required ? 'ERREUR' : 'ATTENTION',
    'Fichier absent', file);
  return false;
}

function run(command, args) {
  return cp.spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20000
  });
}

console.log('\n======================================');
console.log(' ODM TECH CONNECT - AUDIT COMPLET');
console.log(' Audit en lecture seule');
console.log('======================================\n');

console.log('===== 1. ENVIRONNEMENT =====');

report('INFO', 'Répertoire', ROOT);
report('INFO', 'Version Node', process.version);
report('INFO', 'Version npm',
  run('npm', ['--version']).stdout.trim() || 'Non disponible');

if (process.version.match(/^v(1[0-9]|2[01])\./)) {
  report('ATTENTION', 'Version Node',
    'Vérifier la compatibilité de node:sqlite.');
}

console.log('\n===== 2. FICHIERS PRINCIPAUX =====');

[
  'index.html',
  'en/index.html',
  'package.json',
  'package-lock.json',
  '.env',
  '.env.example',
  '.gitignore',
  'server/app.js',
  'server/db.js',
  'server/database.js',
  'server/security.js',
  'server/session-store.js',
  'server/migrate.js',
  'server/routes/auth.js',
  'server/routes/companies.js',
  'server/routes/contact.js',
  'server/routes/partnerships.js',
  'server/routes/admin.js',
  'public/admin.html',
  'public/admin.js',
  'public/admin.css'
].forEach(file => {
  checkFile(file, !['.env.example', 'server/migrate.js',
    'public/admin.css'].includes(file));
});

console.log('\n===== 3. CONFIGURATION =====');

try {
  const pkg = JSON.parse(read('package.json'));
  report('OK', 'package.json valide');
  report('INFO', 'Dépendances déclarées',
    Object.keys(pkg.dependencies || {}).join(', ') || 'Aucune');

  for (const dep of [
    'express',
    'express-session',
    'express-rate-limit',
    'helmet',
    'dotenv',
    'nodemailer'
  ]) {
    try {
      require.resolve(dep);
      report('OK', 'Dépendance installée', dep);
    } catch {
      report('ERREUR', 'Dépendance manquante', dep);
    }
  }
} catch (e) {
  report('ERREUR', 'package.json illisible', e.message);
}

console.log('\n===== 4. SYNTAXE JAVASCRIPT =====');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  let files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'backups'].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) files = files.concat(walk(full));
    else if (item.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const jsFiles = walk(ROOT);
for (const file of jsFiles) {
  const result = run(process.execPath, ['--check', file]);
  if (result.status === 0) {
    report('OK', 'Syntaxe JavaScript', path.relative(ROOT, file));
  } else {
    report('ERREUR', 'Syntaxe JavaScript',
      path.relative(ROOT, file) + ': ' +
      (result.stderr || result.stdout).trim().slice(0, 250));
  }
}

console.log('\n===== 5. ROUTES ET ARCHITECTURE =====');

const app = read('server/app.js');
const routeFiles = [
  'server/routes/auth.js',
  'server/routes/companies.js',
  'server/routes/contact.js',
  'server/routes/partnerships.js',
  'server/routes/admin.js'
];

for (const route of routeFiles) {
  const content = read(route);
  if (!content) continue;
  report('INFO', 'Routes détectées', route + ': ' +
    [...content.matchAll(/router\.(get|post|put|patch|delete)\s*\(/g)]
      .map(m => m[1].toUpperCase()).join(', '));
  if (!content.includes('module.exports')) {
    report('ATTENTION', 'Export route à vérifier', route);
  }
}

for (const name of [
  'authRoutes',
  'contactRoutes',
  'adminRoutes',
  'partnershipRoutes',
  'companiesRoutes'
]) {
  if (app.includes(name)) report('OK', 'Route montée', name);
  else report('ATTENTION', 'Route non détectée', name);
}

for (const feature of [
  ['/register', 'Inscription'],
  ['/login', 'Connexion'],
  ['/me', 'Profil de session'],
  ['/logout', 'Déconnexion']
]) {
  report(
    read('server/routes/auth.js').includes(feature[0]) ? 'OK' : 'ATTENTION',
    'Fonction authentification',
    feature[1]
  );
}

console.log('\n===== 6. BASE DE DONNEES =====');

try {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(ROOT, 'server/odm.sqlite');

  if (!fs.existsSync(dbPath)) {
    report('ERREUR', 'Base SQLite absente', 'server/odm.sqlite');
  } else {
    const db = new DatabaseSync(dbPath, { readOnly: true });

    const integrity = db.prepare('PRAGMA integrity_check').all();
    const integrityText = integrity.map(x => Object.values(x).join(' ')).join('; ');
    report(integrityText === 'ok' ? 'OK' : 'ERREUR',
      'Intégrité SQLite', integrityText);

    const fk = db.prepare('PRAGMA foreign_key_check').all();
    report(fk.length === 0 ? 'OK' : 'ERREUR',
      'Clés étrangères', `${fk.length} anomalie(s)`);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(x => x.name);

    report('INFO', 'Tables présentes', tables.join(', '));

    const expected = [
      'users',
      'companies',
      'email_verifications',
      'partnership_requests',
      'contact_requests',
      'sessions'
    ];

    for (const table of expected) {
      if (!tables.includes(table)) {
        report('ATTENTION', 'Table attendue absente', table);
        continue;
      }

      const columns = db.prepare(
        `PRAGMA table_info("${table}")`
      ).all().map(x => x.name);

      report('OK', 'Structure table ' + table, columns.join(', '));

      try {
        const count = db.prepare(
          `SELECT COUNT(*) AS total FROM "${table}"`
        ).get().total;
        report('INFO', 'Nombre de lignes ' + table, String(count));
      } catch {
        report('ATTENTION', 'Comptage impossible', table);
      }
    }

    const migrations = tables.includes('schema_migrations')
      ? db.prepare('SELECT migration, applied_at FROM schema_migrations ORDER BY id').all()
      : [];

    report('INFO', 'Migrations enregistrées',
      migrations.length ? migrations.map(x => x.migration).join(', ') :
      'Aucune table de migrations ou aucune migration');

    db.close();
  }
} catch (e) {
  report('ERREUR', 'Audit SQLite impossible', e.message);
}

console.log('\n===== 7. SAUVEGARDES =====');

for (const folder of ['backups', 'backups/base-donnees',
  'backups/avant-systeme-utilisateurs']) {
  if (exists(folder)) {
    const items = fs.readdirSync(path.join(ROOT, folder));
    report(items.length ? 'OK' : 'ATTENTION',
      'Dossier de sauvegarde', folder + ' (' + items.length + ' élément(s))');
  } else {
    report('ATTENTION', 'Dossier de sauvegarde absent', folder);
  }
}

console.log('\n===== 8. SECURITE - INDICES STATIQUES =====');

const auth = read('server/routes/auth.js');
const security = read('server/security.js');
const sessionStore = read('server/session-store.js');

const securityChecks = [
  [security.includes('scrypt'), 'Hachage des mots de passe (scrypt)'],
  [security.includes('timingSafeEqual'), 'Comparaison sécurisée des mots de passe'],
  [auth.includes('rateLimit'), 'Limitation des tentatives de connexion'],
  [auth.includes('regenerate'), 'Renouvellement de session à la connexion'],
  [app.includes('httpOnly'), 'Cookie HttpOnly'],
  [app.includes('sameSite'), 'Politique SameSite'],
  [app.includes('helmet'), 'Protection HTTP Helmet'],
  [sessionStore.length > 0, 'Stockage de sessions personnalisé']
];

for (const [ok, label] of securityChecks) {
  report(ok ? 'OK' : 'ATTENTION', label);
}

report(
  auth.includes('nodemailer') || auth.includes('sendMail')
    ? 'OK' : 'ATTENTION',
  'Envoi réel des e-mails',
  'À vérifier/configurer si absent'
);

report(
  app.includes('csrf') || app.includes('csurf')
    ? 'OK' : 'ATTENTION',
  'Protection CSRF',
  'Présence non détectée automatiquement'
);

console.log('\n===== 9. FONCTIONS PROFESSIONNELLES =====');

const allRoutes = routeFiles.map(read).join('\n');
const features = [
  ['Profil entreprise modifiable', /UPDATE\s+companies/i],
  ['Liste des partenariats utilisateur', /SELECT[\s\S]{0,300}partnership_requests/i],
  ['Réponse utilisateur aux partenariats', /UPDATE\s+partnership_requests/i],
  ['Catalogue de produits', /CREATE TABLE[\s\S]{0,200}products/i],
  ['Demandes de devis', /quote_requests/i],
  ['Commandes', /CREATE TABLE[\s\S]{0,200}orders/i],
  ['Espace représentant', /representatives/i],
  ['Espace professionnel HTML', /dashboard|espace professionnel/i.test(read('public/admin.html') + read('public/admin.js'))]
];

for (const [label, pattern] of features) {
  const found = typeof pattern === 'object' && pattern.test
    ? pattern.test(allRoutes + read('server/database.js') +
      read('public/admin.html') + read('public/admin.js'))
    : false;
  report(found ? 'OK' : 'À CRÉER / VÉRIFIER', label);
}

console.log('\n===== 10. GIT =====');

const git = run('git', ['status', '--short']);
if (git.error) {
  report('ATTENTION', 'Git non disponible');
} else {
  report('INFO', 'État Git',
    git.stdout.trim() || 'Aucune modification détectée');
}

console.log('\n======================================');
console.log(' RÉSUMÉ DE L’AUDIT');
console.log('======================================');
console.log('Erreurs : ' + errors);
console.log('Avertissements : ' + warnings);
console.log('Contrôles affichés : ' + results.length);
console.log('Fichiers JavaScript examinés : ' + jsFiles.length);
console.log('\nCet audit ne modifie pas volontairement les fichiers.');
console.log('Les contrôles statiques ne remplacent pas les tests réels.');
console.log('======================================\n');

fs.writeFileSync(
  path.join(ROOT, 'rapport-audit-avant-construction.json'),
  JSON.stringify({
    date: new Date().toISOString(),
    node: process.version,
    errors,
    warnings,
    results
  }, null, 2)
);

console.log('Rapport créé : rapport-audit-avant-construction.json');
