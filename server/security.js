const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Le mot de passe doit contenir entre 12 et 128 caractères.');
  }

  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });

  return `scrypt$32768$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split('$');

    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, n, r, p, saltHex, keyHex] = parts;

    if (n !== '32768' || r !== '8' || p !== '1') return false;
    if (!/^[a-f0-9]{32}$/.test(saltHex)) return false;
    if (!/^[a-f0-9]{128}$/.test(keyHex)) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');

    const actual = await scrypt(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    });

    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
