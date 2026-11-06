'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Le partenariat vérifie les e-mails des deux entreprises', () => {
  const source = fs.readFileSync(
    'server/routes/partnerships.js',
    'utf8'
  );

  assert.equal(
    (source.match(/u\.email_verified\s*=\s*TRUE/g) || []).length,
    2
  );

  assert.match(source, /JOIN users u ON u\.id = c\.user_id/);
});

test('Les requêtes de partenariat utilisent des paramètres SQL', () => {
  const source = fs.readFileSync(
    'server/routes/partnerships.js',
    'utf8'
  );

  assert.match(source, /WHERE c\.id = \$1/);
  assert.match(source, /\[senderCompanyId, receiverCompanyId, cleanMessage\]/);
});

test('La route de contact impose le consentement', () => {
  const source = fs.readFileSync(
    'server/routes/contact.js',
    'utf8'
  );

  assert.match(source, /consent !== true/);
  assert.match(source, /INSERT INTO contact_requests/);
});

test('Les routes administrateur sont protégées', () => {
  const source = fs.readFileSync(
    'server/routes/admin.js',
    'utf8'
  );

  assert.match(source, /router\.use\(requireAdmin\)/);
});

test('Les mots de passe utilisent scrypt et une comparaison sécurisée', () => {
  const source = fs.readFileSync(
    'server/security.js',
    'utf8'
  );

  assert.match(source, /crypto\.scrypt/);
  assert.match(source, /crypto\.timingSafeEqual/);
});
