require('dotenv').config();

const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');

async function main() {
  const sqlite = new DatabaseSync('server/odm.sqlite', {
    readOnly: true
  });

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000
  });

  try {
    const sourceUsers = sqlite.prepare(
      'SELECT COUNT(*) AS total FROM users'
    ).get().total;

    const admins = sqlite.prepare(
      `SELECT id, email, password_hash, role,
              email_verified, created_at
       FROM users WHERE role = 'admin'`
    ).all();

    if (sourceUsers !== 1 || admins.length !== 1) {
      throw new Error('La base SQLite ne correspond pas aux vérifications attendues. Transfert annulé.');
    }

    const admin = admins[0];

    if (admin.email_verified !== 1) {
      throw new Error('Le compte administrateur n’est pas vérifié. Transfert annulé.');
    }

    await pg.connect();
    await pg.query('BEGIN');

    const existing = await pg.query(
      'SELECT COUNT(*)::int AS total FROM users'
    );

    if (existing.rows[0].total !== 0) {
      throw new Error('La table users de Neon n’est pas vide. Transfert annulé.');
    }

    const inserted = await pg.query(
      `INSERT INTO users
       (id, email, password_hash, role, email_verified, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, role, email_verified`,
      [
        admin.id,
        admin.email,
        admin.password_hash,
        admin.role,
        Boolean(admin.email_verified),
        admin.created_at
      ]
    );

    await pg.query(
      `SELECT setval(
        pg_get_serial_sequence('users', 'id'),
        (SELECT MAX(id) FROM users),
        true
      )`
    );

    const check = await pg.query(
      `SELECT id, role, email_verified, password_hash
       FROM users WHERE id = $1`,
      [admin.id]
    );

    if (
      check.rowCount !== 1 ||
      check.rows[0].password_hash !== admin.password_hash ||
      check.rows[0].role !== 'admin' ||
      check.rows[0].email_verified !== true
    ) {
      throw new Error('La vérification du transfert a échoué.');
    }

    await pg.query('COMMIT');

    console.log('TRANSFERT ADMINISTRATEUR REUSSI');
    console.log('Identifiant conservé : ' + inserted.rows[0].id);
    console.log('Rôle : ' + inserted.rows[0].role);
    console.log('E-mail vérifié : ' + inserted.rows[0].email_verified);
    console.log('Empreinte du mot de passe : conservée et vérifiée');
  } catch (error) {
    try {
      await pg.query('ROLLBACK');
    } catch {}
    console.error('TRANSFERT ANNULE');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await pg.end().catch(() => {});
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
