// Administración de ciclos (solo desde el servidor). La app web NO puede reabrir un ciclo cerrado: se hace aquí.
//   node server/ciclo.cjs listar
//   node server/ciclo.cjs reabrir 2025
//   node server/ciclo.cjs cerrar 2025
// Usa el mismo DATA_DIR que el servidor (por defecto ./data).
const path = require('path');
const Database = require('better-sqlite3');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const db = new Database(path.join(DATA_DIR, 'sgi.db'));
const [cmd, anio] = process.argv.slice(2);
if (cmd === 'listar' || !cmd) {
  console.table(db.prepare('SELECT anio, estado, creado, cerrado FROM ciclos ORDER BY anio').all());
} else if ((cmd === 'reabrir' || cmd === 'cerrar') && /^\d{4}$/.test(anio || '')) {
  const r = db.prepare('SELECT estado FROM ciclos WHERE anio = ?').get(anio);
  if (!r) { console.error(`El ciclo ${anio} no existe`); process.exit(1); }
  if (cmd === 'reabrir') db.prepare("UPDATE ciclos SET estado = 'abierto', cerrado = NULL WHERE anio = ?").run(anio);
  else db.prepare("UPDATE ciclos SET estado = 'cerrado', cerrado = ? WHERE anio = ?").run(new Date().toISOString(), anio);
  console.log(`Ciclo ${anio}: ${cmd === 'reabrir' ? 'reabierto' : 'cerrado'}`);
} else {
  console.error('Uso: node server/ciclo.cjs listar | reabrir AAAA | cerrar AAAA');
  process.exit(1);
}
