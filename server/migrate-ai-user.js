import { pool } from "./postgres.js";
async function migrate() {
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = 'assistant@odm-tech-connect.com'");
    if (existing.rows.length === 0) {
      const r = await pool.query("INSERT INTO users (email, password_hash, role, email_verified) VALUES ('assistant@odm-tech-connect.com', 'ai-no-login', 'ai', TRUE) RETURNING id");
      console.log("IA user created, ID: " + r.rows[0].id);
    } else {
      console.log("IA user exists, ID: " + existing.rows[0].id);
    }
    process.exit(0);
  } catch (e) { console.error(e.message); process.exit(1); }
}
migrate();
