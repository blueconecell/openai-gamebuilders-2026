import { calculateMass, calculatePower, type OperatorPart } from '../../game/logic'
import type { ShipSlots } from '../screen'

export type ShopItem = {
  id: string
  name: string
  detail: string
  cost: number
  /** Present when the goods occupy an operator socket. */
  part?: OperatorPart
  /** Hull integrity restored on delivery — the currency that buys back a respawn. */
  integrity?: number
}

export type PurchasePreview = {
  affordable: boolean
  /** False when every operator socket is already filled. */
  hasRoom: boolean
  scrapAfter: number
  power: { before: number; after: number; delta: number }
  mass: { before: number; after: number; delta: number }
}

export const DEFAULT_SHOP_ITEMS: ShopItem[] = [
  {
    id: 'amplifier',
    name: '증폭기 ×2',
    detail: '코어 출력을 두 배로 증폭합니다. 무게가 큽니다.',
    cost: 6,
    part: { kind: 'multiply', value: 2, mass: 5 },
  },
  {
    id: 'booster',
    name: '가산기 +3',
    detail: '안정적으로 화력을 더합니다. 가벼운 편입니다.',
    cost: 4,
    part: { kind: 'add', value: 3, mass: 3 },
  },
  {
    id: 'repair-kit',
    name: '수리 키트',
    detail: '손상된 선체를 복구해 무결성을 1 회복합니다. 소켓을 쓰지 않습니다.',
    cost: 3,
    integrity: 1,
  },
]

export function previewPurchase(
  item: ShopItem,
  slots: ShipSlots,
  scrap: number,
): PurchasePreview {
  const powerBefore = calculatePower(2, slots)
  const massBefore = calculateMass(slots)
  const openSocket = slots.findIndex((slot) => !slot)
  const hasRoom = !item.part || openSocket >= 0

  const projected = item.part && openSocket >= 0
    ? slots.map((slot, index) => (index === openSocket ? item.part! : slot))
    : slots

  const powerAfter = calculatePower(2, projected)
  const massAfter = calculateMass(projected)

  return {
    affordable: scrap >= item.cost,
    hasRoom,
    scrapAfter: Math.max(0, scrap - item.cost),
    power: { before: powerBefore, after: powerAfter, delta: powerAfter - powerBefore },
    mass: { before: massBefore, after: massAfter, delta: massAfter - massBefore },
  }
}

export function canPurchase(preview: PurchasePreview): boolean {
  return preview.affordable && preview.hasRoom
}
