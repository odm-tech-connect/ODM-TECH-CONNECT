'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ quiet: true });

const checks = [];
const report = {
  project: 'ODM TECH CONNECT',
  date: new Date().toISOString(),
  mode: 'SECURE READ-ONLY AUDIT',
  checks,
  database: {
    connected: false,
    tables: []
  }
};

function check(name, ok, detail = '', severity = 'warning') {
  const item = {
    name,
    status: ok ? 'OK' : severity.toUpperCase(),
    detail
  };

  checks.push(item);

  console.log(
    (ok ? '[OK] ' : '[' + severity.toUpperCase() + '] ') +
    name + (detail ? ' : ' + detail : '')
  );
}

function exists(file) {
  return fs.existsSync(file);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function walk(dir) {
  if (!exists(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) return walk(full);

      return entry.isFile() && full.endsWith('.js')
        ? [full] : [];
    });
}

function command(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: 20000
  });
}

async function main() {
  console.log('\n====================================');
  console.log(' ODM TECH CONNECT - AUDIT SECURISE');
  console.log('====================================');

  console.log('\n1. FICHIERS ESSENTIELS');

  const essential = [
    'package.json',
    'package-lock.json',
    '.env.example',
    '.gitignore',
    'index.html',
    'en/index.html',
    'server/app.js',
    'server/postgres.js',
    'server/routes/auth.js',
    'server/routes/admin.js',
    'server/routes/companies.js',
    'server/routes/contact.js',
    'server/routes/partnerships.js',
    'server/routes/professional.js',
    'public/admin.html',
    'public/entreprises.html',
    'public/professional.html'
  ];

  for (const file of essential) {
    check('Fichier ' + file, exists(file));
  }

  console.log('\n2. SYNTAXE JAVASCRIPT');

  const jsFiles = [
    ...walk('server'),
    ...walk('public')
  ];

  let syntaxErrors = 0;

  for (const file of jsFiles) {
    const result = command('node', ['--check', file]);

    if (result.status !== 0) {
      syntaxErrors++;
      console.log('[ERREUR SYNTAXE] ' + file);
    }
  }

  check(
    'Syntaxe JavaScript',
    syntaxErrors === 0,
    jsFiles.length + ' fichiers contrôlés',
    'error'
  );

  console.log('\n3. DEPENDANCES');

  const packageJson = JSON.parse(read('package.json'));

  for (const dep of [
    'express',
    'express-session',
    'connect-pg-simple',
    'pg',
    'dotenv',
    'helmet',
    'express-rate-limit',
    'nodemailer'
  ]) {
    let installed = false;

    try {
      require.resolve(dep);
      installed = true;
    } catch {}

    check('Dépendance ' + dep, installed);
  }

  check(
    'Commande de démarrage',
    packageJson.scripts?.start === 'node server/app.js'
  );

  check(
    'Tests automatisés',
    Boolean(packageJson.scripts?.test) &&
      !packageJson.scripts.test.includes('no test specified'),
    'Le script npm test doit être finalisé'
  );

  console.log('\n4. CONFIGURATION');

  const requiredVars = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'APP_BASE_URL'
  ];

  for (const name of requiredVars) {
    check(
      'Variable ' + name,
      Boolean(process.env[name]),
      'Seule la présence est vérifiée'
    );
  }

  check(
    'Longueur du secret de session',
    Boolean(process.env.SESSION_SECRET) &&
      process.env.SESSION_SECRET.length >= 64
  );

  let validUrl = false;

  try {
    validUrl = new URL(process.env.APP_BASE_URL).protocol === 'https:';
  } catch {}

  check('URL publique HTTPS', validUrl);

  const smtpReady = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'APP_BASE_URL'
  ].every(key => Boolean(process.env[key]));

  check('Configuration e-mail complète', smtpReady);

  console.log('\n5. SECURITE DES ACCES');

  const admin = read('server/routes/admin.js');
  const professional = read('server/routes/professional.js');
  const auth = read('server/routes/auth.js');
  const app = read('server/app.js');

  check(
    'Protection administrateur',
    /function requireAdmin/.test(admin) &&
      /router\.use\(requireAdmin\)/.test(admin) &&
      /role !== 'admin'/.test(admin),
    '',
    'error'
  );

  check(
    'Protection entreprise',
    /function requireCompany/.test(professional) &&
      /router\.use\(requireCompany\)/.test(professional) &&
      /approval_status !== 'approved'/.test(professional) &&
      /email_verified !== true/.test(professional),
    '',
    'error'
  );

  check(
    'Régénération de session',
    /req\.session\.regenerate/.test(auth),
    '',
    'error'
  );

  check(
    'Limitation des connexions',
    /router\.post\(['"]\/login['"],\s*loginLimiter/.test(auth)
  );

  check('Cookie HTTPOnly', /httpOnly:\s*true/.test(app));
  check('Cookie Secure en production', /secure:\s*process\.env\.NODE_ENV\s*===\s*'production'/.test(app));
  check('Helmet présent', /helmet/.test(app));

  console.log('\n6. PROTECTION DES DONNEES');

  check(
    'Propriété des produits',
    /WHERE id = \$4 AND company_id = \$5/.test(professional) &&
    /WHERE id = \$1 AND company_id = \$2/.test(professional),
    '',
    'error'
  );

  check(
    'Accès aux devis limité',
    /buyer_company_id = \$1/.test(professional) &&
    /seller_company_id = \$1/.test(professional),
    '',
    'error'
  );

  check(
    'Destinataire des partenariats',
    /receiver_company_id = \$3/.test(professional),
    '',
    'error'
  );

  check(
    'Partenariats en attente uniquement',
    /status = 'pending'/.test(professional),
    '',
    'error'
  );

  check(
    'Catalogue public filtré',
    /approval_status = 'approved'/.test(professional) &&
    /email_verified = TRUE/.test(professional) &&
    /p\.status = 'active'/.test(professional)
  );

  console.log('\n7. GIT');

  const gitStatus = command('git', ['status', '--porcelain']);

  if (gitStatus.status === 0) {
    const files = gitStatus.stdout.trim()
      ? gitStatus.stdout.trim().split('\n').length
      : 0;

    check('Etat Git', true, files + ' éléments modifiés ou non suivis');
  } else {
    check('Etat Git', false);
  }

  const envTracked = command(
    'git',
    ['ls-files', '--error-unmatch', '.env']
  );

  check('.env non suivi par Git', envTracked.status !== 0, '', 'error');

  const diffCheck = command('git', ['diff', '--cached', '--check']);

  check('Vérification des fichiers préparés', diffCheck.status === 0);

  const remote = command(
    'git',
    ['ls-tree', '-r', '--name-only', 'origin/main', 'server/']
  );

  if (remote.status === 0) {
    check(
      'Backend sur GitHub',
      Boolean(remote.stdout.trim()),
      remote.stdout.trim()
        ? 'Fichiers serveur présents'
        : 'Aucun fichier serveur sur origin/main'
    );
  } else {
    check('Backend sur GitHub', false, 'Vérification distante impossible');
  }

  console.log('\n8. POSTGRESQL - LECTURE SEULE');

  if (!process.env.DATABASE_URL) {
    check('Connexion PostgreSQL', false, 'Configuration absente');
  } else {
    let pool;

    try {
      ({ pool } = require('../server/postgres'));

      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      report.database.connected = true;
      report.database.tables = result.rows.map(row => row.table_name);

      check('Connexion PostgreSQL', true);
      check(
        'Tables PostgreSQL',
        result.rows.length >= 8,
        result.rows.length + ' tables trouvées'
      );

      const expected = [
        'users',
        'companies',
        'email_verifications',
        'contact_requests',
        'partnership_requests',
        'products',
        'quote_requests',
        'odm_sessions'
      ];

      for (const table of expected) {
        check(
          'Table ' + table,
          report.database.tables.includes(table)
        );
      }
    } catch (error) {
      check(
        'Connexion PostgreSQL',
        false,
        error.code || 'Erreur de connexion'
      );
    } finally {
      if (pool) {
        await pool.end().catch(() => {});
      }
    }
  }

  console.log('\n9. RAPPORT');

  const errors = checks.filter(x => x.status === 'ERROR').length;
  const warnings = checks.filter(x => x.status === 'WARNING').length;
  const passed = checks.filter(x => x.status === 'OK').length;

  report.summary = {
    passed,
    warnings,
    errors,
    javascript_files: jsFiles.length
  };

  const filename =
    'odm-audit-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';

  const destination = path.join('reports', filename);

  fs.writeFileSync(
    destination,
    JSON.stringify(report, null, 2),
    { mode: 0o600 }
  );

  console.log('\n====================================');
  console.log(' RESULTAT FINAL');
  console.log('====================================');
  console.log('Contrôles réussis : ' + passed);
  console.log('Points à examiner : ' + warnings);
  console.log('Erreurs bloquantes : ' + errors);
  console.log('Fichiers JS : ' + jsFiles.length);
  console.log('Rapport : ' + destination);
  console.log('\nAUCUNE MIGRATION NI MODIFICATION DU CODE SOURCE.');
}

main().catch(error => {
  console.error('Erreur audit :', error.message);
  process.exitCode = 1;
});
