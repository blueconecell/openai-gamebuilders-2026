import { describe, expect, it } from 'vitest'
import {
  COMBAT_CLEAR_DURATION,
  OVERFLOW_COOLDOWN,
  OVERFLOW_DURATION,
  OVERFLOW_THRESHOLD,
  basicCannonOffsets,
  resolvedCombatPhase,
} from './combat'

describe('OVERFLOW basic cannon', () => {
  it('adds two projectiles only while OVERFLOW is active', () => {
    expect(basicCannonOffsets(false)).toHaveLength(2)
    expect(basicCannonOffsets(true)).toHaveLength(4)
  })

  it('keeps the MVP trigger timing explicit', () => {
    expect(OVERFLOW_THRESHOLD).toBe(10)
    expect(OVERFLOW_DURATION).toBe(6)
    expect(OVERFLOW_COOLDOWN).toBe(15)
    expect(COMBAT_CLEAR_DURATION).toBe(1.2)
  })
})

describe('combat result guard', () => {
  it('does not finish a boss fight while its core is alive', () => {
    expect(resolvedCombatPhase('boss', [
      { kind: 'guard', hp: 0 },
      { kind: 'core', hp: 1 },
    ])).toBeNull()
  })

  it('only resolves the currently active combat after core destruction', () => {
    const destroyedCore = [{ kind: 'core', hp: 0 }]
    expect(resolvedCombatPhase('boss', destroyedCore)).toBe('boss')
    expect(resolvedCombatPhase('elite', destroyedCore)).toBe('elite')
    expect(resolvedCombatPhase('void', destroyedCore)).toBeNull()
    expect(resolvedCombatPhase('victory', destroyedCore)).toBeNull()
  })
})
