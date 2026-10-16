'use strict';
/*
  Starter backend. No packages to install, only Node.js 18 or newer.

  Start it with:   node server.js
  Then open:       http://localhost:3000
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { Db } = require('./lib/db');
const auth = require('./lib/auth');
const { createWeather } = require('./lib/weather');
const { HttpError, rateLimiter, cleanText, oneLine, isEmail } = require('./lib/util');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bad = (message) => new HttpError(400, 'invalid_input', message);

function createApp(opts) {
  opts = opts || {};
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const db = new Db(path.join(dataDir, 'db.json'));
  const secret = opts.secret || auth.loadSecret(dataDir);
  const adminEmail = String(opts.adminEmail || process.env.ADMIN_EMAIL || '').toLowerCase();
  const corsOrigin = process.env.CORS_ORIGIN || '*';   // set CORS_ORIGIN to your website address when you publish
  const now = opts.now || Date.now;
  const quiet = !!opts.silent;
  const weather = createWeather({ fetchImpl: opts.fetchImpl, now });
  const limits = Object.assign({ auth: 10, contact: 5 }, opts.limits);
  const allowAuth = rateLimiter(limits.auth, 60 * 1000);
  const allowContact = rateLimiter(limits.contact, 60 * 1000);

  /* ---------- helpers ---------- */
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

  function currentUser(headers) {
    const m = /^Bearer (.+)$/.exec(headers.authorization || '');
    const payload = m && auth.verifyToken(m[1], secret, now());
    const user = payload && db.col('users').find((u) => u.id === payload.sub);
    if (!user) throw new HttpError(401, 'not_logged_in', 'Please log in first');
    return user;
  }

  function publicItem(it) {
    const owner = db.col('users').find((u) => u.id === it.ownerId);
    return {
      id: it.id, title: it.title, description: it.description, category: it.category, price: it.price,
      unit: it.unit, quantity: it.quantity, location: it.location,
      owner: { id: it.ownerId, name: owner ? owner.name : 'Unknown' },
      createdAt: it.createdAt, updatedAt: it.updatedAt
    };
  }

  /* Checks the fields of a listing. With partial=true only the fields that were sent are checked (used for updates). */
  function itemFields(body, partial) {
    if (!body || typeof body !== 'object') throw bad('Send a JSON body');
    const out = {};
    const has = (k) => body[k] !== undefined;
    if (!partial || has('title')) {
      const t = oneLine(body.title, 80);
      if (t.length < 3) throw bad('title must be 3 to 80 characters');
      out.title = t;
    }
    if (!partial || has('description')) out.description = cleanText(body.description, 1000);
    if (!partial || has('category')) {
      const c = oneLine(body.category, 30).toLowerCase();
      if (!c) throw bad('category is required');
      out.category = c;
    }
    if (!partial || has('price')) {
      const p = typeof body.price === 'string' && body.price.trim() !== '' ? Number(body.price) : body.price;
      if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 10000000) throw bad('price must be a number from 0 to 10000000');
      out.price = Math.round(p * 100) / 100;
    }
    if (has('unit')) out.unit = oneLine(body.unit, 10); else if (!partial) out.unit = '';
    if (!partial || has('quantity')) {
      const q = body.quantity == null ? 0 : body.quantity;
      if (!Number.isInteger(q) || q < 0 || q > 1000000) throw bad('quantity must be a whole number from 0 to 1000000');
      out.quantity = q;
    }
    if (has('location')) out.location = oneLine(body.location, 60); else if (!partial) out.location = '';
    return out;
  }

  /* ---------- routes ---------- */
  const routes = [];
  function route(method, pattern, fn) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, fn });
  }

  route('GET', '/api/health', () => ({ status: 'ok', time: new Date(now()).toISOString() }));

  /* --- accounts --- */
  route('POST', '/api/auth/register', async ({ body, ip, ctx }) => {
    if (!allowAuth(ip)) throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a minute.');
    if (!body || typeof body !== 'object') throw bad('Send a JSON body');
    const name = oneLine(body.name, 50);
    const email = String(body.email || '').trim().toLowerCase();
    const password = body.password;
    if (name.length < 2) throw bad('name must be 2 to 50 characters');
    if (!isEmail(email)) throw bad('Enter a valid email address');
    if (typeof password !== 'string' || password.length < 8 || password.length > 100) throw bad('password must be 8 to 100 characters');
    if (db.col('users').some((u) => u.email === email)) throw new HttpError(409, 'email_taken', 'An account with this email already exists');

    const user = {
      id: crypto.randomUUID(), name, email, passwordHash: await auth.hashPassword(password),
      role: email === adminEmail ? 'admin' : 'user', createdAt: new Date(now()).toISOString()
    };
    if (db.col('users').some((u) => u.email === email)) throw new HttpError(409, 'email_taken', 'An account with this email already exists');
    db.col('users').push(user);
    db.save();
    ctx.status = 201;
    return { token: auth.signToken({ sub: user.id, role: user.role }, secret, now()), user: publicUser(user) };
  });

  route('POST', '/api/auth/login', async ({ body, ip }) => {
    if (!allowAuth(ip)) throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a minute.');
    if (!body || typeof body !== 'object') throw bad('Send a JSON body');
    const email = String(body.email || '').trim().toLowerCase();
    const user = db.col('users').find((u) => u.email === email);
    // Always run the password check, so a wrong email and a wrong password take the same time.
    const ok = await auth.verifyPassword(String(body.password || ''), user ? user.passwordHash : '00:00');
    if (!user || !ok) throw new HttpError(401, 'bad_login', 'Wrong email or password');
    return { token: auth.signToken({ sub: user.id, role: user.role }, secret, now()), user: publicUser(user) };
  });

  route('GET', '/api/auth/me', ({ headers }) => ({ user: publicUser(currentUser(headers)) }));

  /* --- listings (products, produce, services... whatever your project needs) --- */
  route('GET', '/api/items', ({ query }) => {
    const search = oneLine(query.get('search') || '', 60).toLowerCase();
    const category = oneLine(query.get('category') || '', 30).toLowerCase();
    const limit = Math.max(1, Math.min(100, parseInt(query.get('limit'), 10) || 20));
    const offset = Math.max(0, parseInt(query.get('offset'), 10) || 0);
    let list = db.col('items');
    if (category) list = list.filter((it) => it.category === category);
    if (search) list = list.filter((it) => (it.title + ' ' + it.description).toLowerCase().includes(search));
    const sorted = list.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { items: sorted.slice(offset, offset + limit).map(publicItem), total: sorted.length, limit, offset };
  });

  route('GET', '/api/items/:id', ({ params }) => {
    const it = UUID.test(params.id) && db.col('items').find((x) => x.id === params.id);
    if (!it) throw new HttpError(404, 'not_found', 'Listing not found');
    return publicItem(it);
  });

  route('POST', '/api/items', ({ body, headers, ctx }) => {
    const user = currentUser(headers);
    const fields = itemFields(body, false);
    const stamp = new Date(now()).toISOString();
    const item = Object.assign({ id: crypto.randomUUID(), ownerId: user.id, createdAt: stamp, updatedAt: stamp }, fields);
    db.col('items').push(item);
    db.save();
    ctx.status = 201;
    return publicItem(item);
  });

  function ownItem(params, headers) {
    const user = currentUser(headers);
    const it = UUID.test(params.id) && db.col('items').find((x) => x.id === params.id);
    if (!it) throw new HttpError(404, 'not_found', 'Listing not found');
    if (it.ownerId !== user.id && user.role !== 'admin') throw new HttpError(403, 'forbidden', 'You can only change your own listings');
    return it;
  }

  route('PUT', '/api/items/:id', ({ params, body, headers }) => {
    const it = ownItem(params, headers);
    Object.assign(it, itemFields(body, true), { updatedAt: new Date(now()).toISOString() });
    db.save();
    return publicItem(it);
  });

  route('DELETE', '/api/items/:id', ({ params, headers }) => {
    const it = ownItem(params, headers);
    db.data.items = db.col('items').filter((x) => x.id !== it.id);
    db.save();
    return { deleted: true };
  });

  /* --- contact form --- */
  route('POST', '/api/contact', ({ body, ip, ctx }) => {
    if (!allowContact(ip)) throw new HttpError(429, 'rate_limited', 'Too many messages. Please wait a minute.');
    if (!body || typeof body !== 'object') throw bad('Send a JSON body');
    const name = oneLine(body.name, 60);
    const email = String(body.email || '').trim().toLowerCase();
    const message = cleanText(body.message, 2000);
    if (!name) throw bad('name is required');
    if (!isEmail(email)) throw bad('Enter a valid email address');
    if (message.length < 5) throw bad('message must be at least 5 characters');
    db.col('messages').push({ id: crypto.randomUUID(), name, email, message, at: new Date(now()).toISOString() });
    db.save();
    ctx.status = 201;
    return { sent: true };
  });

  route('GET', '/api/contact', ({ headers }) => {
    const user = currentUser(headers);
    if (user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Only the admin can read messages');
    return { messages: db.col('messages').slice().reverse() };
  });

  /* --- weather --- */
  route('GET', '/api/weather', ({ query }) => weather.forecast(query.get('lat'), query.get('lon')));

  /* ---------- plumbing ---------- */
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0, rejected = false; const chunks = [];
      req.on('data', (c) => {
        if (rejected) return;
        size += c.length;
        if (size > 20000) { rejected = true; reject(new HttpError(413, 'too_large', 'Request is too large')); req.resume(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (rejected) return;
        if (!chunks.length) return resolve(null);
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new HttpError(400, 'invalid_json', 'The request body is not valid JSON')); }
      });
      req.on('error', reject);
    });
  }

  function send(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }

  function serveStatic(res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch (e) { return send(res, 400, { error: { code: 'bad_path', message: 'Bad address' } }); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: { code: 'forbidden', message: 'Not allowed' } });
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, { error: { code: 'not_found', message: 'Not found' } });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  }

  return http.createServer(async (req, res) => {
    const started = Date.now();
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!quiet) res.on('finish', () => console.log(req.method, req.url, res.statusCode, (Date.now() - started) + 'ms'));

    try {
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;

      if (pathname.startsWith('/api/')) {
        let matched = false;
        for (const r of routes) {
          const m = r.re.exec(pathname);
          if (!m) continue;
          matched = true;
          if (r.method !== req.method) continue;
          const params = {};
          r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
          const ctx = { status: 200 };
          const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : null;
          const data = await r.fn({ params, query: url.searchParams, body, headers: req.headers, ip: req.socket.remoteAddress || 'unknown', ctx });
          return send(res, ctx.status, data);
        }
        throw matched ? new HttpError(405, 'method_not_allowed', 'This address does not accept ' + req.method)
                      : new HttpError(404, 'not_found', 'No such API address');
      }

      if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Only GET is allowed here');
      return serveStatic(res, url.pathname);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: { code: err.code, message: err.message } });
      console.error(err);
      return send(res, 500, { error: { code: 'server_error', message: 'Something went wrong on the server' } });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log('Backend running at http://localhost:' + port);
    console.log('Try: http://localhost:' + port + '/api/health');
  });
}

module.exports = { createApp };
