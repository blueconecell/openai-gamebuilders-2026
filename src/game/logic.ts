export type OperatorPart = {
  kind: 'add' | 'multiply'
  value: number
  mass: number
}

export type WeaponKind = 'homing' | 'mine' | 'saw' | 'explosive'
export type DefenseKind = 'interceptor' | 'shield' | 'repair'
export type WeaponPart = { kind: 'weapon'; weapon: WeaponKind; mass: number }
export type BodyPart = { kind: 'body'; mass: number }
export type DefensePart = { kind: 'defense'; defense: DefenseKind; mass: number }
export type ShipPart = OperatorPart | WeaponPart | BodyPart | DefensePart

export type SaveData = {
  scrap: number
  discoveries: number
  victories: number
  safeRun: SafeRun | null
}

export type SafeRun = {
  xRatio: number
  yRatio: number
  explored: number
  slots: Array<ShipPart | null>
  slotIntegrity: number[]
}

export const SAVE_KEY = 'overflow-far-space-save-v1'

export const DEFAULT_SAVE: SaveData = {
  scrap: 0,
  discoveries: 0,
  victories: 0,
  safeRun: null,
}

export function calculatePower(base: number, slots: Array<ShipPart | null>): number {
  return slots.reduce((power, part) => {
    if (!part) return power
    if (part.kind !== 'add' && part.kind !== 'multiply') return power
    return part.kind === 'add' ? power + part.value : power * part.value
  }, base)
}

export function calculateMass(slots: Array<ShipPart | null>): number {
  return slots.reduce((mass, part) => mass + (part?.mass ?? 0), 0)
}

export function movementScale(mass: number): number {
  if (mass <= 6) return 1
  return Math.max(0.55, 1 - (mass - 6) * 0.075)
}

export function partDurability(part: ShipPart): number {
  if (part.kind === 'body') return 32
  if (part.kind === 'weapon') return 26
  if (part.kind === 'defense') return 28
  return 20
}

export function readSave(storage?: Pick<Storage, 'getItem'>): SaveData {
  if (!storage) return { ...DEFAULT_SAVE }

  try {
    const value = JSON.parse(storage.getItem(SAVE_KEY) ?? '{}') as Partial<SaveData>
    return {
      scrap: validCount(value.scrap),
      discoveries: validCount(value.discoveries),
      victories: validCount(value.victories),
      safeRun: validSafeRun(value.safeRun),
    }
  } catch {
    return { ...DEFAULT_SAVE }
  }
}

export function writeSave(data: SaveData, storage?: Pick<Storage, 'setItem'>): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}

function validCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
}

function validSafeRun(value: unknown): SafeRun | null {
  if (!value || typeof value !== 'object') return null
  const run = value as Partial<SafeRun>
  if (!Array.isArray(run.slots)) return null

  const slots = run.slots.slice(0, 6).map(validPart)
  const savedIntegrity = Array.isArray(run.slotIntegrity) ? run.slotIntegrity : []
  return {
    xRatio: validRatio(run.xRatio, 0.3),
    yRatio: validRatio(run.yRatio, 0.52),
    explored: Math.min(100, validCount(run.explored)),
    slots,
    slotIntegrity: slots.map((part, index) => part
      ? Math.min(partDurability(part), validIntegrity(savedIntegrity[index], partDurability(part)))
      : 0),
  }
}

function validIntegrity(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function validRatio(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0.05, Math.min(0.95, value))
    : fallback
}

function validPart(value: unknown): ShipPart | null {
  if (!value || typeof value !== 'object') return null
  const part = value as Partial<ShipPart>
  if (typeof part.mass !== 'number') return null
  if (part.kind === 'add' || part.kind === 'multiply') {
    if (typeof part.value !== 'number') return null
    return { kind: part.kind, value: part.value, mass: part.mass }
  }
  if (part.kind === 'weapon' && ['homing', 'mine', 'saw', 'explosive'].includes(part.weapon ?? '')) {
    return { kind: 'weapon', weapon: part.weapon!, mass: part.mass }
  }
  if (part.kind === 'defense' && ['interceptor', 'shield', 'repair'].includes(part.defense ?? '')) {
    return { kind: 'defense', defense: part.defense!, mass: part.mass }
  }
  if (part.kind === 'body') return { kind: 'body', mass: part.mass }
  return null
}
