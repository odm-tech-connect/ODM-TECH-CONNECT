'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashPassword,
  verifyPassword
} = require('../server/security');

test('Le hachage produit un format scrypt valide', async () => {
  const hash = await hashPassword('ODM-Test-Password-2026!');

  assert.match(
    hash,
    /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/
  );
});

test('Un mot de passe correct est accepté', async () => {
  const password = 'ODM-Test-Password-2026!';
  const hash = await hashPassword(password);

  assert.equal(await verifyPassword(password, hash), true);
});

test('Un mauvais mot de passe est refusé', async () => {
  const hash = await hashPassword('ODM-Test-Password-2026!');

  assert.equal(
    await verifyPassword('Mauvais-Mot-De-Passe-2026!', hash),
    false
  );
});

test('Un mot de passe trop court est refusé au hachage', async () => {
  await assert.rejects(
    () => hashPassword('tropcourt'),
    /12 et 128/
  );
});

test('Un hachage invalide est refusé', async () => {
  assert.equal(
    await verifyPassword('un-mot-de-passe-valide', 'faux-hash'),
    false
  );
});
