import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SAVE,
  SAVE_KEY,
  calculateMass,
  calculatePower,
  movementScale,
  partDurability,
  partResaleValue,
  readSave,
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
    expect(movementScale(6)).toBe(1)
    expect(movementScale(8)).toBeCloseTo(0.85)
    expect(movementScale(99)).toBe(0.55)
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
      xRatio: 0.4,
      yRatio: 0.6,
      explored: 75,
      slots: [{ kind: 'add', value: 3, mass: 3 }, null],
      slotIntegrity: [12, 0],
    })
    expect(() => writeSave(restored, { setItem: () => { throw new Error('blocked') } })).not.toThrow()
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
})
