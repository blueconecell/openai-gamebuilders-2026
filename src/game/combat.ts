export const OVERFLOW_THRESHOLD = 10
export const OVERFLOW_DURATION = 6
export const OVERFLOW_COOLDOWN = 15

export function basicCannonOffsets(overflowActive: boolean): number[] {
  return overflowActive ? [-1.5, -0.5, 0.5, 1.5] : [-1, 1]
}
