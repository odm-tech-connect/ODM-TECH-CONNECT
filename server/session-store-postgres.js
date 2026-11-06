'use strict';

const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { pool } = require('./postgres');

const PgSessionStore = connectPgSimple(session);

const store = new PgSessionStore({
  pool,
  tableName: 'odm_sessions',
  createTableIfMissing: true,
  pruneSessionInterval: 15 * 60,
  ttl: 2 * 60 * 60
});

module.exports = store;
