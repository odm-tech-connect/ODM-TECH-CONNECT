import { pool } from './postgres.js';

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(sender_id, receiver_id, created_at DESC);
    `);

    console.log('Table messages créée avec succès ✅');
    process.exit(0);
  } catch (error) {
    console.error('Erreur migration :', error.message);
    process.exit(1);
  }
}

migrate();
