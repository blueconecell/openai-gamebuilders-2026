import { describe, expect, it } from 'vitest'
import { DEFAULT_SHOP_ITEMS, canPurchase, previewPurchase } from './pricing'
import type { ShipSlots } from '../screen'

const amplifier = DEFAULT_SHOP_ITEMS[0]
const repairKit = DEFAULT_SHOP_ITEMS[2]

describe('previewPurchase', () => {
  it('projects the part into the first open socket', () => {
    const slots: ShipSlots = [{ kind: 'add', value: 1, mass: 2 }, null, null, null]
    const preview = previewPurchase(amplifier, slots, 10)

    expect(preview.power).toEqual({ before: 3, after: 6, delta: 3 })
    expect(preview.mass).toEqual({ before: 2, after: 7, delta: 5 })
    expect(preview.scrapAfter).toBe(4)
    expect(canPurchase(preview)).toBe(true)
  })

  it('blocks the purchase when scrap is short or every socket is full', () => {
    const empty: ShipSlots = [null, null, null, null]
    expect(canPurchase(previewPurchase(amplifier, empty, 5))).toBe(false)

    const full: ShipSlots = Array.from({ length: 4 }, () => ({ kind: 'add', value: 1, mass: 2 } as const))
    const preview = previewPurchase(amplifier, full, 99)
    expect(preview.hasRoom).toBe(false)
    expect(preview.power.delta).toBe(0)
    expect(canPurchase(preview)).toBe(false)
  })

  it('leaves the hull untouched for goods that take no socket', () => {
    const full: ShipSlots = Array.from({ length: 4 }, () => ({ kind: 'add', value: 1, mass: 2 } as const))
    const preview = previewPurchase(repairKit, full, 3)

    expect(preview.hasRoom).toBe(true)
    expect(preview.power.delta).toBe(0)
    expect(preview.mass.delta).toBe(0)
    expect(canPurchase(preview)).toBe(true)
  })
})
