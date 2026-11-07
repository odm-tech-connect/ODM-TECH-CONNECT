const session = require('express-session');
const db = require('./db');

class SQLiteSessionStore extends session.Store {
  constructor() {
    super();

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires
      ON sessions(expires_at);
    `);

    this.insert = db.prepare(`
      INSERT INTO sessions (session_id, data, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        data = excluded.data,
        expires_at = excluded.expires_at
    `);

    this.find = db.prepare(`
      SELECT data FROM sessions
      WHERE session_id = ? AND expires_at > ?
    `);

    this.remove = db.prepare(`
      DELETE FROM sessions WHERE session_id = ?
    `);

    this.updateExpiry = db.prepare(`
      UPDATE sessions SET expires_at = ?
      WHERE session_id = ?
    `);

    this.clean = db.prepare(`
      DELETE FROM sessions WHERE expires_at <= ?
    `);
  }

  get(sid, callback) {
    try {
      const now = Date.now();
      this.clean.run(now);
      const row = this.find.get(sid, now);
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 2 * 60 * 60 * 1000;

      this.insert.run(sid, JSON.stringify(sess), expires);
      this.clean.run(Date.now());
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.remove.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 2 * 60 * 60 * 1000;

      this.updateExpiry.run(expires, sid);
      this.clean.run(Date.now());
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

module.exports = SQLiteSessionStore;
