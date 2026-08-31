import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SAVE,
  SAVE_KEY,
  calculateMass,
  calculatePower,
  movementScale,
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

  it('caps the over-mass movement penalty', () => {
    expect(movementScale(6)).toBe(1)
    expect(movementScale(8)).toBeCloseTo(0.85)
    expect(movementScale(99)).toBe(0.55)
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
      safeRun: null,
    })

    let written = ''
    writeSave(
      { scrap: 9, discoveries: 2, victories: 1, safeRun: null },
      { setItem: (key, value) => { written = `${key}:${value}` } },
    )
    expect(written).toBe(`${SAVE_KEY}:{"scrap":9,"discoveries":2,"victories":1,"safeRun":null}`)
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
    })
    expect(() => writeSave(restored, { setItem: () => { throw new Error('blocked') } })).not.toThrow()
  })
})
