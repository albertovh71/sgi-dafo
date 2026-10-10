import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { NORMAS, NORMA_COLOR, NORMA_NOMBRE, type Norma } from './types'

export function NormaChip({ n }: { n: Norma }) {
  return (
    <span title={NORMA_NOMBRE[n]} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: NORMA_COLOR[n] }}>
      {n}
    </span>
  )
}

export function NormasSelect({ value, onChange }: { value: Norma[]; onChange: (v: Norma[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {NORMAS.map((n) => {
        const on = value.includes(n)
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== n) : [...value, n])}
            className="rounded-lg border px-2.5 py-1 text-sm"
            style={on ? { background: NORMA_COLOR[n], borderColor: NORMA_COLOR[n], color: '#fff' } : { borderColor: 'var(--line)' }}
          >
            ISO {n}
          </button>
        )
      })}
    </div>
  )
}

export function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card mt-8 w-full max-w-xl p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button className="btn" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

export function FiltroNormas({ value, onChange }: { value: Norma | ''; onChange: (v: Norma | '') => void }) {
  return (
    <select className="input !w-auto" value={value} onChange={(e) => onChange(e.target.value as Norma | '')}>
      <option value="">Todas las normas</option>
      {NORMAS.map((n) => (
        <option key={n} value={n}>
          ISO {n} · {NORMA_NOMBRE[n]}
        </option>
      ))}
    </select>
  )
}
