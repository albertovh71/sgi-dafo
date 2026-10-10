import { Download, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Datos } from './types'
import Dafo from './screens/Dafo'
import Partes from './screens/Partes'
import Riesgos from './screens/Riesgos'

const VACIO: Datos = { revisions: [], factors: [], parties: [], risks: [] }
type Coleccion = keyof Datos
const TABS = [
  ['dafo', 'DAFO'],
  ['partes', 'Partes interesadas'],
  ['riesgos', 'Riesgos y oportunidades'],
] as const
type Tab = (typeof TABS)[number][0]

export interface Store {
  datos: Datos
  guardar: <C extends Coleccion>(c: C, fila: Datos[C][number]) => void
  borrar: (c: Coleccion, id: string) => void
  recargar: () => Promise<void>
  ir: (t: Tab) => void
}

export default function App() {
  const [datos, setDatos] = useState<Datos>(VACIO)
  const [cargado, setCargado] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('dafo')
  const fichero = useRef<HTMLInputElement>(null)

  const recargar = useCallback(async () => {
    try {
      setDatos(await api.datos())
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargado(true)
    }
  }, [])
  useEffect(() => void recargar(), [recargar])

  const store: Store = {
    datos,
    ir: setTab,
    recargar,
    // Optimista: se pinta ya y, si el servidor lo rechaza, se recarga el estado real.
    guardar: (c, fila) => {
      setDatos((d) => {
        const lista = d[c] as { id: string }[]
        const i = lista.findIndex((x) => x.id === fila.id)
        const nueva = i < 0 ? [...lista, fila] : lista.map((x) => (x.id === fila.id ? fila : x))
        return { ...d, [c]: nueva }
      })
      api.guardar(c, fila.id, fila).catch((e) => {
        setError(e.message)
        void recargar()
      })
    },
    borrar: (c, id) => {
      setDatos((d) => ({ ...d, [c]: (d[c] as { id: string }[]).filter((x) => x.id !== id) }) as Datos)
      api.borrar(c, id).then(
        () => (c === 'factors' || c === 'revisions') && void recargar(),
        (e) => {
          setError(e.message)
          void recargar()
        },
      )
    },
  }

  async function importar(f: File) {
    try {
      const data = JSON.parse(await f.text())
      if (!confirm('Importar REEMPLAZA todos los datos actuales. ¿Continuar?')) return
      await api.importar(data)
      await recargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">SGI · Contexto y riesgos</h1>
        <nav className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
          {TABS.map(([id, nombre]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={tab === id ? { background: 'var(--surface)', fontWeight: 600 } : { color: 'var(--muted)' }}
            >
              {nombre}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex gap-2">
          <a className="btn" href="api/export" title="Descargar copia en JSON">
            <Download size={15} /> Exportar
          </a>
          <button className="btn" onClick={() => fichero.current?.click()} title="Reemplaza todos los datos">
            <Upload size={15} /> Importar
          </button>
          <input ref={fichero} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }} onClick={() => setError('')}>
          {error}
        </div>
      )}
      {!cargado ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : tab === 'dafo' ? (
        <Dafo store={store} />
      ) : tab === 'partes' ? (
        <Partes store={store} />
      ) : (
        <Riesgos store={store} />
      )}
    </div>
  )
}
