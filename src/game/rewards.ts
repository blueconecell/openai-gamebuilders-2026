import { calculateMass, calculatePower, type ShipPart } from './logic'

export type PartPreview = {
  fireBefore: number
  fireAfter: number
  massBefore: number
  massAfter: number
  overloaded: boolean
  canAttach: boolean
}

export function previewPart(slots: Array<ShipPart | null>, part: ShipPart, unlockedSockets: number): PartPreview {
  const fireBefore = calculatePower(2, slots)
  const massBefore = calculateMass(slots)
  const target = slots.findIndex((slot, index) => !slot && index < unlockedSockets)
  const previewSlots = slots.map((slot, index) => index === target ? part : slot)
  const massAfter = massBefore + part.mass
  return {
    fireBefore,
    fireAfter: target < 0 ? fireBefore : calculatePower(2, previewSlots),
    massBefore,
    massAfter,
    overloaded: massAfter > 6,
    canAttach: target >= 0,
  }
}

export function rollRewardChoices<T>(pool: readonly T[], count: number, random = Math.random): T[] {
  const remaining = [...pool]
  const choices: T[] = []
  while (choices.length < count && remaining.length > 0) {
    const index = Math.min(remaining.length - 1, Math.floor(random() * remaining.length))
    choices.push(remaining.splice(index, 1)[0])
  }
  return choices
}

export function rewardScrapValue(part: ShipPart): number {
  if (part.kind === 'multiply') return 6
  if (part.kind === 'weapon' || part.kind === 'defense') return 5
  return 4
}
