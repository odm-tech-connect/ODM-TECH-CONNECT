require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const path = require('node:path');

const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');
const partnershipRoutes = require('./routes/partnerships');
const companiesRoutes = require('./routes/companies');
const PostgreSQLSessionStore = require('./session-store-postgres');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 64) {
  throw new Error('SESSION_SECRET absent ou trop court.');
}

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '20kb' }));

app.use(express.static(path.join(__dirname, '..', 'public'), {
  dotfiles: 'deny',
  index: false,
  maxAge: 0
}));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.use(session({
  store: PostgreSQLSessionStore,
  name: 'odm.sid',
  secret: process.env.SESSION_SECRET,
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
app.use('/api/professional', require('./routes/professional'));
app.use('/professional', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'public', 'professional.html')));

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

app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenue sur le serveur ODM TECH CONNECT'
  });
});

app.locals.loginLimiter = loginLimiter;

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur ODM TECH CONNECT démarré sur le port ${PORT}`);
});
