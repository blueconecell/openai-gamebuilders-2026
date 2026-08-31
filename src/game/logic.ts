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
export type ShipSocket = { index: number; x: number; y: number; parentIndex: number | null }

const BASE_SOCKETS: ShipSocket[] = [
  { index: 0, x: 38, y: -24, parentIndex: null },
  { index: 1, x: 38, y: 24, parentIndex: null },
  { index: 2, x: 0, y: -46, parentIndex: null },
  { index: 3, x: 0, y: 46, parentIndex: null },
]
export const MAX_SHIP_SLOTS = 40

export type SaveData = {
  scrap: number
  discoveries: number
  victories: number
  tutorialSeen: boolean
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
  tutorialSeen: false,
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

export function calculateMassLimit(slots: Array<ShipPart | null>): number {
  return 15 + slots.filter((part) => part?.kind === 'body').length * 6
}

export function isSocketUnlocked(slots: Array<ShipPart | null>, index: number): boolean {
  return index < 4 || slots[index - 4]?.kind === 'body'
}

export function firstOpenSocket(slots: Array<ShipPart | null>): number {
  return shipSocketLayout(slots).find((socket) => !slots[socket.index])?.index ?? -1
}

/** Each BODY opens one child socket farther out on the same radial branch. */
export function shipSocketLayout(slots: Array<ShipPart | null>): ShipSocket[] {
  const layout = BASE_SOCKETS.map((socket) => ({ ...socket }))
  for (let parentIndex = 0; parentIndex < slots.length; parentIndex += 1) {
    if (slots[parentIndex]?.kind !== 'body' || !isSocketUnlocked(slots, parentIndex)) continue
    const childIndex = parentIndex + 4
    if (childIndex >= MAX_SHIP_SLOTS) continue
    const root = BASE_SOCKETS[childIndex % 4]
    const distance = Math.hypot(root.x, root.y) || 1
    const depth = Math.floor(childIndex / 4)
    layout.push({
      index: childIndex,
      x: root.x + root.x / distance * 48 * depth,
      y: root.y + root.y / distance * 48 * depth,
      parentIndex,
    })
  }
  return layout.sort((a, b) => a.index - b.index)
}

export function movementScale(mass: number, limit = 15): number {
  if (mass <= limit) return 1
  return Math.max(0.55, 1 - (mass - limit) * 0.075)
}

export function partDurability(part: ShipPart): number {
  if (part.kind === 'body') return 18
  if (part.kind === 'weapon') return 14
  if (part.kind === 'defense') return 16
  return 12
}

export function partResaleValue(part: ShipPart, integrity: number): number {
  const base = part.kind === 'multiply'
    ? 4
    : part.kind === 'weapon' || part.kind === 'defense'
      ? 3
      : part.kind === 'body'
        ? 2
        : 1
  const condition = Math.max(0, Math.min(1, integrity / partDurability(part)))
  return Math.max(1, Math.floor(base * condition))
}

export function readSave(storage?: Pick<Storage, 'getItem'>): SaveData {
  if (!storage) return { ...DEFAULT_SAVE }

  try {
    const value = JSON.parse(storage.getItem(SAVE_KEY) ?? '{}') as Partial<SaveData>
    return {
      scrap: validCount(value.scrap),
      discoveries: validCount(value.discoveries),
      victories: validCount(value.victories),
      tutorialSeen: value.tutorialSeen === true,
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

  const slots = run.slots.slice(0, MAX_SHIP_SLOTS).map(validPart)
  const savedIntegrity = Array.isArray(run.slotIntegrity) ? run.slotIntegrity : []
  const integrity = slots.map((part, index) => part
    ? Math.min(partDurability(part), validIntegrity(savedIntegrity[index], partDurability(part)))
    : 0)
  migrateLegacyOuterSlots(slots, integrity, run.slots.length)
  return {
    xRatio: validRatio(run.xRatio, 0.3),
    yRatio: validRatio(run.yRatio, 0.52),
    explored: Math.min(100, validCount(run.explored)),
    slots,
    slotIntegrity: integrity,
  }
}

function migrateLegacyOuterSlots(
  slots: Array<ShipPart | null>,
  integrity: number[],
  savedLength: number,
): void {
  if (savedLength > 6) return
  for (const legacyIndex of [4, 5]) {
    const part = slots[legacyIndex]
    if (!part || isSocketUnlocked(slots, legacyIndex)) continue
    const layout = shipSocketLayout(slots)
    const target = layout.find((socket) => socket.index >= 4 && !slots[socket.index])?.index
      ?? layout.find((socket) => !slots[socket.index])?.index
      ?? -1
    if (target < 0) continue
    slots[target] = part
    integrity[target] = integrity[legacyIndex]
    slots[legacyIndex] = null
    integrity[legacyIndex] = 0
  }
}

function validIntegrity(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function validRatio(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
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
