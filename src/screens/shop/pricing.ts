import { calculateMass, calculateMassLimit, calculatePower, firstOpenSocket, type ShipPart } from '../../game/logic'
import { unlockedSockets, type ShipSlots } from '../screen'

export type ShopItem = {
  id: string
  name: string
  detail: string
  cost: number
  part: ShipPart
}

export type PurchasePreview = {
  affordable: boolean
  /** False when every unlocked socket is already filled. */
  hasRoom: boolean
  scrapAfter: number
  /** Only operator parts move firepower; weapons and armour leave it flat. */
  power: { before: number; after: number; delta: number }
  mass: { before: number; after: number; delta: number }
  massLimit: { before: number; after: number }
  /** Body parts open an extra socket, so the count can grow on purchase. */
  sockets: { before: number; after: number }
}

export const DEFAULT_SHOP_ITEMS: ShopItem[] = [
  {
    id: 'amplifier',
    name: '증폭기 ×2',
    detail: '앞선 연산 화력을 두 배로 증폭합니다. 무게가 큽니다.',
    cost: 6,
    part: { kind: 'multiply', value: 2, mass: 5 },
  },
  {
    id: 'frame',
    name: '확장 프레임',
    detail: '주변에 연결 소켓 3개를 열고 질량 한도를 6 늘립니다.',
    cost: 5,
    part: { kind: 'body', mass: 4 },
  },
  {
    id: 'homing',
    name: '유도탄 발사기',
    detail: '느린 주기로 강하게 유도되는 무기를 장착합니다.',
    cost: 4,
    part: { kind: 'weapon', weapon: 'homing', mass: 3 },
  },
]

export function previewPurchase(
  item: ShopItem,
  slots: ShipSlots,
  scrap: number,
): PurchasePreview {
  const powerBefore = calculatePower(2, slots)
  const massBefore = calculateMass(slots)
  const massLimitBefore = calculateMassLimit(slots)
  const socketsBefore = unlockedSockets(slots)

  // The shop can only estimate: the pilot picks the real socket in the hangar.
  const openSocket = firstOpenSocket(slots, item.part)
  const hasRoom = openSocket >= 0

  const projected = [...slots]
  if (hasRoom) projected[openSocket] = item.part

  const powerAfter = calculatePower(2, projected)
  const massAfter = calculateMass(projected)

  return {
    affordable: scrap >= item.cost,
    hasRoom,
    scrapAfter: Math.max(0, scrap - item.cost),
    power: { before: powerBefore, after: powerAfter, delta: powerAfter - powerBefore },
    mass: { before: massBefore, after: massAfter, delta: massAfter - massBefore },
    massLimit: { before: massLimitBefore, after: calculateMassLimit(projected) },
    sockets: { before: socketsBefore, after: unlockedSockets(projected) },
  }
}

export function canPurchase(preview: PurchasePreview): boolean {
  return preview.affordable && preview.hasRoom
}
