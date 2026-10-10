import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { nuevoId } from '../api'
import type { Store } from '../App'
import { Campo, FiltroNormas, Modal, NormaChip, NormasSelect } from '../ui'
import type { Norma, Parte } from '../types'

const nueva = (): Parte => ({ id: nuevoId(), nombre: '', tipo: 'externa', necesidades: '', requisito: 0, normas: [], seguimiento: '' })

export default function Partes({ store }: { store: Store }) {
  const [norma, setNorma] = useState<Norma | ''>('')
  const [edit, setEdit] = useState<Parte | null>(null)
  const lista = store.datos.parties.filter((p) => !norma || p.normas.includes(norma))
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => setEdit(nueva())}><Plus size={14} /> Nueva parte interesada</button>
        <div className="ml-auto"><FiltroNormas value={norma} onChange={setNorma} /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
              <th className="p-3">Parte interesada</th><th className="p-3">Necesidades y expectativas</th><th className="p-3">¿Requisito?</th><th className="p-3">Normas</th><th className="p-3">Seguimiento</th><th />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={6} className="p-6 text-center" style={{ color: 'var(--muted)' }}>Sin partes interesadas</td></tr>}
            {lista.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td className="p-3 align-top"><div className="font-medium">{p.nombre}</div><div className="text-xs" style={{ color: 'var(--muted)' }}>{p.tipo}</div></td>
                <td className="p-3 align-top whitespace-pre-wrap">{p.necesidades}</td>
                <td className="p-3 align-top">{p.requisito ? 'Sí' : 'No'}</td>
                <td className="p-3 align-top"><div className="flex flex-wrap gap-1">{p.normas.map((n) => <NormaChip key={n} n={n} />)}</div></td>
                <td className="p-3 align-top whitespace-pre-wrap">{p.seguimiento}</td>
                <td className="p-3 align-top"><button className="btn !p-1.5" onClick={() => setEdit(p)}><Pencil size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal titulo="Parte interesada" onClose={() => setEdit(null)}>
          <Form p={edit} store={store} onClose={() => setEdit(null)} existe={store.datos.parties.some((x) => x.id === edit.id)} />
        </Modal>
      )}
    </div>
  )
}

function Form({ p, store, onClose, existe }: { p: Parte; store: Store; onClose: () => void; existe: boolean }) {
  const [v, setV] = useState(p)
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!v.nombre.trim()) return; store.guardar('parties', v); onClose() }}>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Campo label="Nombre"><input autoFocus className="input" value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} /></Campo>
        <Campo label="Tipo">
          <select className="input" value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as Parte['tipo'] })}><option value="externa">Externa</option><option value="interna">Interna</option></select>
        </Campo>
      </div>
      <Campo label="Necesidades y expectativas"><textarea className="input" rows={3} value={v.necesidades} onChange={(e) => setV({ ...v, necesidades: e.target.value })} /></Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.requisito} onChange={(e) => setV({ ...v, requisito: e.target.checked ? 1 : 0 })} /> Se convierte en requisito (legal u otro) que la organización asume</label>
      <Campo label="Normas"><NormasSelect value={v.normas} onChange={(normas) => setV({ ...v, normas })} /></Campo>
      <Campo label="Seguimiento / cómo se revisa"><textarea className="input" rows={2} value={v.seguimiento} onChange={(e) => setV({ ...v, seguimiento: e.target.value })} /></Campo>
      <div className="flex justify-between pt-2">
        {existe ? <button type="button" className="btn" style={{ color: 'var(--danger)' }} onClick={() => confirm('¿Eliminar?') && (store.borrar('parties', v.id), onClose())}><Trash2 size={14} /> Eliminar</button> : <span />}
        <button className="btn btn-primary">Guardar</button>
      </div>
    </form>
  )
}
