import { describe, expect, it } from 'vitest'
import { DEFAULT_SHOP_ITEMS, canPurchase, previewPurchase } from './pricing'
import type { ShipSlots } from '../screen'

const [amplifier, frame, homing] = DEFAULT_SHOP_ITEMS

function slots(...parts: ShipSlots): ShipSlots {
  return Array.from({ length: 6 }, (_, index) => parts[index] ?? null)
}

describe('previewPurchase', () => {
  it('projects an operator part into the first open socket', () => {
    const preview = previewPurchase(amplifier, slots({ kind: 'add', value: 1, mass: 2 }), 10)

    expect(preview.power).toEqual({ before: 3, after: 6, delta: 3 })
    expect(preview.mass).toEqual({ before: 2, after: 7, delta: 5 })
    expect(preview.massLimit).toEqual({ before: 6, after: 6 })
    expect(preview.scrapAfter).toBe(4)
    expect(canPurchase(preview)).toBe(true)
  })

  it('leaves firepower flat for a weapon but still adds its mass', () => {
    const preview = previewPurchase(homing, slots({ kind: 'add', value: 1, mass: 2 }), 10)

    expect(preview.power.delta).toBe(0)
    expect(preview.mass.delta).toBe(3)
    expect(preview.sockets).toEqual({ before: 4, after: 4 })
  })

  it('opens one more socket when a body part is installed', () => {
    const preview = previewPurchase(frame, slots(), 10)
    expect(preview.sockets).toEqual({ before: 4, after: 5 })
    expect(preview.massLimit).toEqual({ before: 6, after: 12 })
  })

  it('blocks the purchase when scrap is short or no unlocked socket is free', () => {
    expect(canPurchase(previewPurchase(amplifier, slots(), 5))).toBe(false)

    const add = { kind: 'add', value: 1, mass: 2 } as const
    const full = slots(add, add, add, add)
    const preview = previewPurchase(amplifier, full, 99)
    expect(preview.hasRoom).toBe(false)
    expect(preview.power.delta).toBe(0)
    expect(canPurchase(preview)).toBe(false)
  })

  it('ignores sockets that no body part has unlocked yet', () => {
    const add = { kind: 'add', value: 1, mass: 2 } as const
    // Sockets 5 and 6 stay locked, so four filled slots means the hull is full.
    expect(previewPurchase(homing, slots(add, add, add, add), 99).hasRoom).toBe(false)
  })
})
