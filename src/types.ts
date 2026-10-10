export const NORMAS = ['9001', '14001', '45001', '50001'] as const
export type Norma = (typeof NORMAS)[number]
export const NORMA_NOMBRE: Record<Norma, string> = {
  '9001': 'Calidad',
  '14001': 'Medio ambiente',
  '45001': 'Seguridad y salud',
  '50001': 'Energía',
}
export const NORMA_COLOR: Record<Norma, string> = {
  '9001': '#2f6fb0',
  '14001': '#3a8a4f',
  '45001': '#c27a1a',
  '50001': '#8a4fb0',
}

export type TipoFactor = 'D' | 'A' | 'F' | 'O'
export const TIPO_FACTOR: Record<TipoFactor, { nombre: string; sub: string; color: string }> = {
  D: { nombre: 'Debilidades', sub: 'internas · negativas', color: '#c4553f' },
  A: { nombre: 'Amenazas', sub: 'externas · negativas', color: '#b8802a' },
  F: { nombre: 'Fortalezas', sub: 'internas · positivas', color: '#2f8a5a' },
  O: { nombre: 'Oportunidades', sub: 'externas · positivas', color: '#2f6fb0' },
}

export interface Revision { id: string; titulo: string; fecha: string; estado: 'borrador' | 'vigente' | 'archivada'; notas: string }
export interface Factor { id: string; revision_id: string; tipo: TipoFactor; texto: string; categoria: string; normas: Norma[]; impacto: number; orden: number }
export interface Parte { id: string; nombre: string; tipo: 'interna' | 'externa'; necesidades: string; requisito: number; normas: Norma[]; seguimiento: string }
export interface Riesgo {
  id: string; tipo: 'riesgo' | 'oportunidad'; factor_id: string | null; descripcion: string; normas: Norma[]
  probabilidad: number; impacto: number; accion: string; responsable: string; limite: string
  estado: 'identificado' | 'en curso' | 'cerrado'; eficacia: string
}
export interface Datos { revisions: Revision[]; factors: Factor[]; parties: Parte[]; risks: Riesgo[] }
