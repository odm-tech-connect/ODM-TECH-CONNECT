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
import messagesRoutes from './routes/messages.js';
import cartRoutes from './routes/cart.js';
import ordersRoutes from './routes/orders.js';
import reviewsRoutes from './routes/reviews.js';
import aiRoutes from './routes/ai.js';
import notificationsRoutes from './routes/notifications.js';
import PostgreSQLSessionStore from './session-store-postgres.js';

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const sessionSecret = process.env.SESSION_SECRET || 'dev-placeholder-' + '0'.repeat(64);

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', (req, res) => {
  res.json({ service: 'ODM TECH CONNECT', status: 'online' });
});

app.use((req, res, next) => {
  session({
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
  })(req, res, (err) => {
    if (err) {
      console.error('Session error:', err.message);
      next();
    } else {
      next();
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/partnerships', partnershipRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/professional', professionalRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationsRoutes);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

app.locals.loginLimiter = loginLimiter;

app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée.' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Erreur serveur.' });
});

app.listen(3000);

export default httpServerHandler({ port: 3000 });
