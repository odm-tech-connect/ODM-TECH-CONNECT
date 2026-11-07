const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const db = new DatabaseSync(path.join(__dirname, 'odm.sqlite'));

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrationDirectory = path.join(__dirname, 'migrations');

const migrations = fs.readdirSync(migrationDirectory)
  .filter(file => file.endsWith('.js'))
  .sort();

for (const migration of migrations) {
  const alreadyApplied = db.prepare(
    'SELECT id FROM schema_migrations WHERE migration = ?'
  ).get(migration);

  if (alreadyApplied) {
    console.log('Déjà appliquée :', migration);
    continue;
  }

  const applyMigration = require(path.join(migrationDirectory, migration));

  db.exec('BEGIN');
  try {
    applyMigration(db);
    db.prepare(
      'INSERT INTO schema_migrations (migration) VALUES (?)'
    ).run(migration);
    db.exec('COMMIT');
    console.log('Migration appliquée :', migration);
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Échec de migration :', migration);
    throw error;
  }
}

db.close();
console.log('Gestion des migrations terminée.');
