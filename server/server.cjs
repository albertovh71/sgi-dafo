// SGI · DAFO y riesgos (ISO 9001 / 14001 / 45001 / 50001). API mínima sobre SQLite.
// Un solo proceso: sirve la API (/api/*) y el front compilado (dist/). Sin dependencias externas salvo better-sqlite3.
// Configuración por entorno: PORT, HOST, DATA_DIR, DIST_DIR. No hay autenticación propia: se delega en lo que
// haya delante (Cloudflare Access hoy, la app anfitriona después).
const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = +process.env.PORT || 8096;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, '..', 'dist');
const MAX_JSON = 5 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'sgi.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS revisions (
    id TEXT PRIMARY KEY, titulo TEXT NOT NULL, fecha TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'borrador', notas TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS factors (
    id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, texto TEXT NOT NULL, categoria TEXT NOT NULL DEFAULT '',
    normas TEXT NOT NULL DEFAULT '[]', impacto INTEGER NOT NULL DEFAULT 3, orden INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'externa',
    necesidades TEXT NOT NULL DEFAULT '', requisito INTEGER NOT NULL DEFAULT 0,
    normas TEXT NOT NULL DEFAULT '[]', seguimiento TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS risks (
    id TEXT PRIMARY KEY, tipo TEXT NOT NULL DEFAULT 'riesgo', factor_id TEXT REFERENCES factors(id) ON DELETE SET NULL,
    descripcion TEXT NOT NULL, normas TEXT NOT NULL DEFAULT '[]',
    probabilidad INTEGER NOT NULL DEFAULT 3, impacto INTEGER NOT NULL DEFAULT 3,
    accion TEXT NOT NULL DEFAULT '', responsable TEXT NOT NULL DEFAULT '', limite TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'identificado', eficacia TEXT NOT NULL DEFAULT ''
  );
`);

// Definición de colecciones: columnas editables (en orden) y cuáles viajan como JSON.
const COLS = {
  revisions: { cols: ['titulo', 'fecha', 'estado', 'notas'], json: [], order: 'fecha DESC, rowid DESC' },
  factors: { cols: ['revision_id', 'tipo', 'texto', 'categoria', 'normas', 'impacto', 'orden'], json: ['normas'], order: 'orden, rowid' },
  parties: { cols: ['nombre', 'tipo', 'necesidades', 'requisito', 'normas', 'seguimiento'], json: ['normas'], order: 'nombre' },
  risks: {
    cols: ['tipo', 'factor_id', 'descripcion', 'normas', 'probabilidad', 'impacto', 'accion', 'responsable', 'limite', 'estado', 'eficacia'],
    json: ['normas'],
    order: 'rowid',
  },
};
const TIPOS = {
  factors: { tipo: ['D', 'A', 'F', 'O'] },
  parties: { tipo: ['interna', 'externa'] },
  revisions: { estado: ['borrador', 'vigente', 'archivada'] },
  risks: { tipo: ['riesgo', 'oportunidad'], estado: ['identificado', 'en curso', 'cerrado'] },
};
const NORMAS = ['9001', '14001', '45001', '50001'];

const stmts = {};
for (const [nombre, def] of Object.entries(COLS)) {
  const names = def.cols;
  stmts[nombre] = {
    all: db.prepare(`SELECT id, ${names.join(', ')} FROM ${nombre} ORDER BY ${def.order}`),
    upsert: db.prepare(
      `INSERT INTO ${nombre} (id, ${names.join(', ')}) VALUES (@id, ${names.map((c) => '@' + c).join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${names.map((c) => `${c} = @${c}`).join(', ')}`,
    ),
    del: db.prepare(`DELETE FROM ${nombre} WHERE id = ?`),
  };
}

const malo = (msg, code = 400) => Object.assign(new Error(msg), { code });

function fila(nombre, row) {
  const out = { ...row };
  for (const c of COLS[nombre].json) out[c] = JSON.parse(row[c] || '[]');
  return out;
}

function limpiar(nombre, id, body) {
  const def = COLS[nombre];
  const out = { id };
  for (const c of def.cols) {
    let v = body[c];
    if (def.json.includes(c)) {
      if (!Array.isArray(v)) v = [];
      if (v.some((n) => !NORMAS.includes(n))) throw malo(`Norma no válida en ${c}`);
      v = JSON.stringify(v);
    } else if (['impacto', 'probabilidad', 'orden', 'requisito'].includes(c)) {
      v = Math.round(Number(v ?? (c === 'orden' || c === 'requisito' ? 0 : 3)));
      if (!Number.isFinite(v)) throw malo(`${c} no es un número`);
      if (c === 'requisito') v = v ? 1 : 0;
      if (c === 'impacto' || c === 'probabilidad') v = Math.min(5, Math.max(1, v));
    } else {
      v = v == null ? '' : String(v);
      if (v.length > 5000) throw malo(`${c} demasiado largo`);
    }
    out[c] = v;
  }
  for (const [c, ok] of Object.entries(TIPOS[nombre] || {})) {
    if (out[c] === '') out[c] = ok[0]; // sin valor → el primero (riesgo, identificado, borrador…)
    if (!ok.includes(out[c])) throw malo(`${c} no válido`);
  }
  for (const req of ['titulo', 'texto', 'nombre', 'descripcion']) if (req in out && !out[req].trim()) throw malo(`${req} obligatorio`);
  if (nombre === 'risks' && out.factor_id === '') out.factor_id = null;
  return out;
}

function todo() {
  const out = {};
  for (const nombre of Object.keys(COLS)) out[nombre] = stmts[nombre].all.all().map((r) => fila(nombre, r));
  return out;
}

async function leerJson(req) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > MAX_JSON) throw malo('Cuerpo demasiado grande', 413);
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw malo('JSON no válido');
  }
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};

// Copia una revisión de DAFO con todos sus factores (para la revisión anual).
const duplicar = db.transaction((origen, nuevoId, titulo, fecha, nuevosIds) => {
  const rev = db.prepare('SELECT * FROM revisions WHERE id = ?').get(origen);
  if (!rev) throw malo('Revisión no encontrada', 404);
  stmts.revisions.upsert.run({ id: nuevoId, titulo, fecha, estado: 'borrador', notas: '' });
  const fs_ = db.prepare('SELECT * FROM factors WHERE revision_id = ? ORDER BY orden, rowid').all(origen);
  fs_.forEach((f, i) => {
    const nid = nuevosIds[i];
    if (!ID.test(nid || '')) throw malo('ids de factores no válidos');
    stmts.factors.upsert.run({ ...f, id: nid, revision_id: nuevoId });
  });
  return fs_.length;
});

const importar = db.transaction((data) => {
  for (const t of ['risks', 'factors', 'parties', 'revisions']) db.prepare(`DELETE FROM ${t}`).run();
  for (const nombre of ['revisions', 'factors', 'parties', 'risks']) {
    for (const r of data[nombre] || []) {
      if (!ID.test(r.id || '')) throw malo(`id no válido en ${nombre}`);
      stmts[nombre].upsert.run(limpiar(nombre, r.id, r));
    }
  }
});

async function api(req, res, url) {
  const [, , recurso, id, accion] = url.pathname.split('/');
  const m = req.method;

  if (recurso === 'data' && m === 'GET') return json(res, 200, todo());
  if (recurso === 'export' && m === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="sgi-dafo-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    return res.end(JSON.stringify({ version: 1, ...todo() }, null, 2));
  }
  if (recurso === 'import' && m === 'POST') {
    importar(await leerJson(req));
    return json(res, 200, { ok: true });
  }
  if (recurso === 'revisions' && ID.test(id || '') && accion === 'duplicate' && m === 'POST') {
    const b = await leerJson(req);
    if (!ID.test(b.id || '') || !String(b.titulo || '').trim()) throw malo('Faltan id o título');
    const n = duplicar(id, b.id, String(b.titulo), String(b.fecha || ''), Array.isArray(b.factorIds) ? b.factorIds : []);
    return json(res, 200, { ok: true, factores: n });
  }
  if (COLS[recurso] && ID.test(id || '') && !accion) {
    if (m === 'PUT') {
      const fila_ = limpiar(recurso, id, await leerJson(req));
      try {
        stmts[recurso].upsert.run(fila_);
      } catch (e) {
        if (String(e.message).includes('FOREIGN KEY')) throw malo('Referencia a un elemento que no existe');
        throw e;
      }
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      stmts[recurso].del.run(id);
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: 'Ruta no encontrada' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
function estatico(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  let file = path.join(DIST_DIR, path.normalize(rel));
  if (!file.startsWith(DIST_DIR)) return json(res, 403, { error: 'Prohibido' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(file)) return json(res, 404, { error: 'Front sin compilar: ejecuta npm run build' });
  const ext = path.extname(file);
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método no permitido' });
      return estatico(req, res, url);
    } catch (e) {
      if (!res.headersSent) json(res, e.code === 400 || e.code === 404 || e.code === 413 ? e.code : 500, { error: e.message });
      if (!e.code) console.error(e);
    }
  })
  .listen(PORT, HOST, () => console.log(`SGI DAFO en http://${HOST}:${PORT}`));
