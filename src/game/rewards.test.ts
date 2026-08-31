import { describe, expect, it } from 'vitest'
import { previewPart, rewardScrapValue, rollRewardChoices } from './rewards'
import type { ShipPart } from './logic'

const addThree: ShipPart = { kind: 'add', value: 3, mass: 3 }
const timesTwo: ShipPart = { kind: 'multiply', value: 2, mass: 5 }
const body: ShipPart = { kind: 'body', mass: 2 }

describe('reward choices', () => {
  it('rolls unique choices from the available pool', () => {
    expect(rollRewardChoices([addThree, timesTwo, body], 3, () => 0)).toEqual([addThree, timesTwo, body])
  })

  it('previews fire, mass, and overload before attachment', () => {
    expect(previewPart([addThree, null], timesTwo, 2)).toEqual({
      fireBefore: 5,
      fireAfter: 10,
      massBefore: 3,
      massAfter: 8,
      overloaded: true,
      canAttach: true,
    })
  })

  it('keeps body separate from fire multiplication', () => {
    expect(previewPart([addThree, null], body, 2).fireAfter).toBe(5)
    expect(rewardScrapValue(timesTwo)).toBe(6)
  })
})
