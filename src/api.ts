import type { Datos } from './types'

// Rutas relativas: la app funciona montada bajo cualquier prefijo.
async function llamar(method: string, ruta: string, body?: unknown) {
  const r = await fetch(`api/${ruta}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`)
  return r.json()
}

export const api = {
  datos: (): Promise<Datos> => llamar('GET', 'data'),
  guardar: (coleccion: string, id: string, fila: object) => llamar('PUT', `${coleccion}/${id}`, fila),
  borrar: (coleccion: string, id: string) => llamar('DELETE', `${coleccion}/${id}`),
  duplicar: (id: string, body: object) => llamar('POST', `revisions/${id}/duplicate`, body),
  importar: (datos: unknown) => llamar('POST', 'import', datos),
}

export const nuevoId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
