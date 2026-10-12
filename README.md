# SGI · Contexto y planificación del SGI (Winoa Ibérica)

Gestión del análisis de contexto del Sistema de Gestión Integrado (ISO 9001 / 14001 / 45001 / 50001):
datos generales, partes interesadas, factores externos e internos, DAFO, riesgos y oportunidades,
procesos, objetivos anuales y Revisión por la Dirección (con generación del Word en formato Winoa).

Producción: <https://sgi.albertovh71.com> (Cloudflare Tunnel + Cloudflare Access, servicio `sgi-dafo`, puerto 8096).

## Diseño pensado para migrar a VISTA
- **Un proceso Node** (`server/server.cjs`) con una única dependencia (`better-sqlite3`). Sirve la API (`/api/*`) y el front estático (`public/`). **Sin build.**
- **Un fichero de datos**: `DATA_DIR/sgi.db` (SQLite). Copiarlo = migrar. Imágenes de la revisión dentro del mismo fichero.
- **Configuración por entorno**: `PORT` (8096), `HOST` (127.0.0.1), `DATA_DIR` (`./data`), `PUBLIC_DIR` (`./public`).
- **Rutas relativas** en el front (`api/...`): funciona bajo cualquier prefijo (p. ej. `/sgi/`) si el proxy lo reenvía.
- **Sin autenticación propia**: se delega en lo que haya delante (Cloudflare Access / VISTA).
- **Export/Import JSON**: `GET /api/export` (con imágenes) y `POST /api/import` (reemplaza todo).
- El front es JS plano (`public/app.js`): para integrarlo en VISTA basta montar `public/` y proxiar `/api/`.

## Arranque
    npm install --omit=dev
    npm start                      # http://127.0.0.1:8096

## Datos iniciales (una sola vez, con la BD vacía)
    curl -X POST http://127.0.0.1:8096/api/import --data-binary @seed/contexto-2026.json

`seed/contexto-2026.json` sale de `Contexto 2026.xlsx` y `Objetivos anuales.xlsx` (los Excel originales no se han modificado).

## Modelo
Tabla `items(col, id, data JSON)` con las colecciones `meta`, `factors`, `parties`, `risks`, `opps`, `objetivos`, `rev_texto`;
tabla `imgs` para las imágenes de la revisión. Cada riesgo/oportunidad tiene una o varias acciones (`acciones[]` con acción, responsable, plazo, estado, comentarios); su estado se deriva de ellas. Los cambios en factores desde Externo/Interno pasan por un borrador que se aplica o se deshace. Reglas: R = P×G (1–3), VR = V×R; R ≥ 4 o G = 3 exige acción o justificación;
un riesgo u oportunidad puede enlazarse a varios factores (`fids`): la misma frase como debilidad y amenaza (o fortaleza y oportunidad) se evalúa una sola vez; estados `En curso` / `Cerrada` / vacío; el proceso (PG/PS) se elige en el factor y lo heredan riesgos y oportunidades.

## Ciclos anuales (histórico)
Cada año es un **ciclo** completo (DAFO, partes, riesgos, oportunidades, objetivos y revisión por la dirección): una «foto» por año.
- Un ciclo **cerrado** es de **solo lectura** (la API responde 409). **No se puede reabrir desde la aplicación**.
- Crear el ciclo siguiente (solo desde uno cerrado): copia partes y factores (mismos ids), riesgos y oportunidades **sin valorar**
  (con la valoración anterior como referencia `prev`), las acciones **abiertas** continúan y las cerradas se quedan en el año anterior;
  objetivos nuevos con origen/indicador y el último resultado como referencia (si ya hay objetivos preparados para ese año, se respetan);
  revisión en blanco.
- Administración desde el servidor: `node server/ciclo.cjs listar | reabrir AAAA | cerrar AAAA`.
- `GET /api/data?c=AAAA`, `GET /api/ciclos`, `POST /api/ciclos {desde, anio}`, `POST /api/ciclos/AAAA/cerrar`.
  Las colecciones se escriben con `?c=AAAA`.

## Copia de seguridad
Incluida en `/home/ubuntu/backups/backup.py` (diaria 03:30, cifrada a Drive).
