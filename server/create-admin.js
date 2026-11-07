const db = require('./db');
const { hashPassword } = require('./security');

async function main() {
  try {
    const email = process.env.ODM_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ODM_ADMIN_PASSWORD;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new Error('Adresse e-mail invalide.');
    }

    if (!password) {
      throw new Error('Mot de passe absent.');
    }

    const passwordHash = await hashPassword(password);

    db.exec('BEGIN IMMEDIATE');

    try {
      const count = db.prepare(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
      ).get().total;

      if (count > 0) {
        throw new Error('Un administrateur existe déjà.');
      }

      db.prepare(`
        INSERT INTO users (email, password_hash, role, email_verified)
        VALUES (?, ?, 'admin', 1)
      `).run(email, passwordHash);

      db.exec('COMMIT');
      console.log('Administrateur créé avec succès.');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error('Erreur :', error.message);
  process.exitCode = 1;
});
