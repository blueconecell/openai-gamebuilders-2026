import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SAVE,
  MAX_SHIP_SLOTS,
  SAVE_KEY,
  calculateMass,
  calculateMassLimit,
  calculatePower,
  canAttachPart,
  movementScale,
  partDurability,
  partResaleValue,
  readSave,
  shipSocketLayout,
  socketChildIndices,
  socketDescendantIndices,
  type ShipPart,
  writeSave,
  type OperatorPart,
} from './logic'

const add3: OperatorPart = { kind: 'add', value: 3, mass: 3 }
const times2: OperatorPart = { kind: 'multiply', value: 2, mass: 5 }

describe('operator rail', () => {
  it('applies parts in socket order', () => {
    expect(calculatePower(2, [add3, times2])).toBe(10)
    expect(calculatePower(2, [times2, add3])).toBe(7)
  })

  it('ignores empty sockets and totals mass', () => {
    expect(calculatePower(2, [null, add3, null])).toBe(5)
    expect(calculateMass([add3, null, times2])).toBe(8)
  })

  it('keeps equipment mass without changing the multiplier chain', () => {
    const equipment = [
      add3,
      { kind: 'weapon' as const, weapon: 'homing' as const, mass: 4 },
      times2,
      { kind: 'defense' as const, defense: 'shield' as const, mass: 3 },
    ]
    expect(calculatePower(2, equipment)).toBe(10)
    expect(calculateMass(equipment)).toBe(15)
  })

  it('caps the over-mass movement penalty', () => {
    expect(movementScale(15)).toBe(1)
    expect(movementScale(17)).toBeCloseTo(0.85)
    expect(movementScale(99)).toBe(0.55)
  })

  it('raises the mass limit for every body module', () => {
    const body = { kind: 'body' as const, mass: 4 }
    expect(calculateMassLimit([null])).toBe(15)
    expect(calculateMassLimit([body, body])).toBe(27)
    expect(movementScale(23, calculateMassLimit([body]))).toBeCloseTo(0.85)
  })

  it('opens three nearby sockets for every chained body module', () => {
    const body = { kind: 'body' as const, mass: 4 }
    const first = shipSocketLayout([null, null, null, body])
    expect(first).toHaveLength(7)
    expect(first.slice(4).map((socket) => socket.index)).toEqual([14, 13, 15])
    expect(first.slice(4).every((socket) => socket.parentIndex === 3)).toBe(true)

    const slots = Array.from({ length: 15 }, () => null) as Array<typeof body | null>
    slots[3] = body
    slots[14] = body
    const chained = shipSocketLayout(slots)
    expect(chained).toHaveLength(10)
    expect(chained.filter((socket) => socket.parentIndex === 14).map((socket) => socket.index)).toEqual([47, 46, 48])
    expect(socketChildIndices(14)).toEqual([46, 47, 48])
    expect(socketDescendantIndices(14)).toContain(47)
  })

  it('keeps deep branch sockets separate and rejects BODY on a leaf socket', () => {
    const body = { kind: 'body' as const, mass: 2 }
    const fullTree: Array<ShipPart | null> = Array.from({ length: MAX_SHIP_SLOTS }, () => body)
    const layout = shipSocketLayout(fullTree)
    for (let left = 0; left < layout.length; left += 1) {
      for (let right = left + 1; right < layout.length; right += 1) {
        expect(Math.hypot(layout[left].x - layout[right].x, layout[left].y - layout[right].y)).toBeGreaterThanOrEqual(29.9)
      }
    }
    const leaf = layout.find((socket) => socketChildIndices(socket.index).length === 0)!
    const emptyLeafSlots = [...fullTree]
    emptyLeafSlots[leaf.index] = null
    expect(canAttachPart(emptyLeafSlots, leaf.index, body)).toBe(false)
  })

  it('assigns deliberately fragile durability by part category', () => {
    expect(partDurability(add3)).toBe(12)
    expect(partDurability({ kind: 'weapon', weapon: 'saw', mass: 4 })).toBe(14)
    expect(partDurability({ kind: 'body', mass: 2 })).toBe(18)
  })

  it('reduces mounted-part resale value when durability is low', () => {
    const weapon = { kind: 'weapon', weapon: 'homing', mass: 4 } as const
    expect(partResaleValue(weapon, 14)).toBe(3)
    expect(partResaleValue(weapon, 7)).toBe(1)
    expect(partResaleValue(weapon, 0)).toBe(1)
  })
})

describe('local save', () => {
  it('uses safe defaults for missing or malformed data', () => {
    expect(readSave({ getItem: () => null })).toEqual(DEFAULT_SAVE)
    expect(readSave({ getItem: () => '{broken' })).toEqual(DEFAULT_SAVE)
  })

  it('sanitizes values and writes the versioned key', () => {
    expect(readSave({ getItem: () => '{"scrap":4.8,"discoveries":-2,"victories":"3"}' })).toEqual({
      scrap: 4,
      discoveries: 0,
      victories: 0,
      tutorialSeen: false,
      safeRun: null,
    })

    let written = ''
    writeSave(
      { scrap: 9, discoveries: 2, victories: 1, tutorialSeen: true, safeRun: null },
      { setItem: (key, value) => { written = `${key}:${value}` } },
    )
    expect(written).toBe(`${SAVE_KEY}:{"scrap":9,"discoveries":2,"victories":1,"tutorialSeen":true,"safeRun":null}`)
  })

  it('restores a safe run and ignores storage write failures', () => {
    const restored = readSave({
      getItem: () => JSON.stringify({
        safeRun: {
          xRatio: 0.4,
          yRatio: 0.6,
          explored: 75,
          slots: [{ kind: 'add', value: 3, mass: 3 }, { kind: 'unknown' }],
        },
      }),
    })

    expect(restored.safeRun).toEqual({
      socketLayoutVersion: 2,
      xRatio: 0.4,
      yRatio: 0.6,
      explored: 75,
      slots: [{ kind: 'add', value: 3, mass: 3 }, null],
      slotIntegrity: [12, 0],
    })
    expect(() => writeSave(restored, { setItem: () => { throw new Error('blocked') } })).not.toThrow()
  })

  it('preserves coordinates beyond the original map bounds', () => {
    const restored = readSave({
      getItem: () => JSON.stringify({
        safeRun: { xRatio: 3.5, yRatio: -2, explored: 0, slots: [] },
      }),
    })
    expect(restored.safeRun?.xRatio).toBe(3.5)
    expect(restored.safeRun?.yRatio).toBe(-2)
  })

  it('moves legacy outer equipment onto a body child socket', () => {
    const restored = readSave({
      getItem: () => JSON.stringify({
        safeRun: {
          slots: [
            { kind: 'add', value: 1, mass: 2 },
            { kind: 'weapon', weapon: 'mine', mass: 3 },
            null,
            { kind: 'body', mass: 2 },
            { kind: 'defense', defense: 'shield', mass: 4 },
          ],
        },
      }),
    })
    expect(restored.safeRun?.slots[4]).toBeNull()
    expect(restored.safeRun?.slots[14]).toEqual({ kind: 'defense', defense: 'shield', mass: 4 })
  })

  it('restores weapon, body, and defense attachments', () => {
    const restored = readSave({
      getItem: () => JSON.stringify({
        safeRun: {
          slots: [
            { kind: 'weapon', weapon: 'mine', mass: 3 },
            { kind: 'body', mass: 2 },
            { kind: 'defense', defense: 'repair', mass: 4 },
          ],
          slotIntegrity: [4, 99, -1],
        },
      }),
    })
    expect(restored.safeRun?.slots).toEqual([
      { kind: 'weapon', weapon: 'mine', mass: 3 },
      { kind: 'body', mass: 2 },
      { kind: 'defense', defense: 'repair', mass: 4 },
    ])
    expect(restored.safeRun?.slotIntegrity).toEqual([4, 18, 16])
  })

  it('migrates a deployed one-child BODY chain onto center branches', () => {
    const restored = readSave({
      getItem: () => JSON.stringify({
        safeRun: {
          slots: [null, null, null, { kind: 'body', mass: 2 }, null, null, null, { kind: 'body', mass: 2 }, null, null, null, { kind: 'weapon', weapon: 'mine', mass: 3 }],
        },
      }),
    })
    expect(restored.safeRun?.slots[3]).toEqual({ kind: 'body', mass: 2 })
    expect(restored.safeRun?.slots[14]).toEqual({ kind: 'body', mass: 2 })
    expect(restored.safeRun?.slots[47]).toEqual({ kind: 'weapon', weapon: 'mine', mass: 3 })
  })

  it('preserves versioned three-branch socket indices when reloading', () => {
    const slots: Array<ShipPart | null> = Array.from({ length: 15 }, () => null)
    slots[3] = { kind: 'body', mass: 2 }
    slots[14] = { kind: 'weapon', weapon: 'mine', mass: 3 }
    const restored = readSave({
      getItem: () => JSON.stringify({
        safeRun: {
          socketLayoutVersion: 2,
          slots,
          slotIntegrity: Array.from({ length: 15 }, (_, index) => index === 3 ? 18 : index === 14 ? 14 : 0),
        },
      }),
    })
    expect(restored.safeRun?.slots[14]).toEqual({ kind: 'weapon', weapon: 'mine', mass: 3 })
    expect(restored.safeRun?.slotIntegrity[14]).toBe(14)
  })
})
