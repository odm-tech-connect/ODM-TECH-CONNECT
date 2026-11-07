#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

cd "$HOME/ODM-TECH-CONNECT"

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP="$PWD/backups/construction-globale-$DATE"

echo "======================================"
echo " ODM TECH CONNECT - SAUVEGARDE GLOBALE"
echo "======================================"

mkdir -p "$BACKUP/fichiers" "$BACKUP/base-donnees"

echo "[1/5] Vérification des fichiers essentiels..."

for f in package.json server/app.js server/db.js server/database.js server/routes/auth.js server/routes/partnerships.js public/admin.html index.html en/index.html; do
  test -f "$f" || { echo "Fichier absent : $f"; exit 1; }
done

echo "[2/5] Vérification de la syntaxe..."

while IFS= read -r f; do
  node --check "$f" >/dev/null
done < <(find server public -type f -name '*.js' 2>/dev/null)

echo "[3/5] Sauvegarde des fichiers..."

tar --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./backups' \
    --exclude='./server/odm.sqlite-wal' \
    --exclude='./server/odm.sqlite-shm' \
    -czf "$BACKUP/fichiers/projet.tar.gz" .

echo "[4/5] Sauvegarde cohérente de SQLite..."

BACKUP="$BACKUP" node <<'NODE'
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.resolve('server/odm.sqlite'));
try {
  const target = path.join(process.env.BACKUP, 'base-donnees', 'odm.sqlite');
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  console.log('Base sauvegardée :', target);
} finally {
  db.close();
}
NODE

echo "[5/5] Rapport de l'état du projet..."

BACKUP="$BACKUP" node <<'NODE' > "$BACKUP/etat-projet.txt"
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('server/odm.sqlite');
try {
  console.log('Date :', new Date().toISOString());
  console.log('Node :', process.version);
  console.log('Tables :');
  console.log(db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all());
  console.log('Intégrité :', db.prepare('PRAGMA integrity_check').all());
  console.log('Clés étrangères :', db.prepare('PRAGMA foreign_key_check').all());
} finally {
  db.close();
}
NODE

echo
echo "======================================"
echo " SAUVEGARDE TERMINÉE"
echo "Dossier : $BACKUP"
echo "Fichiers, base SQLite et rapport sauvegardés."
echo "Aucun fichier de production modifié."
echo "======================================"
