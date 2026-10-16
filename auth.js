'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const TOKEN_LIFETIME_SECONDS = 7 * 24 * 3600;   // a login lasts 7 days

/* Passwords are never stored. We store a random salt plus a scrypt hash of the password. */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

/* A login token is: base64(payload) + "." + signature. Nobody can change the payload without the secret. */
function signToken(payload, secret, nowMs) {
  const body = Buffer.from(JSON.stringify(Object.assign({}, payload, { exp: Math.floor(nowMs / 1000) + TOKEN_LIFETIME_SECONDS }))).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyToken(token, secret, nowMs) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest();
  const given = Buffer.from(parts[1], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload.exp > nowMs / 1000 ? payload : null;
  } catch (e) { return null; }
}

/* The secret comes from the TOKEN_SECRET setting. If you did not set one, a random one is created and kept in data/secret.txt. */
function loadSecret(dir) {
  if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET;
  const file = path.join(dir, 'secret.txt');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch (e) { /* create below */ }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, loadSecret };
