const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const databasePath = path.join(__dirname, 'odm.sqlite');
const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`);

module.exports = db;
