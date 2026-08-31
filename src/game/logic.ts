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
export const SOCKET_LAYOUT_VERSION = 2
export const MAX_SHIP_SLOTS = 160

export type SaveData = {
  scrap: number
  discoveries: number
  victories: number
  tutorialSeen: boolean
  safeRun: SafeRun | null
}

export type SafeRun = {
  socketLayoutVersion: number
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
  if (index < 0 || index >= MAX_SHIP_SLOTS) return false
  if (index < 4) return true
  const parentIndex = socketParentIndex(index)
  return parentIndex !== null
    && slots[parentIndex]?.kind === 'body'
    && isSocketUnlocked(slots, parentIndex)
}

export function canAttachPart(slots: Array<ShipPart | null>, index: number, part: ShipPart): boolean {
  return isSocketUnlocked(slots, index)
    && !slots[index]
    && (part.kind !== 'body' || socketChildIndices(index).length === 3)
}

export function firstOpenSocket(slots: Array<ShipPart | null>, part?: ShipPart): number {
  return shipSocketLayout(slots).find((socket) => part
    ? canAttachPart(slots, socket.index, part)
    : !slots[socket.index])?.index ?? -1
}

export function socketParentIndex(index: number): number | null {
  return index < 4 ? null : Math.floor((index - 4) / 3)
}

export function socketChildIndices(parentIndex: number): number[] {
  const firstChild = 4 + parentIndex * 3
  return [firstChild, firstChild + 1, firstChild + 2].filter((index) => index < MAX_SHIP_SLOTS)
}

export function socketDescendantIndices(parentIndex: number): number[] {
  const descendants: number[] = []
  const queue = [...socketChildIndices(parentIndex)]
  while (queue.length > 0) {
    const index = queue.shift()!
    descendants.push(index)
    queue.push(...socketChildIndices(index))
  }
  return descendants
}

/** Each BODY opens three nearby sockets; BODY children can branch again. */
export function shipSocketLayout(slots: Array<ShipPart | null>): ShipSocket[] {
  const nodes = BASE_SOCKETS.map((socket) => ({
    ...socket,
    angle: Math.atan2(socket.y, socket.x),
    depth: 0,
  }))
  const layout: ShipSocket[] = BASE_SOCKETS.map((socket) => ({ ...socket }))
  const queue = [...nodes]
  while (queue.length > 0) {
    const parent = queue.shift()!
    if (slots[parent.index]?.kind !== 'body' || !isSocketUnlocked(slots, parent.index)) continue
    const children = socketChildIndices(parent.index)
    for (const ordinal of [1, 0, 2]) {
      const childIndex = children[ordinal]
      if (childIndex === undefined) continue
      const angle = parent.angle + [-0.72, 0, 0.72][ordinal] * (1 + parent.depth * 0.18)
      let x = parent.x + Math.cos(angle) * 48
      let y = parent.y + Math.sin(angle) * 48
      for (let attempt = 0; attempt < 50 && layout.some((socket) => Math.hypot(socket.x - x, socket.y - y) < 30); attempt += 1) {
        const outwardAngle = Math.atan2(y, x)
        x += Math.cos(outwardAngle) * 8
        y += Math.sin(outwardAngle) * 8
      }
      const child = {
        index: childIndex,
        x,
        y,
        parentIndex: parent.index,
        angle,
        depth: parent.depth + 1,
      }
      queue.push(child)
      layout.push({
        index: child.index,
        x: child.x,
        y: child.y,
        parentIndex: child.parentIndex,
      })
    }
  }
  return layout
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
  if (run.socketLayoutVersion !== SOCKET_LAYOUT_VERSION) migrateLegacySocketLayout(slots, integrity)
  return {
    socketLayoutVersion: SOCKET_LAYOUT_VERSION,
    xRatio: validRatio(run.xRatio, 0.3),
    yRatio: validRatio(run.yRatio, 0.52),
    explored: Math.min(100, validCount(run.explored)),
    slots,
    slotIntegrity: integrity,
  }
}

function migrateLegacySocketLayout(
  slots: Array<ShipPart | null>,
  integrity: number[],
): void {
  const legacySlots = [...slots]
  const legacyIntegrity = [...integrity]
  const migrated: Array<ShipPart | null> = legacySlots.slice(0, 4)
  const migratedIntegrity = legacyIntegrity.slice(0, 4)
  const indexMap = new Map<number, number>([0, 1, 2, 3].map((index) => [index, index]))

  for (let legacyIndex = 4; legacyIndex < legacySlots.length; legacyIndex += 1) {
    const part = legacySlots[legacyIndex]
    if (!part) continue
    const legacyParent = legacyIndex - 4
    const migratedParent = indexMap.get(legacyParent)
    let target = migratedParent !== undefined && legacySlots[legacyParent]?.kind === 'body'
      ? socketChildIndices(migratedParent)[1] ?? -1
      : -1
    if (target < 0 || migrated[target]) {
      const layout = shipSocketLayout(migrated)
      target = layout.find((socket) => socket.index >= 4 && !migrated[socket.index])?.index
        ?? layout.find((socket) => !migrated[socket.index])?.index
        ?? -1
    }
    if (target < 0) continue
    migrated[target] = part
    migratedIntegrity[target] = legacyIntegrity[legacyIndex]
    indexMap.set(legacyIndex, target)
  }

  const normalizedSlots = Array.from({ length: migrated.length }, (_, index) => migrated[index] ?? null)
  const normalizedIntegrity = normalizedSlots.map((part, index) => part ? migratedIntegrity[index] ?? partDurability(part) : 0)
  slots.splice(0, slots.length, ...normalizedSlots)
  integrity.splice(0, integrity.length, ...normalizedIntegrity)
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
