const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const databasePath = path.join(__dirname, 'odm.sqlite');
const db = new DatabaseSync(databasePath);

db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'company'
    CHECK(role IN ('company', 'admin')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT,
  sector TEXT,
  description TEXT,
  website TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(approval_status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partnership_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_company_id INTEGER NOT NULL,
  receiver_company_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(sender_company_id) REFERENCES companies(id),
  FOREIGN KEY(receiver_company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_type TEXT NOT NULL,
  company_name TEXT NOT NULL,
  country TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  sector TEXT NOT NULL,
  collaboration TEXT NOT NULL,
  message TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'fr'
    CHECK(language IN ('fr', 'en')),
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK(status IN ('new', 'reviewing', 'answered', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_created
ON contact_requests(created_at);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
ON sessions(expires_at);
`);

console.log('Base de données ODM TECH CONNECT initialisée.');
db.close();
