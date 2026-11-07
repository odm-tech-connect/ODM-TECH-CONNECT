import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './postgres.js';

const PgSessionStore = connectPgSimple(session);

const store = new PgSessionStore({
  pool,
  tableName: 'odm_sessions',
  createTableIfMissing: true,
  pruneSessionInterval: 15 * 60,
  ttl: 2 * 60 * 60
});

export default store;
