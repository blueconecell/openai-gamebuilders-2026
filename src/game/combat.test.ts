import { describe, expect, it } from 'vitest'
import { OVERFLOW_COOLDOWN, OVERFLOW_DURATION, OVERFLOW_THRESHOLD, basicCannonOffsets } from './combat'

describe('OVERFLOW basic cannon', () => {
  it('adds two projectiles only while OVERFLOW is active', () => {
    expect(basicCannonOffsets(false)).toHaveLength(2)
    expect(basicCannonOffsets(true)).toHaveLength(4)
  })

  it('keeps the MVP trigger timing explicit', () => {
    expect(OVERFLOW_THRESHOLD).toBe(10)
    expect(OVERFLOW_DURATION).toBe(6)
    expect(OVERFLOW_COOLDOWN).toBe(15)
  })
})
