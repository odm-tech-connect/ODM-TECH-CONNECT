import { httpServerHandler } from 'cloudflare:node';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import contactRoutes from './routes/contact.js';
import adminRoutes from './routes/admin.js';
import partnershipRoutes from './routes/partnerships.js';
import companiesRoutes from './routes/companies.js';
import professionalRoutes from './routes/professional.js';
import PostgreSQLSessionStore from './session-store-postgres.js';

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const sessionSecret = process.env.SESSION_SECRET || 'dev-placeholder-' + '0'.repeat(64);

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '20kb' }));

app.get("/api/health",(req,res)=>{res.json({service:"ODM TECH CONNECT",status:"online"});});
app.use(session({
  store: PostgreSQLSessionStore,
  name: 'odm.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 2
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/partnerships', partnershipRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/professional', professionalRoutes);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

app.get('/api/health', (req, res) => {
  res.json({
    service: 'ODM TECH CONNECT',
    status: 'online'
  });
});

app.locals.loginLimiter = loginLimiter;

app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée.' });
});

app.listen(3000);

export default httpServerHandler({ port: 3000 });
