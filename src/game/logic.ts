export type OperatorPart = {
  kind: 'add' | 'multiply'
  value: number
  mass: number
}

export type SaveData = {
  scrap: number
  discoveries: number
  victories: number
}

export const SAVE_KEY = 'overflow-far-space-save-v1'

export const DEFAULT_SAVE: SaveData = {
  scrap: 0,
  discoveries: 0,
  victories: 0,
}

export function calculatePower(base: number, slots: Array<OperatorPart | null>): number {
  return slots.reduce((power, part) => {
    if (!part) return power
    return part.kind === 'add' ? power + part.value : power * part.value
  }, base)
}

export function calculateMass(slots: Array<OperatorPart | null>): number {
  return slots.reduce((mass, part) => mass + (part?.mass ?? 0), 0)
}

export function movementScale(mass: number): number {
  if (mass <= 6) return 1
  return Math.max(0.55, 1 - (mass - 6) * 0.075)
}

export function readSave(storage?: Pick<Storage, 'getItem'>): SaveData {
  if (!storage) return { ...DEFAULT_SAVE }

  try {
    const value = JSON.parse(storage.getItem(SAVE_KEY) ?? '{}') as Partial<SaveData>
    return {
      scrap: validCount(value.scrap),
      discoveries: validCount(value.discoveries),
      victories: validCount(value.victories),
    }
  } catch {
    return { ...DEFAULT_SAVE }
  }
}

export function writeSave(data: SaveData, storage?: Pick<Storage, 'setItem'>): void {
  storage?.setItem(SAVE_KEY, JSON.stringify(data))
}

function validCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
}
