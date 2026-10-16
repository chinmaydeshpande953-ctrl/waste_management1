'use strict';

/* An error that carries an HTTP status and a short code, so the server can answer properly. */
class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

/* Allows `max` calls per `windowMs` for each key (for example each IP address). */
function rateLimiter(max, windowMs) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

/* Text typed by visitors ends up on web pages, so remove < > and hidden control characters. Keeps line breaks. */
function cleanText(v, max) {
  return String(v == null ? '' : v)
    .normalize('NFC')
    .replace(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

/* Same, but for single-line fields such as names and titles. */
function oneLine(v, max) {
  return cleanText(v, max * 4).replace(/\s+/g, ' ').trim().slice(0, max);
}

const isEmail = (s) => typeof s === 'string' && s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

module.exports = { HttpError, rateLimiter, cleanText, oneLine, isEmail };
