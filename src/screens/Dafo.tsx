import { ArrowRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, nuevoId } from '../api'
import type { Store } from '../App'
import { Campo, FiltroNormas, Modal, NormaChip, NormasSelect } from '../ui'
import { TIPO_FACTOR, type Factor, type Norma, type Revision, type TipoFactor } from '../types'

const hoy = () => new Date().toISOString().slice(0, 10)
// Disposición clásica: arriba lo negativo (D, A), abajo lo positivo (F, O); izquierda interno, derecha externo.
const ORDEN: TipoFactor[] = ['D', 'A', 'F', 'O']
const CATEGORIAS = ['Política', 'Económico', 'Social', 'Tecnológico', 'Legal', 'Ambiental', 'Mercado / clientes', 'Procesos', 'Personas', 'Instalaciones', 'Otro']

export default function Dafo({ store }: { store: Store }) {
  const { datos } = store
  const [revId, setRevId] = useState('')
  const [norma, setNorma] = useState<Norma | ''>('')
  const [editF, setEditF] = useState<Partial<Factor> | null>(null)
  const [editR, setEditR] = useState<Revision | null>(null)

  const revs = datos.revisions
  const rev = revs.find((r) => r.id === revId) ?? revs.find((r) => r.estado === 'vigente') ?? revs[0]
  useEffect(() => {
    if (rev && rev.id !== revId) setRevId(rev.id)
  }, [rev, revId])

  if (!rev)
    return (
      <div className="card p-8 text-center">
        <p className="mb-4" style={{ color: 'var(--muted)' }}>Aún no hay ninguna revisión del DAFO.</p>
        <button className="btn btn-primary" onClick={() => setEditR({ id: nuevoId(), titulo: `DAFO ${new Date().getFullYear()}`, fecha: hoy(), estado: 'borrador', notas: '' })}>
          <Plus size={16} /> Crear la primera revisión
        </button>
        {editR && <RevisionModal rev={editR} store={store} onClose={() => setEditR(null)} onSaved={setRevId} />}
      </div>
    )

  const factores = datos.factors.filter((f) => f.revision_id === rev.id && (!norma || f.normas.includes(norma)))

  async function duplicar() {
    const ids = datos.factors.filter((f) => f.revision_id === rev.id).map(() => nuevoId())
    const id = nuevoId()
    try {
      await api.duplicar(rev.id, { id, titulo: `DAFO ${new Date().getFullYear() + (rev.titulo.includes(String(new Date().getFullYear())) ? 1 : 0)}`, fecha: hoy(), factorIds: ids })
      await store.recargar()
      setRevId(id)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  function aRiesgo(f: Factor) {
    const negativo = f.tipo === 'D' || f.tipo === 'A'
    store.guardar('risks', {
      id: nuevoId(), tipo: negativo ? 'riesgo' : 'oportunidad', factor_id: f.id, descripcion: f.texto, normas: f.normas,
      probabilidad: 3, impacto: f.impacto, accion: '', responsable: '', limite: '', estado: 'identificado', eficacia: '',
    })
    store.ir('riesgos')
  }

  const vinculados = (f: Factor) => datos.risks.filter((r) => r.factor_id === f.id).length

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={rev.id} onChange={(e) => setRevId(e.target.value)}>
          {revs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.titulo} · {r.fecha} · {r.estado}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => setEditR(rev)}><Pencil size={14} /> Revisión</button>
        <button className="btn" onClick={duplicar} title="Copia todos los factores en una revisión nueva (borrador)"><Copy size={14} /> Nueva a partir de esta</button>
        <button className="btn" onClick={() => setEditR({ id: nuevoId(), titulo: '', fecha: hoy(), estado: 'borrador', notas: '' })}><Plus size={14} /> En blanco</button>
        <div className="ml-auto"><FiltroNormas value={norma} onChange={setNorma} /></div>
      </div>
      {rev.notas && <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>{rev.notas}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {ORDEN.map((t) => {
          const info = TIPO_FACTOR[t]
          const lista = factores.filter((f) => f.tipo === t)
          return (
            <section key={t} className="card flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `3px solid ${info.color}` }}>
                <h3 className="font-semibold" style={{ color: info.color }}>{info.nombre}</h3>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{info.sub} · {lista.length}</span>
                <button className="btn ml-auto !py-1" onClick={() => setEditF({ revision_id: rev.id, tipo: t, texto: '', categoria: '', normas: norma ? [norma] : [], impacto: 3 })}>
                  <Plus size={14} /> Añadir
                </button>
              </div>
              <ul className="flex-1 divide-y" style={{ borderColor: 'var(--line)' }}>
                {lista.length === 0 && <li className="p-4 text-sm" style={{ color: 'var(--muted)' }}>Sin elementos</li>}
                {lista.map((f) => (
                  <li key={f.id} className="group flex items-start gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{f.texto}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                        {f.normas.map((n) => <NormaChip key={n} n={n} />)}
                        {f.categoria && <span>{f.categoria}</span>}
                        <span>· impacto {f.impacto}/5</span>
                        {vinculados(f) > 0 && <span>· {vinculados(f)} en riesgos</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button className="btn !p-1.5" title={t === 'D' || t === 'A' ? 'Crear riesgo' : 'Crear oportunidad'} onClick={() => aRiesgo(f)}><ArrowRight size={14} /></button>
                      <button className="btn !p-1.5" title="Editar" onClick={() => setEditF(f)}><Pencil size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {editF && <FactorModal f={editF} store={store} onClose={() => setEditF(null)} />}
      {editR && <RevisionModal rev={editR} store={store} onClose={() => setEditR(null)} onSaved={setRevId} puedeBorrar={revs.some((r) => r.id === editR.id) && revs.length > 1} />}
    </div>
  )
}

function FactorModal({ f, store, onClose }: { f: Partial<Factor>; store: Store; onClose: () => void }) {
  const [v, setV] = useState(f)
  const set = <K extends keyof Factor>(k: K, x: Factor[K]) => setV((p) => ({ ...p, [k]: x }))
  const existe = !!v.id
  return (
    <Modal titulo={existe ? 'Editar factor' : `Nuevo factor · ${TIPO_FACTOR[v.tipo!].nombre}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!v.texto?.trim()) return
          const orden = store.datos.factors.filter((x) => x.revision_id === v.revision_id).length
          store.guardar('factors', { orden, ...v, id: v.id ?? nuevoId() } as Factor)
          onClose()
        }}
      >
        <Campo label="Tipo">
          <select className="input" value={v.tipo} onChange={(e) => set('tipo', e.target.value as TipoFactor)}>
            {ORDEN.map((t) => <option key={t} value={t}>{TIPO_FACTOR[t].nombre} ({TIPO_FACTOR[t].sub})</option>)}
          </select>
        </Campo>
        <Campo label="Descripción"><textarea autoFocus className="input" rows={3} value={v.texto} onChange={(e) => set('texto', e.target.value)} /></Campo>
        <Campo label="Categoría">
          <input className="input" list="cats" value={v.categoria} onChange={(e) => set('categoria', e.target.value)} />
          <datalist id="cats">{CATEGORIAS.map((c) => <option key={c} value={c} />)}</datalist>
        </Campo>
        <Campo label="Normas a las que afecta"><NormasSelect value={v.normas ?? []} onChange={(n) => set('normas', n)} /></Campo>
        <Campo label={`Impacto: ${v.impacto}/5`}>
          <input type="range" min={1} max={5} className="w-full" value={v.impacto} onChange={(e) => set('impacto', +e.target.value)} />
        </Campo>
        <div className="flex justify-between pt-2">
          {existe ? (
            <button type="button" className="btn" style={{ color: 'var(--danger)' }} onClick={() => confirm('¿Eliminar este factor?') && (store.borrar('factors', v.id!), onClose())}>
              <Trash2 size={14} /> Eliminar
            </button>
          ) : <span />}
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}

function RevisionModal({ rev, store, onClose, onSaved, puedeBorrar }: { rev: Revision; store: Store; onClose: () => void; onSaved: (id: string) => void; puedeBorrar?: boolean }) {
  const [v, setV] = useState(rev)
  return (
    <Modal titulo="Revisión del DAFO" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!v.titulo.trim()) return
          store.guardar('revisions', v)
          onSaved(v.id)
          onClose()
        }}
      >
        <Campo label="Título"><input autoFocus className="input" value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha"><input type="date" className="input" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} /></Campo>
          <Campo label="Estado">
            <select className="input" value={v.estado} onChange={(e) => setV({ ...v, estado: e.target.value as Revision['estado'] })}>
              <option value="borrador">Borrador</option><option value="vigente">Vigente</option><option value="archivada">Archivada</option>
            </select>
          </Campo>
        </div>
        <Campo label="Notas (alcance, conclusiones de la revisión…)"><textarea className="input" rows={3} value={v.notas} onChange={(e) => setV({ ...v, notas: e.target.value })} /></Campo>
        <div className="flex justify-between pt-2">
          {puedeBorrar ? (
            <button type="button" className="btn" style={{ color: 'var(--danger)' }} onClick={() => confirm('Se eliminará la revisión y todos sus factores. ¿Continuar?') && (store.borrar('revisions', v.id), onClose())}>
              <Trash2 size={14} /> Eliminar
            </button>
          ) : <span />}
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
