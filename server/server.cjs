// SGI · Contexto y planificación del SGI (Winoa Ibérica). API mínima sobre SQLite + front estático (public/).
// Un solo proceso, una dependencia (better-sqlite3). Sin autenticación propia: la delega en lo que haya delante
// (Cloudflare Access hoy, la app anfitriona —VISTA— después).
// Configuración por entorno: PORT (8096), HOST (127.0.0.1), DATA_DIR (./data), PUBLIC_DIR (./public).
// Portabilidad: todos los datos están en DATA_DIR/sgi.db (un fichero) y se pueden volcar/cargar con /api/export e /api/import.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = +process.env.PORT || 8096;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
const MAX_JSON = 25 * 1024 * 1024; // incluye /api/import con imágenes
const MAX_IMG = 12 * 1024 * 1024;
const ID = /^[A-Za-z0-9_.:-]{1,64}$/;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'sgi.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
    n INTEGER PRIMARY KEY AUTOINCREMENT, UNIQUE(col, id)
  );
  CREATE TABLE IF NOT EXISTS imgs (
    id TEXT PRIMARY KEY, anio TEXT NOT NULL, key TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '',
    w INTEGER NOT NULL, h INTEGER NOT NULL, png BLOB NOT NULL, updated_at TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0
  );
`);

// Colecciones permitidas: meta (ficha del análisis), factors (DAFO), parties, risks, opps, objetivos y rev_texto (textos de la revisión).
const COLS = new Set(['meta', 'factors', 'parties', 'risks', 'opps', 'objetivos', 'rev_texto']);
const ESTADOS = ['', 'En curso', 'Cerrada'];
const TIPO_FACTOR = ['D', 'A', 'F', 'O'];
const esc13 = v => v === null || v === undefined || v === '' || [1, 2, 3].includes(+v);

function check(col, d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return 'cuerpo no válido';
  if (col === 'risks' || col === 'opps') {
    if (d.estado !== undefined && !ESTADOS.includes(d.estado)) return 'estado no válido';
    for (const k of col === 'risks' ? ['P', 'G', 'Pr', 'Gr'] : ['V', 'R']) if (!esc13(d[k])) return `${k} debe ser 1, 2 o 3`;
  }
  if ((col === 'risks' || col === 'opps') && d.acciones !== undefined) {
    if (!Array.isArray(d.acciones) || d.acciones.length > 50) return 'acciones no válidas';
    for (const a of d.acciones) if (typeof a !== 'object' || a === null || !ESTADOS.includes(a.estado || '')) return 'estado de acción no válido';
  }
  if (col === 'factors' && !TIPO_FACTOR.includes(d.tipo)) return 'tipo de factor no válido';
  if (col === 'parties' && !['externa', 'interna'].includes(d.tipo)) return 'tipo de parte no válido';
  return null;
}

const now = () => new Date().toISOString();
const upsert = db.prepare(`INSERT INTO items (col, id, data, updated_at) VALUES (?,?,?,?)
  ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
const del = db.prepare('DELETE FROM items WHERE col = ? AND id = ?');
const listAll = db.prepare('SELECT col, id, data FROM items ORDER BY n');

function snapshot() {
  const out = {};
  for (const c of COLS) out[c] = [];
  for (const r of listAll.all()) if (out[r.col]) out[r.col].push({ ...JSON.parse(r.data), id: r.id });
  out.imgs = db.prepare('SELECT id, anio, key, nombre, w, h FROM imgs ORDER BY n, rowid').all();
  return out;
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, max = MAX_JSON) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { reject(Object.assign(new Error('cuerpo demasiado grande'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const parseJson = buf => { try { return JSON.parse(buf.toString('utf8')); } catch { throw Object.assign(new Error('JSON no válido'), { code: 400 }); } };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/favicon.ico') rel = '/winoa-logo.png';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(path.normalize(PUBLIC_DIR + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'no encontrado' });
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (!p.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'método no permitido' });
      return serveStatic(req, res, p);
    }
    const seg = p.split('/').filter(Boolean).slice(1); // tras "api"
    const m = req.method;

    if (m === 'GET' && seg[0] === 'health') return send(res, 200, { ok: true });
    if (m === 'GET' && seg[0] === 'data') return send(res, 200, snapshot());

    // Imágenes de la Revisión por la Dirección
    if (seg[0] === 'img') {
      if (m === 'POST' && seg.length === 1) {
        const anio = url.searchParams.get('anio') || '', key = url.searchParams.get('key') || '';
        const w = +url.searchParams.get('w'), h = +url.searchParams.get('h');
        if (!/^\d{4}$/.test(anio) || !ID.test(key) || !(w > 0) || !(h > 0)) return send(res, 400, { error: 'parámetros no válidos' });
        const png = await readBody(req, MAX_IMG);
        if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) return send(res, 400, { error: 'se espera un PNG' });
        const id = crypto.randomBytes(8).toString('hex');
        const nombre = (url.searchParams.get('nombre') || '').slice(0, 200);
        const n = (db.prepare('SELECT COALESCE(MAX(n),0)+1 AS n FROM imgs').get().n);
        db.prepare('INSERT INTO imgs (id, anio, key, nombre, w, h, png, updated_at, n) VALUES (?,?,?,?,?,?,?,?,?)').run(id, anio, key, nombre, w, h, png, now(), n);
        return send(res, 201, { id, anio, key, nombre, w, h });
      }
      if (seg.length === 2 && ID.test(seg[1])) {
        if (m === 'GET') {
          const r = db.prepare('SELECT png FROM imgs WHERE id = ?').get(seg[1]);
          return r ? send(res, 200, r.png, 'image/png', { 'Cache-Control': 'private, max-age=86400' }) : send(res, 404, { error: 'no existe' });
        }
        if (m === 'DELETE') { db.prepare('DELETE FROM imgs WHERE id = ?').run(seg[1]); return send(res, 200, { ok: true }); }
      }
      return send(res, 404, { error: 'no encontrado' });
    }

    // Copia completa (portable) y restauración
    if (m === 'GET' && seg[0] === 'export') {
      const snap = snapshot();
      snap.imgs = db.prepare('SELECT id, anio, key, nombre, w, h, png FROM imgs ORDER BY n, rowid').all().map(r => ({ ...r, png: r.png.toString('base64') }));
      snap.exportado = now();
      return send(res, 200, snap, 'application/json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="sgi-dafo-export.json"' });
    }
    if (m === 'POST' && seg[0] === 'import') {
      const d = parseJson(await readBody(req));
      for (const c of COLS) for (const it of d[c] || []) {
        if (!it || !ID.test(String(it.id || ''))) return send(res, 400, { error: `id no válido en ${c}` });
        const e = check(c, it); if (e) return send(res, 400, { error: `${c}/${it.id}: ${e}` });
      }
      db.transaction(() => {
        db.exec('DELETE FROM items; DELETE FROM imgs;');
        for (const c of COLS) for (const it of d[c] || []) { const { id, ...rest } = it; upsert.run(c, String(id), JSON.stringify(rest), now()); }
        let n = 0;
        for (const im of d.imgs || []) db.prepare('INSERT INTO imgs (id, anio, key, nombre, w, h, png, updated_at, n) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(String(im.id), String(im.anio), String(im.key), String(im.nombre || ''), +im.w, +im.h, Buffer.from(im.png, 'base64'), now(), ++n);
      })();
      return send(res, 200, { ok: true });
    }

    // CRUD genérico: PUT /api/:col/:id (idempotente) y DELETE /api/:col/:id
    if (seg.length === 2 && COLS.has(seg[0]) && ID.test(seg[1])) {
      const [col, id] = seg;
      if (m === 'PUT') {
        const d = parseJson(await readBody(req));
        const e = check(col, d); if (e) return send(res, 400, { error: e });
        const { id: _drop, ...rest } = d;
        upsert.run(col, id, JSON.stringify(rest), now());
        return send(res, 200, { ...rest, id });
      }
      if (m === 'DELETE') { del.run(col, id); return send(res, 200, { ok: true }); }
    }
    send(res, 404, { error: 'no encontrado' });
  } catch (e) {
    send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => console.log(`SGI escuchando en http://${HOST}:${PORT} · datos en ${DATA_DIR}`));
process.on('SIGTERM', () => { server.close(); db.close(); process.exit(0); });
