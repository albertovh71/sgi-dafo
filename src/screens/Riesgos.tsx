import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { nuevoId } from '../api'
import type { Store } from '../App'
import { Campo, FiltroNormas, Modal, NormaChip, NormasSelect } from '../ui'
import type { Norma, Riesgo } from '../types'

// Puntuación = probabilidad × impacto (1–25).
const nivel = (p: number) =>
  p >= 16 ? { n: 'Crítico', c: '#b8453a' } : p >= 10 ? { n: 'Alto', c: '#d0832a' } : p >= 5 ? { n: 'Medio', c: '#b9a21f' } : { n: 'Bajo', c: '#3a8a4f' }

const nuevo = (): Riesgo => ({
  id: nuevoId(), tipo: 'riesgo', factor_id: null, descripcion: '', normas: [], probabilidad: 3, impacto: 3,
  accion: '', responsable: '', limite: '', estado: 'identificado', eficacia: '',
})

export default function Riesgos({ store }: { store: Store }) {
  const [norma, setNorma] = useState<Norma | ''>('')
  const [estado, setEstado] = useState('abiertos')
  const [edit, setEdit] = useState<Riesgo | null>(null)
  const lista = store.datos.risks
    .filter((r) => (!norma || r.normas.includes(norma)) && (estado === 'todos' || (estado === 'abiertos' ? r.estado !== 'cerrado' : r.estado === estado)))
    .sort((a, b) => b.probabilidad * b.impacto - a.probabilidad * a.impacto)
  const factorTxt = (id: string | null) => store.datos.factors.find((f) => f.id === id)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={() => setEdit(nuevo())}><Plus size={14} /> Nuevo</button>
        <div className="ml-auto flex gap-2">
          <select className="input !w-auto" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="abiertos">Abiertos</option><option value="identificado">Identificados</option><option value="en curso">En curso</option><option value="cerrado">Cerrados</option><option value="todos">Todos</option>
          </select>
          <FiltroNormas value={norma} onChange={setNorma} />
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
              <th className="p-3">Tipo</th><th className="p-3">Descripción</th><th className="p-3">Normas</th><th className="p-3">P×I</th><th className="p-3">Acción</th><th className="p-3">Responsable / fecha</th><th className="p-3">Estado</th><th />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={8} className="p-6 text-center" style={{ color: 'var(--muted)' }}>Nada que mostrar. Puedes crearlos desde el DAFO con la flecha de cada factor.</td></tr>}
            {lista.map((r) => {
              const pt = r.probabilidad * r.impacto
              const nv = nivel(pt)
              const f = factorTxt(r.factor_id)
              const vencido = r.limite && r.estado !== 'cerrado' && r.limite < new Date().toISOString().slice(0, 10)
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="p-3 align-top capitalize">{r.tipo}</td>
                  <td className="p-3 align-top"><div>{r.descripcion}</div>{f && <div className="text-xs" style={{ color: 'var(--muted)' }}>Origen DAFO: {f.tipo}</div>}</td>
                  <td className="p-3 align-top"><div className="flex flex-wrap gap-1">{r.normas.map((n) => <NormaChip key={n} n={n} />)}</div></td>
                  <td className="p-3 align-top whitespace-nowrap"><span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: nv.c }}>{pt} · {nv.n}</span></td>
                  <td className="p-3 align-top whitespace-pre-wrap">{r.accion}</td>
                  <td className="p-3 align-top">{r.responsable}<div className="text-xs" style={{ color: vencido ? 'var(--danger)' : 'var(--muted)' }}>{r.limite}{vencido && ' · vencida'}</div></td>
                  <td className="p-3 align-top whitespace-nowrap">{r.estado}</td>
                  <td className="p-3 align-top"><button className="btn !p-1.5" onClick={() => setEdit(r)}><Pencil size={14} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal titulo="Riesgo / oportunidad" onClose={() => setEdit(null)}>
          <Form r={edit} store={store} onClose={() => setEdit(null)} existe={store.datos.risks.some((x) => x.id === edit.id)} />
        </Modal>
      )}
    </div>
  )
}

function Form({ r, store, onClose, existe }: { r: Riesgo; store: Store; onClose: () => void; existe: boolean }) {
  const [v, setV] = useState(r)
  const pt = v.probabilidad * v.impacto
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!v.descripcion.trim()) return; store.guardar('risks', v); onClose() }}>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo"><select className="input" value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as Riesgo['tipo'] })}><option value="riesgo">Riesgo</option><option value="oportunidad">Oportunidad</option></select></Campo>
        <Campo label="Estado"><select className="input" value={v.estado} onChange={(e) => setV({ ...v, estado: e.target.value as Riesgo['estado'] })}><option value="identificado">Identificado</option><option value="en curso">En curso</option><option value="cerrado">Cerrado</option></select></Campo>
      </div>
      <Campo label="Descripción"><textarea autoFocus className="input" rows={2} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} /></Campo>
      <Campo label="Normas"><NormasSelect value={v.normas} onChange={(normas) => setV({ ...v, normas })} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label={`Probabilidad: ${v.probabilidad}/5`}><input type="range" min={1} max={5} className="w-full" value={v.probabilidad} onChange={(e) => setV({ ...v, probabilidad: +e.target.value })} /></Campo>
        <Campo label={`Impacto: ${v.impacto}/5`}><input type="range" min={1} max={5} className="w-full" value={v.impacto} onChange={(e) => setV({ ...v, impacto: +e.target.value })} /></Campo>
      </div>
      <p className="text-sm">Puntuación: <b>{pt}</b> · {nivel(pt).n}</p>
      <Campo label="Acción planificada"><textarea className="input" rows={2} value={v.accion} onChange={(e) => setV({ ...v, accion: e.target.value })} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Responsable"><input className="input" value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} /></Campo>
        <Campo label="Fecha límite"><input type="date" className="input" value={v.limite} onChange={(e) => setV({ ...v, limite: e.target.value })} /></Campo>
      </div>
      <Campo label="Evaluación de eficacia"><textarea className="input" rows={2} value={v.eficacia} onChange={(e) => setV({ ...v, eficacia: e.target.value })} /></Campo>
      <div className="flex justify-between pt-2">
        {existe ? <button type="button" className="btn" style={{ color: 'var(--danger)' }} onClick={() => confirm('¿Eliminar?') && (store.borrar('risks', v.id), onClose())}><Trash2 size={14} /> Eliminar</button> : <span />}
        <button className="btn btn-primary">Guardar</button>
      </div>
    </form>
  )
}
