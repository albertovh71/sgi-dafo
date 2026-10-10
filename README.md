# SGI · DAFO y riesgos (ISO 9001 / 14001 / 45001 / 50001)

Gestión del contexto de la organización (cláusula 4.1), partes interesadas (4.2) y riesgos/oportunidades (6.1),
etiquetados por norma. Primera versión: DAFO por revisiones, partes interesadas, riesgos y oportunidades (P×I).

## Portabilidad (pensado para integrarlo en VISTA)
- **Un solo proceso Node** (`server/server.cjs`) sirve API y front. Única dependencia de servidor: `better-sqlite3`.
- **Un solo fichero de datos**: `data/sgi.db` (SQLite). Copiarlo = migrar.
- Config por entorno: `PORT` (8096), `HOST` (127.0.0.1), `DATA_DIR`, `DIST_DIR`.
- Front con `base: './'` y llamadas `api/...` relativas: funciona bajo cualquier subruta si el proxy quita el prefijo.
- Sin login propio: la autenticación la pone lo que haya delante.
- `GET /api/export` / `POST /api/import` (JSON completo) para mover datos entre instancias sin tocar la BD.
- API REST uniforme: `PUT|DELETE /api/{revisions|factors|parties|risks}/:id`, `GET /api/data`.
  Para embeberlo en VISTA basta con reutilizar estas rutas o portar las 4 tablas.

## Uso
    npm install && npm run build && npm start      # http://127.0.0.1:8096
    npm run dev                                    # Vite con proxy a :8096
