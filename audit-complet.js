const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const root = process.cwd();
const report = [];

function section(title, content) {
  report.push('\n\n========== ' + title + ' ==========\n');
  report.push(String(content || 'Aucun résultat'));
}

function readFile(file) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    return 'Fichier absent ou illisible.';
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

section('DATE ET ENVIRONNEMENT', new Date().toISOString());
try {
  section('VERSIONS', [
    'Node : ' + process.version,
    'NPM : ' + execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()
  ].join('\n'));
} catch (e) {
  section('VERSIONS', e.message);
}

section('FICHIERS DU PROJET',
  walk(root)
    .map(f => path.relative(root, f))
    .filter(f => !f.startsWith('backups/') && f !== 'audit-complet.js')
    .join('\n')
);

section('ÉTAT GIT');
try {
  section('GIT', execFileSync('git', ['status', '--short'], {
    cwd: root, encoding: 'utf8'
  }));
} catch (e) {
  section('GIT', 'Git indisponible ou dépôt non initialisé.');
}

const sourceFiles = [
  'package.json',
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
  'public/admin.js'
];

for (const file of sourceFiles) {
  if (fs.existsSync(path.join(root, file))) {
    section('CODE : ' + file, readFile(file));
  }
}

const migrations = walk(path.join(root, 'server/migrations'))
  .filter(f => f.endsWith('.js'));

for (const file of migrations) {
  section('MIGRATION : ' + path.relative(root, file), readFile(path.relative(root, file)));
}

section('CONTRÔLE DE SYNTAXE JAVASCRIPT');
const jsFiles = [
  ...walk(path.join(root, 'server')),
  ...walk(path.join(root, 'public'))
].filter(f => f.endsWith('.js'));

const syntaxResults = [];
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    syntaxResults.push('OK : ' + path.relative(root, file));
  } catch (e) {
    syntaxResults.push('ERREUR : ' + path.relative(root, file) + '\n' + (e.stderr || e.message));
  }
}
section('SYNTAXE', syntaxResults.join('\n'));

section('BASE DE DONNÉES SQLITE');
const dbPath = path.join(root, 'server/odm.sqlite');
try {
  if (!fs.existsSync(dbPath)) throw new Error('Base SQLite introuvable.');
  const db = new DatabaseSync(dbPath);
  const integrity = db.prepare('PRAGMA integrity_check').all();
  section('INTÉGRITÉ SQLITE', JSON.stringify(integrity));

  const tables = db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();

  for (const table of tables) {
    const count = db.prepare('SELECT COUNT(*) AS total FROM "' + table.name + '"').get();
    report.push('\nTABLE : ' + table.name + ' | LIGNES : ' + count.total);
    report.push('STRUCTURE : ' + (table.sql || 'Non disponible'));
    const columns = db.prepare('PRAGMA table_info("' + table.name + '")').all();
    report.push('COLONNES : ' + columns.map(c => c.name + ' (' + c.type + ')').join(', '));
  }

  db.close();
} catch (e) {
  section('ERREUR SQLITE', e.message);
}

section('FIN DU RAPPORT', 'Audit terminé. Aucun fichier métier ni aucune donnée utilisateur n’a été modifié.');

const output = path.join(root, 'backups', 'rapport-audit-complet.txt');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, report.join('\n'), 'utf8');

console.log('\nAUDIT TERMINÉ.');
console.log('Rapport enregistré dans : backups/rapport-audit-complet.txt');
console.log('Nombre de fichiers JavaScript contrôlés : ' + jsFiles.length);
console.log('Erreurs de syntaxe détectées : ' + syntaxResults.filter(x => x.startsWith('ERREUR')).length);
console.log('\nAffichage du rapport :');
console.log(report.join('\n'));
