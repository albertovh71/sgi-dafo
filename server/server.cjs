// SGI · Contexto y planificación del SGI (Winoa Ibérica). API mínima sobre SQLite + front estático (public/).
// Un solo proceso, una dependencia (better-sqlite3). Sin autenticación propia: la delega en lo que haya delante
// (Cloudflare Access hoy, la app anfitriona —VISTA— después).
// Configuración por entorno: PORT (8096), HOST (127.0.0.1), DATA_DIR (./data), PUBLIC_DIR (./public).
// Portabilidad: todos los datos están en DATA_DIR/sgi.db (un fichero) y se pueden volcar/cargar con /api/export e /api/import.
//
// CICLOS ANUALES (opción "foto anual"): cada año es un ciclo completo (DAFO, partes, riesgos, oportunidades, objetivos,
// revisión). Un ciclo cerrado es de solo lectura; se reabre con POST /api/ciclos/AAAA/abrir (o `node server/ciclo.cjs reabrir AAAA`).
// Si más adelante se quiere restringir la reapertura, basta con quitar/proteger la ruta /abrir.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = +process.env.PORT || 8096;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
const MAX_JSON = 60 * 1024 * 1024; // incluye /api/import con imágenes de todos los ciclos
const MAX_IMG = 12 * 1024 * 1024;
const BK_DIR = process.env.BACKUP_DIR || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'copias-ciclos');
const BK_ID = /^ciclo-\d{4}-\d{8}-\d{6}(-[a-z0-9]{3})?$/;
const ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const YEAR = /^\d{4}$/;

fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'sgi.db');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// ---- esquema y migración (de la versión sin ciclos: todo lo existente pasa al ciclo 2025)
const tabla = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='items'").get();
if (tabla && !db.prepare('PRAGMA table_info(items)').all().some(c => c.name === 'ciclo')) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(DB_FILE, DB_FILE + '.pre-ciclos');
  db.exec(`
    BEGIN;
    CREATE TABLE items_new (ciclo TEXT NOT NULL, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
      n INTEGER PRIMARY KEY AUTOINCREMENT, UNIQUE(ciclo, col, id));
    INSERT INTO items_new (ciclo, col, id, data, updated_at, n) SELECT '2025', col, id, data, updated_at, n FROM items ORDER BY n;
    DROP TABLE items; ALTER TABLE items_new RENAME TO items;
    COMMIT;`);
  // objetivos y textos de revisión llevaban su año: pasan al ciclo de ese año
  for (const r of db.prepare("SELECT n, data FROM items WHERE col IN ('objetivos','rev_texto')").all()) {
    const a = JSON.parse(r.data).anio;
    if (YEAR.test(String(a))) db.prepare('UPDATE items SET ciclo = ? WHERE n = ?').run(String(a), r.n);
  }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    ciclo TEXT NOT NULL, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
    n INTEGER PRIMARY KEY AUTOINCREMENT, UNIQUE(ciclo, col, id)
  );
  CREATE TABLE IF NOT EXISTS imgs (
    id TEXT PRIMARY KEY, anio TEXT NOT NULL, key TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '',
    w INTEGER NOT NULL, h INTEGER NOT NULL, png BLOB NOT NULL, updated_at TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS ciclos (
    anio TEXT PRIMARY KEY, estado TEXT NOT NULL DEFAULT 'abierto', creado TEXT NOT NULL, cerrado TEXT
  );
`);
if (!db.prepare('SELECT 1 FROM ciclos LIMIT 1').get() && db.prepare('SELECT 1 FROM items LIMIT 1').get()) {
  db.prepare("INSERT INTO ciclos (anio, estado, creado) VALUES ('2025','abierto', ?)").run(new Date().toISOString());
}

// Colecciones permitidas dentro de un ciclo
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
const upsert = db.prepare(`INSERT INTO items (ciclo, col, id, data, updated_at) VALUES (?,?,?,?,?)
  ON CONFLICT(ciclo, col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
const del = db.prepare('DELETE FROM items WHERE ciclo = ? AND col = ? AND id = ?');
const getCiclo = db.prepare('SELECT anio, estado, creado, cerrado FROM ciclos WHERE anio = ?');
const listCiclos = () => db.prepare('SELECT anio, estado, creado, cerrado FROM ciclos ORDER BY anio').all();

function snapshotVacio() { const o = {}; for (const col of COLS) o[col] = []; o.imgs = []; return o; }
function snapshot(c) {
  const out = snapshotVacio();
  for (const r of db.prepare('SELECT col, id, data FROM items WHERE ciclo = ? ORDER BY n').all(c))
    if (out[r.col]) out[r.col].push({ ...JSON.parse(r.data), id: r.id });
  out.imgs = db.prepare('SELECT id, anio, key, nombre, w, h FROM imgs WHERE anio = ? ORDER BY n, rowid').all(c);
  return out;
}

// ---- actividad en la BBDD por ciclo (para decidir la frecuencia de las copias automáticas)
const actividad = {};
const tocar = c => { if (c) actividad[String(c)] = Date.now(); };
for (const r of db.prepare('SELECT ciclo, MAX(updated_at) AS u FROM items GROUP BY ciclo').all()) actividad[r.ciclo] = Date.parse(r.u) || 0;

// ---- copias de seguridad de un ciclo (ficheros en BACKUP_DIR, en el mismo servidor que la BD)
fs.mkdirSync(BK_DIR, { recursive: true });
const TZ = 'Europe/Madrid';
const horaLocal = iso => new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }); // "YYYY-MM-DD HH:MM:SS"
function nombreCopia(anio, iso) {
  const base = `${horaLocal(iso).slice(0, 16)} Ciclo ${anio}`;
  const usados = new Set(listarCopias(anio).map(m => m.nombre));
  let n = base, k = 2;
  while (usados.has(n)) n = `${base} (${k++})`;
  return n;
}
// tipo: 'manual' (botón), 'auto' (programada) o 'previa' (seguridad antes de restaurar)
function crearCopia(anio, nota, tipo) {
  const c = getCiclo.get(anio);
  const snap = snapshot(anio); delete snap.imgs;
  const imgs = db.prepare('SELECT id, anio, key, nombre, w, h, png FROM imgs WHERE anio = ? ORDER BY n, rowid').all(anio).map(r => ({ ...r, png: r.png.toString('base64') }));
  const creado = now();
  const ts = creado.replace(/[-:T]/g, '').slice(0, 14).replace(/^(\d{8})(\d{6})$/, '$1-$2');
  let id = `ciclo-${anio}-${ts}`;
  if (fs.existsSync(path.join(BK_DIR, id + '.json'))) id += '-' + crypto.randomBytes(2).toString('hex').slice(0, 3);
  const nombre = nombreCopia(anio, creado);
  const t = tipo === 'auto' || tipo === 'previa' ? tipo : 'manual';
  const doc = { tipo: 'sgi-ciclo', version: 1, anio, creado, nombre, nota: String(nota || '').slice(0, 200), tipoCopia: t, auto: t !== 'manual', estadoCiclo: c ? c.estado : null, items: snap, imgs };
  const fichero = path.join(BK_DIR, id + '.json');
  fs.writeFileSync(fichero + '.tmp', JSON.stringify(doc)); fs.renameSync(fichero + '.tmp', fichero);
  const resumen = {}; for (const col of COLS) resumen[col] = (snap[col] || []).length; resumen.imgs = imgs.length;
  const meta = { id, nombre, anio, creado, nota: doc.nota, tipoCopia: t, auto: t !== 'manual', estadoCiclo: doc.estadoCiclo, bytes: fs.statSync(fichero).size, resumen };
  fs.writeFileSync(path.join(BK_DIR, id + '.meta.json'), JSON.stringify(meta));
  return meta;
}
function listarCopias(anio) {
  const out = [];
  for (const f of fs.readdirSync(BK_DIR)) {
    if (!f.endsWith('.meta.json')) continue;
    try { const m = JSON.parse(fs.readFileSync(path.join(BK_DIR, f), 'utf8')); if (!anio || m.anio === anio) out.push(m); } catch { /* ignora ficheros dañados */ }
  }
  for (const m of out) { if (!m.nombre) m.nombre = `${horaLocal(m.creado).slice(0, 16)} Ciclo ${m.anio}`; if (!m.tipoCopia) m.tipoCopia = m.auto ? 'auto' : 'manual'; }
  return out.sort((a, b) => b.creado.localeCompare(a.creado));
}
function leerCopia(id) {
  if (!BK_ID.test(id)) throw fail(400, 'copia no válida');
  const f = path.join(BK_DIR, id + '.json');
  if (!fs.existsSync(f)) throw fail(404, 'la copia no existe');
  let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { throw fail(400, 'la copia está dañada'); }
  if (d.tipo !== 'sgi-ciclo' || !YEAR.test(String(d.anio)) || !d.items) throw fail(400, 'formato de copia no reconocido');
  for (const col of COLS) for (const it of d.items[col] || []) {
    if (!it || !ID.test(String(it.id || ''))) throw fail(400, `copia con elementos no válidos (${col})`);
    const e = check(col, it); if (e) throw fail(400, `copia con datos no válidos: ${col}/${it.id}: ${e}`);
  }
  return d;
}
function restaurarCopia(id, anio) {
  const d = leerCopia(id);
  if (d.anio !== anio) throw fail(409, `La copia es del ciclo ${d.anio}, no del ${anio}`);
  cicloAbierto(anio);
  const previa = crearCopia(anio, `Estado anterior a restaurar «${d.nombre || id}»`, 'previa'); // red de seguridad
  tocar(anio);
  db.transaction(() => {
    db.prepare('DELETE FROM items WHERE ciclo = ?').run(anio);
    db.prepare('DELETE FROM imgs WHERE anio = ?').run(anio);
    for (const col of COLS) for (const it of d.items[col] || []) { const { id: iid, ...rest } = it; upsert.run(anio, col, String(iid), JSON.stringify(rest), now()); }
    let n = db.prepare('SELECT COALESCE(MAX(n),0) AS n FROM imgs').get().n;
    for (const im of d.imgs || []) db.prepare('INSERT OR REPLACE INTO imgs (id, anio, key, nombre, w, h, png, updated_at, n) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(String(im.id), anio, String(im.key), String(im.nombre || ''), +im.w, +im.h, Buffer.from(im.png, 'base64'), now(), ++n);
  })();
  return { restaurada: id, copiaPrevia: previa.id };
}

// ---- crear el ciclo siguiente a partir de uno cerrado
function crearCiclo(desde, anio) {
  const ini = new Date().toISOString();
  db.transaction(() => {
    db.prepare("INSERT INTO ciclos (anio, estado, creado) VALUES (?, 'abierto', ?)").run(anio, ini);
    const src = db.prepare('SELECT col, id, data FROM items WHERE ciclo = ? ORDER BY n').all(desde);
    const objetivosPrevios = db.prepare("SELECT 1 FROM items WHERE ciclo = ? AND col = 'objetivos' LIMIT 1").get(anio);
    for (const r of src) {
      const d = JSON.parse(r.data);
      if (r.col === 'meta') { d.fecha = ''; delete d.revAnio; }
      else if (r.col === 'rev_texto') continue; // la revisión es un documento nuevo
      else if (r.col === 'risks' || r.col === 'opps') {
        // se vuelve a valorar cada año; la valoración anterior queda como referencia (prev)
        if (r.col === 'risks') { d.prev = { P: d.P ?? null, G: d.G ?? null, R: d.R ?? null }; d.P = d.G = d.R = null; d.Pr = d.Gr = d.Rr = null; }
        else { d.prev = { V: d.V ?? null, R: d.R ?? null, VR: d.VR ?? null }; d.V = d.R = null; d.VR = 0; }
        d.just = '';
        // las acciones cerradas se quedan en el histórico del ciclo anterior; las abiertas continúan
        d.acciones = (d.acciones || []).filter(a => a.estado !== 'Cerrada').map(a => ({ ...a }));
        d.estado = d.acciones.some(a => a.estado) ? 'En curso' : '';
      } else if (r.col === 'objetivos') {
        if (objetivosPrevios) continue; // ya había objetivos preparados para ese año: se respetan
        const t = (d.t || []).filter(Boolean);
        upsert.run(anio, 'objetivos', 'B' + anio + '-' + r.id.replace(/^B\d{4}-/, ''), JSON.stringify({
          anio, origen: d.origen || '', objetivo: '', acciones: '', indicador: d.indicador || '', resp: d.resp || '',
          ref: t.length ? t[t.length - 1] : (d.ref || ''), plazo: anio + '-12-31', t: ['', '', '', ''], res: ['', '', '', ''], seg: '',
        }), ini);
        continue;
      }
      upsert.run(anio, r.col, r.id, JSON.stringify(d), ini);
    }
  })();
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
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const parseJson = buf => { try { return JSON.parse(buf.toString('utf8')); } catch { throw fail(400, 'JSON no válido'); } };

// Ciclo sobre el que se escribe: debe existir y estar abierto
function cicloAbierto(c) {
  if (!YEAR.test(c || '')) throw fail(400, 'ciclo no indicado');
  const r = getCiclo.get(c);
  if (!r) throw fail(404, `el ciclo ${c} no existe`);
  if (r.estado !== 'abierto') throw fail(409, `El ciclo ${c} está cerrado: solo lectura`);
  return r;
}

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

// Formato de importación: nuevo (ciclos + items por ciclo) o antiguo plano (todo en un ciclo)
function normalizarImport(d) {
  if (d.ciclos && d.items) return d;
  const base = String((d.meta && d.meta[0] && d.meta[0].fecha) || '').slice(0, 4);
  const anio0 = YEAR.test(base) ? base : '2025';
  const items = {};
  for (const col of COLS) for (const it of d[col] || []) {
    const c = (col === 'objetivos' || col === 'rev_texto') && YEAR.test(String(it.anio)) ? String(it.anio) : anio0;
    (items[c] = items[c] || {})[col] = ((items[c] || {})[col] || []).concat(it);
  }
  return { ciclos: [{ anio: anio0, estado: 'abierto', creado: now(), cerrado: null }], items, imgs: d.imgs || [] };
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
    const c = url.searchParams.get('c');

    if (m === 'GET' && seg[0] === 'health') return send(res, 200, { ok: true });

    // ---- ciclos
    if (seg[0] === 'ciclos') {
      if (m === 'GET' && seg.length === 1) return send(res, 200, listCiclos());
      if (m === 'POST' && seg.length === 1) { // crear el siguiente ciclo desde uno cerrado
        const b = parseJson(await readBody(req));
        const desde = String(b.desde || ''), anio = String(b.anio || '');
        if (!YEAR.test(desde) || !YEAR.test(anio)) return send(res, 400, { error: 'años no válidos' });
        const o = getCiclo.get(desde);
        if (!o) return send(res, 404, { error: `el ciclo ${desde} no existe` });
        if (o.estado !== 'cerrado') return send(res, 409, { error: `El ciclo ${desde} debe cerrarse antes de crear el siguiente` });
        if (getCiclo.get(anio)) return send(res, 409, { error: `El ciclo ${anio} ya existe` });
        if (+anio <= +desde) return send(res, 400, { error: 'el nuevo ciclo debe ser posterior' });
        crearCiclo(desde, anio); tocar(anio);
        return send(res, 201, getCiclo.get(anio));
      }
      if (m === 'POST' && seg.length === 3 && seg[2] === 'cerrar' && YEAR.test(seg[1])) {
        const o = getCiclo.get(seg[1]);
        if (!o) return send(res, 404, { error: 'el ciclo no existe' });
        if (o.estado !== 'cerrado') db.prepare("UPDATE ciclos SET estado = 'cerrado', cerrado = ? WHERE anio = ?").run(now(), seg[1]);
        return send(res, 200, getCiclo.get(seg[1]));
      }
      if (m === 'POST' && seg.length === 3 && seg[2] === 'abrir' && YEAR.test(seg[1])) {
        const o = getCiclo.get(seg[1]);
        if (!o) return send(res, 404, { error: 'el ciclo no existe' });
        if (o.estado !== 'abierto') db.prepare("UPDATE ciclos SET estado = 'abierto', cerrado = NULL WHERE anio = ?").run(seg[1]);
        return send(res, 200, getCiclo.get(seg[1]));
      }
      return send(res, 404, { error: 'no encontrado' });
    }

    // ---- copias de seguridad del ciclo
    if (seg[0] === 'backups') {
      if (m === 'GET' && seg.length === 1) { if (!YEAR.test(c || '')) return send(res, 400, { error: 'ciclo no indicado' }); return send(res, 200, listarCopias(c)); }
      if (m === 'POST' && seg.length === 1) {
        if (!YEAR.test(c || '') || !getCiclo.get(c)) return send(res, 404, { error: 'el ciclo no existe' });
        let nota = ''; try { nota = (parseJson(await readBody(req)) || {}).nota || ''; } catch { /* sin cuerpo */ }
        return send(res, 201, crearCopia(c, nota, 'manual'));
      }
      if (m === 'POST' && seg.length === 3 && seg[2] === 'restaurar') {
        if (!YEAR.test(c || '')) return send(res, 400, { error: 'ciclo no indicado' });
        return send(res, 200, restaurarCopia(seg[1], c));
      }
      if (m === 'DELETE' && seg.length === 2) {
        if (!BK_ID.test(seg[1])) return send(res, 400, { error: 'copia no válida' });
        for (const ext of ['.json', '.meta.json']) { const f = path.join(BK_DIR, seg[1] + ext); if (fs.existsSync(f)) fs.unlinkSync(f); }
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'no encontrado' });
    }

    if (m === 'GET' && seg[0] === 'data') {
      const cs = listCiclos();
      const elegido = YEAR.test(c || '') ? c : ((cs.filter(x => x.estado === 'abierto').pop() || cs[cs.length - 1] || {}).anio);
      if (!elegido || !getCiclo.get(elegido)) return send(res, 200, { ciclos: cs, ciclo: null, ...snapshotVacio() });
      return send(res, 200, { ciclos: cs, ciclo: getCiclo.get(elegido), ...snapshot(elegido) });
    }

    // ---- imágenes de la Revisión por la Dirección (pertenecen a un ciclo = año)
    if (seg[0] === 'img') {
      if (m === 'POST' && seg.length === 1) {
        const anio = url.searchParams.get('anio') || '', key = url.searchParams.get('key') || '';
        const w = +url.searchParams.get('w'), h = +url.searchParams.get('h');
        if (!YEAR.test(anio) || !ID.test(key) || !(w > 0) || !(h > 0)) return send(res, 400, { error: 'parámetros no válidos' });
        cicloAbierto(anio);
        const png = await readBody(req, MAX_IMG);
        if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) return send(res, 400, { error: 'se espera un PNG' });
        const id = crypto.randomBytes(8).toString('hex');
        const nombre = (url.searchParams.get('nombre') || '').slice(0, 200);
        const n = (db.prepare('SELECT COALESCE(MAX(n),0)+1 AS n FROM imgs').get().n);
        db.prepare('INSERT INTO imgs (id, anio, key, nombre, w, h, png, updated_at, n) VALUES (?,?,?,?,?,?,?,?,?)').run(id, anio, key, nombre, w, h, png, now(), n); tocar(anio);
        return send(res, 201, { id, anio, key, nombre, w, h });
      }
      if (seg.length === 2 && ID.test(seg[1])) {
        if (m === 'GET') {
          const r = db.prepare('SELECT png FROM imgs WHERE id = ?').get(seg[1]);
          return r ? send(res, 200, r.png, 'image/png', { 'Cache-Control': 'private, max-age=86400' }) : send(res, 404, { error: 'no existe' });
        }
        if (m === 'DELETE') {
          const r = db.prepare('SELECT anio FROM imgs WHERE id = ?').get(seg[1]);
          if (r) cicloAbierto(r.anio);
          db.prepare('DELETE FROM imgs WHERE id = ?').run(seg[1]); if (r) tocar(r.anio);
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: 'no encontrado' });
    }

    // ---- copia completa (portable, todos los ciclos) y restauración
    if (m === 'GET' && seg[0] === 'export') {
      const ciclos = listCiclos();
      const items = {};
      const anios = new Set([...ciclos.map(x => x.anio), ...db.prepare('SELECT DISTINCT ciclo FROM items').all().map(x => x.ciclo)]);
      for (const a of anios) { const s = snapshot(a); delete s.imgs; items[a] = s; }
      const imgs = db.prepare('SELECT id, anio, key, nombre, w, h, png FROM imgs ORDER BY n, rowid').all().map(r => ({ ...r, png: r.png.toString('base64') }));
      return send(res, 200, { ciclos, items, imgs, exportado: now() }, 'application/json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="sgi-dafo-export.json"' });
    }
    if (m === 'POST' && seg[0] === 'import') {
      const d = normalizarImport(parseJson(await readBody(req)));
      for (const [a, cols] of Object.entries(d.items)) {
        if (!YEAR.test(a)) return send(res, 400, { error: `ciclo no válido: ${a}` });
        for (const col of COLS) for (const it of cols[col] || []) {
          if (!it || !ID.test(String(it.id || ''))) return send(res, 400, { error: `id no válido en ${a}/${col}` });
          const e = check(col, it); if (e) return send(res, 400, { error: `${a}/${col}/${it.id}: ${e}` });
        }
      }
      db.transaction(() => {
        db.exec('DELETE FROM items; DELETE FROM imgs; DELETE FROM ciclos;');
        for (const x of d.ciclos) db.prepare('INSERT INTO ciclos (anio, estado, creado, cerrado) VALUES (?,?,?,?)').run(String(x.anio), x.estado === 'cerrado' ? 'cerrado' : 'abierto', x.creado || now(), x.cerrado || null);
        for (const [a, cols] of Object.entries(d.items))
          for (const col of COLS) for (const it of cols[col] || []) { const { id, ...rest } = it; upsert.run(a, col, String(id), JSON.stringify(rest), now()); }
        let n = 0;
        for (const im of d.imgs || []) db.prepare('INSERT INTO imgs (id, anio, key, nombre, w, h, png, updated_at, n) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(String(im.id), String(im.anio), String(im.key), String(im.nombre || ''), +im.w, +im.h, Buffer.from(im.png, 'base64'), now(), ++n);
      })();
      for (const x of d.ciclos) tocar(x.anio);
      return send(res, 200, { ok: true });
    }

    // ---- CRUD genérico dentro de un ciclo: PUT /api/:col/:id?c=AAAA (idempotente) y DELETE
    if (seg.length === 2 && COLS.has(seg[0]) && ID.test(seg[1])) {
      const [col, id] = seg;
      if (m === 'PUT') {
        const d = parseJson(await readBody(req));
        const e = check(col, d); if (e) return send(res, 400, { error: e });
        cicloAbierto(c);
        const { id: _drop, ...rest } = d;
        upsert.run(c, col, id, JSON.stringify(rest), now()); tocar(c);
        return send(res, 200, { ...rest, id });
      }
      if (m === 'DELETE') { cicloAbierto(c); del.run(c, col, id); tocar(c); return send(res, 200, { ok: true }); }
    }
    send(res, 404, { error: 'no encontrado' });
  } catch (e) {
    send(res, [400, 404, 409, 413].includes(e.code) ? e.code : 500, { error: e.message });
  }
});

// ---- copias automáticas del ciclo activo (abierto):
//  · cada 1 h si ha habido actividad en la BBDD desde la última copia
//  · cada 24 h si no ha habido actividad
const H1 = +process.env.SGI_BACKUP_CON_ACTIVIDAD_MS || 3600e3, H24 = +process.env.SGI_BACKUP_SIN_ACTIVIDAD_MS || 24 * 3600e3; // sobreescribibles solo para pruebas
function rotarCopias(anio) {
  const ahora = Date.now(), vistos = new Set();
  for (const m of listarCopias(anio)) { // de la más nueva a la más antigua
    if (m.tipoCopia === 'manual') continue; // las manuales nunca se borran solas
    const edad = ahora - Date.parse(m.creado);
    let borrar = false;
    if (edad > 30 * 24 * 3600e3) borrar = true;           // más de 30 días
    else if (edad > 48 * 3600e3) {                           // entre 48 h y 30 días: una por día
      const dia = horaLocal(m.creado).slice(0, 10);
      if (vistos.has(dia)) borrar = true; else vistos.add(dia);
    }
    if (borrar) for (const ext of ['.json', '.meta.json']) { try { fs.unlinkSync(path.join(BK_DIR, m.id + ext)); } catch { /* ya no está */ } }
  }
}
function copiasAutomaticas() {
  for (const c of listCiclos().filter(x => x.estado === 'abierto')) {
    try {
      const l = listarCopias(c.anio);
      const ultima = l.length ? Date.parse(l[0].creado) : 0;
      const hayActividad = (actividad[c.anio] || 0) > ultima;
      const espera = Date.now() - ultima;
      if ((hayActividad && espera >= H1) || espera >= H24) {
        const m = crearCopia(c.anio, hayActividad ? 'Automática (con actividad)' : 'Automática (diaria)', 'auto');
        console.log(`Copia automática: ${m.nombre}`);
        rotarCopias(c.anio);
      }
    } catch (e) { console.error('Error en la copia automática:', e.message); }
  }
}
const TICK = +process.env.SGI_BACKUP_TICK_MS || 60e3;
setTimeout(copiasAutomaticas, Math.min(15e3, TICK));
setInterval(copiasAutomaticas, TICK).unref();

server.listen(PORT, HOST, () => console.log(`SGI escuchando en http://${HOST}:${PORT} · datos en ${DATA_DIR}`));
process.on('SIGTERM', () => { server.close(); db.close(); process.exit(0); });
