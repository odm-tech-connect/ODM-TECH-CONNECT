'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, 'backups', 'installation-entreprises-' + stamp);

function fail(message) {
  console.error('\nERREUR : ' + message);
  process.exit(1);
}

const authFile = 'server/routes/auth.js';
const adminFile = 'server/routes/admin.js';
const envFile = '.env.example';

for (const file of [authFile, adminFile, envFile]) {
  if (!fs.existsSync(file)) fail('Fichier manquant : ' + file);
}

if (!fs.existsSync('node_modules/nodemailer')) {
  fail('Nodemailer est absent. Exécute : npm install nodemailer');
}

let auth = fs.readFileSync(authFile, 'utf8');
let admin = fs.readFileSync(adminFile, 'utf8');
let envExample = fs.readFileSync(envFile, 'utf8');

if (auth.includes('ODM_EMAIL_VERIFICATION_V2')) {
  fail('La nouvelle vérification semble déjà installée. Aucun changement effectué.');
}

const commit = `      createVerification.run(userId, tokenHash, expiresAt);

      db.exec('COMMIT');
      transactionStarted = false;`;

if (!auth.includes(commit)) {
  fail('Structure de la transaction d’inscription non reconnue. Aucun changement effectué.');
}

if (!auth.includes("const router = express.Router();") ||
    !auth.includes('// CONNEXION')) {
  fail('Structure de auth.js non reconnue. Aucun changement effectué.');
}

const adminRoute = admin.indexOf("router.patch('/companies/:id/status'");
const adminRouteAlt = admin.indexOf('router.patch("/companies/:id/status"');
const routePosition = adminRoute >= 0 ? adminRoute : adminRouteAlt;

if (routePosition < 0) {
  fail('Route de validation administrative non trouvée. Aucun changement effectué.');
}

if (!admin.includes("require('../db')") && !admin.includes("require('../db');")) {
  fail('Connexion à la base de données non reconnue dans admin.js.');
}

fs.mkdirSync(backup, { recursive: true });

for (const file of [authFile, adminFile, envFile]) {
  fs.copyFileSync(file, path.join(backup, file.replaceAll('/', '__')));
}

for (const file of [
  'public/entreprises.html',
  'public/entreprises.css',
  'public/entreprises.js'
]) {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(backup, file.replaceAll('/', '__')));
  }
}

if (!auth.includes("require('nodemailer')")) {
  auth = auth.replace(
    "const crypto = require('node:crypto');",
    "const crypto = require('node:crypto');\nconst nodemailer = require('nodemailer');"
  );
}

const mailer = `
// ODM_EMAIL_VERIFICATION_V2
async function sendVerificationEmail(destination, token) {
  const required = [
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER',
    'SMTP_PASS', 'SMTP_FROM', 'APP_BASE_URL'
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    const error = new Error('Configuration e-mail incomplète : ' + missing.join(', '));
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }

  const base = process.env.APP_BASE_URL.replace(/\\/$/, '');
  let parsed;

  try {
    parsed = new URL(base);
  } catch {
    throw new Error('APP_BASE_URL invalide.');
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1') {
    throw new Error('APP_BASE_URL doit utiliser HTTPS.');
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT invalide.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const link = new URL('/entreprises.html', base);
  link.searchParams.set('token', token);

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: destination,
    subject: 'Vérification de votre adresse – ODM TECH CONNECT',
    text:
      'Bonjour,\\n\\n' +
      'Pour vérifier votre adresse e-mail, ouvrez ce lien :\\n' +
      link.toString() +
      '\\n\\nCe lien expire dans 24 heures.\\n\\nODM TECH CONNECT',
    html:
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#10243a">' +
      '<h2 style="color:#168bd2">ODM TECH CONNECT</h2>' +
      '<p>Bonjour,</p>' +
      '<p>Confirmez votre adresse e-mail en cliquant sur le bouton ci-dessous.</p>' +
      '<p><a href="' + link.toString() +
      '" style="display:inline-block;background:#168bd2;color:white;padding:14px 20px;border-radius:7px;text-decoration:none">Vérifier mon adresse e-mail</a></p>' +
      '<p>Ce lien expire dans 24 heures.</p>' +
      '<p>Connecter. Représenter. Développer.</p></div>'
  });
}
`;

auth = auth.replace(
  'const router = express.Router();',
  "const router = express.Router();\n" + mailer
);

auth = auth.replace(
  commit,
  `      createVerification.run(userId, tokenHash, expiresAt);

      await sendVerificationEmail(cleanEmail, verificationToken);

      db.exec('COMMIT');
      transactionStarted = false;`
);

auth = auth.replace(
  `    // L'envoi du jeton par e-mail sera connecté ultérieurement.
    // Le jeton ne doit jamais être envoyé au navigateur.
`,
  ''
);

const verificationRoute = `
// VÉRIFICATION DE L'ADRESSE E-MAIL
router.post('/verify-email', async (req, res) => {
  try {
    const token = req.body && req.body.token;

    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({ error: 'Lien de vérification invalide.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = db.prepare(
      'SELECT user_id, expires_at FROM email_verifications WHERE token_hash = ?'
    ).get(tokenHash);

    if (!record) {
      return res.status(400).json({
        error: 'Lien invalide ou déjà utilisé.'
      });
    }

    if (new Date(record.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM email_verifications WHERE token_hash = ?').run(tokenHash);
      return res.status(400).json({ error: 'Ce lien de vérification a expiré.' });
    }

    db.exec('BEGIN IMMEDIATE');

    try {
      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(record.user_id);
      db.prepare('DELETE FROM email_verifications WHERE token_hash = ?').run(tokenHash);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return res.status(200).json({
      message: 'Adresse e-mail vérifiée. Votre entreprise attend maintenant la validation administrative.'
    });
  } catch (error) {
    console.error('Erreur vérification e-mail :', error.message);
    return res.status(500).json({
      error: 'Impossible de vérifier cette adresse pour le moment.'
    });
  }
});

`;

auth = auth.replace('// CONNEXION', verificationRoute + '// CONNEXION');

const smtpErrorAnchor = `    console.error('Erreur inscription :', error.message);

    return res.status(500).json({
      error: 'Impossible de créer le compte pour le moment.'
    });`;

if (!auth.includes(smtpErrorAnchor)) {
  fail('Gestion des erreurs d’inscription non reconnue.');
}

auth = auth.replace(
  smtpErrorAnchor,
  `    if (error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'Le service e-mail doit être configuré avant de pouvoir terminer une inscription.'
      });
    }

    console.error('Erreur inscription :', error.message);

    return res.status(500).json({
      error: 'Impossible de créer le compte pour le moment.'
    });`
);

const approvalGuard = `// ODM_VERIFIED_APPROVAL_GUARD_V2
router.use('/companies/:id/status', (req, res, next) => {
  if (req.method !== 'PATCH' || !req.body || req.body.status !== 'approved') {
    return next();
  }

  try {
    const db = require('../db');
    const company = db.prepare(
      'SELECT u.email_verified FROM companies c JOIN users u ON u.id = c.user_id WHERE c.id = ?'
    ).get(Number(req.params.id));

    if (!company || company.email_verified !== 1) {
      return res.status(403).json({
        error: 'Vérifiez l’adresse e-mail de cette entreprise avant de l’approuver.'
      });
    }

    return next();
  } catch (error) {
    console.error('Contrôle approbation :', error.message);
    return res.status(500).json({
      error: 'Impossible de vérifier le statut de cette entreprise.'
    });
  }
});

`;

admin = admin.slice(0, routePosition) + approvalGuard + admin.slice(routePosition);

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Espace entreprises | ODM TECH CONNECT</title>
<link rel="stylesheet" href="/entreprises.css">
</head>
<body>
<header><a href="/">ODM <span>TECH CONNECT</span></a><a href="/">Accueil</a></header>
<main>
<section class="intro">
<p class="eyebrow">ESPACE PROFESSIONNEL</p>
<h1>Bienvenue dans l'espace entreprises</h1>
<p>Créez votre profil pour préparer vos relations commerciales avec ODM TECH CONNECT.</p>
<p class="notice">Les comptes doivent être vérifiés par e-mail puis approuvés par l'administration. La plateforme est en cours de développement.</p>
</section>
<div id="message" role="status" aria-live="polite"></div>
<section class="panels">
<form id="registerForm" class="panel">
<h2>Créer un compte</h2>
<label>Nom de l'entreprise<input name="companyName" minlength="2" maxlength="120" required></label>
<label>E-mail<input name="email" type="email" maxlength="254" required></label>
<label>Pays<input name="country" minlength="2" maxlength="100" required></label>
<label>Secteur<input name="sector" minlength="2" maxlength="100" required></label>
<label>Mot de passe<input name="password" type="password" minlength="10" maxlength="128" required></label>
<button type="submit">Créer mon compte</button>
<small>Un lien de vérification sera envoyé à votre adresse e-mail.</small>
</form>
<form id="loginForm" class="panel">
<h2>Connexion</h2>
<label>E-mail<input name="email" type="email" required></label>
<label>Mot de passe<input name="password" type="password" required></label>
<button type="submit">Se connecter</button>
<a href="/professional">Accéder à l'espace professionnel</a>
</form>
</section>
<footer>ODM TECH CONNECT · Connecter. Représenter. Développer.</footer>
</main>
<script src="/entreprises.js" defer></script>
</body>
</html>`;

const css = `*{box-sizing:border-box}body{margin:0;background:#f3f9fd;color:#10243a;font-family:Arial,sans-serif}header{height:68px;padding:0 6%;display:flex;align-items:center;justify-content:space-between;background:white;border-bottom:1px solid #dce8f0}header a{color:#10243a;text-decoration:none;font-weight:bold}header span,.eyebrow{color:#1597dc}main{max-width:1050px;margin:35px auto;padding:0 18px}.intro{text-align:center;max-width:760px;margin:0 auto 25px}.intro h1{font-size:clamp(28px,5vw,44px);margin:10px 0}.intro p{line-height:1.6;color:#536779}.notice{background:#e5f5ff;padding:12px;border-radius:8px}.eyebrow{font-size:12px;letter-spacing:2px;font-weight:bold}.panels{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{background:white;padding:24px;border:1px solid #dce8f0;border-radius:13px}.panel h2{margin-top:0}.panel label{display:block;font-weight:bold;font-size:13px;margin:13px 0}.panel input{display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd9e4;border-radius:7px;font-size:15px}.panel button{width:100%;padding:13px;background:#1597dc;color:white;border:0;border-radius:7px;font-weight:bold;margin:12px 0;cursor:pointer}.panel small{display:block;color:#647789;line-height:1.5}.panel a{color:#087fc0;font-weight:bold}#message{display:none;padding:13px;margin:16px 0;border-radius:8px;line-height:1.5}#message.show{display:block}#message.error{background:#ffeded;color:#922}#message.success{background:#e7f8ed;color:#17653b}footer{text-align:center;color:#718394;font-size:12px;margin:28px}@media(max-width:700px){.panels{grid-template-columns:1fr}}`;

const js = `'use strict';
const box = document.getElementById('message');

function message(text, type) {
  box.textContent = text;
  box.className = 'show ' + type;
}

async function send(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    credentials: 'same-origin',
    body: JSON.stringify(data)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Une erreur est survenue.');
  return result;
}

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await send('/api/auth/register', data);
    message(result.message, 'success');
    event.currentTarget.reset();
  } catch (error) {
    message(error.message, 'error');
  }
});

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await send('/api/auth/login', data);
    location.assign('/professional');
  } catch (error) {
    message(error.message, 'error');
  }
});

(async () => {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  if (!token) return;

  try {
    const result = await send('/api/auth/verify-email', {token});
    message(result.message, 'success');
    params.delete('token');
    history.replaceState({}, '', location.pathname + (params.toString() ? '?' + params.toString() : ''));
  } catch (error) {
    message(error.message, 'error');
  }
})();
`;

fs.writeFileSync(authFile, auth);
fs.writeFileSync(adminFile, admin);
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/entreprises.html', html);
fs.writeFileSync('public/entreprises.css', css);
fs.writeFileSync('public/entreprises.js', js);

if (!envExample.includes('SMTP_HOST=')) {
  envExample += `
# Configuration du service e-mail sortant
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
APP_BASE_URL=
`;
  fs.writeFileSync(envFile, envExample);
}

console.log('\nINSTALLATION TERMINÉE');
console.log('Sauvegarde : ' + path.relative(root, backup));
console.log('Page entreprise : /entreprises.html');
console.log('Route de vérification : POST /api/auth/verify-email');
console.log('Approbation administrative protégée par la vérification e-mail.');
console.log('Aucune donnée SQLite ni aucun compte n’a été modifié.');
