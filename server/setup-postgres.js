require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL absent du fichier .env');
  }

  const schemaPath = path.join(__dirname, 'postgres-schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000
  });

  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');

    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    );

    console.log('INSTALLATION POSTGRESQL REUSSIE');
    console.log('Tables créées :');
    result.rows.forEach(row => console.log('- ' + row.table_name));
    console.log('Nombre total : ' + result.rowCount);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('INSTALLATION NON TERMINEE');
    console.error('Code : ' + (error.code || 'inconnu'));
    console.error('Message : ' + error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
