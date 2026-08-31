export const OVERFLOW_THRESHOLD = 10
export const OVERFLOW_DURATION = 6
export const OVERFLOW_COOLDOWN = 15
export const COMBAT_CLEAR_DURATION = 1.2

export type CombatPhase = 'elite' | 'boss'

export function resolvedCombatPhase(
  phase: string,
  modules: ReadonlyArray<{ kind: string; hp: number }>,
): CombatPhase | null {
  if (phase !== 'elite' && phase !== 'boss') return null
  const core = modules.find((module) => module.kind === 'core')
  return core && core.hp <= 0 ? phase : null
}

export function basicCannonOffsets(overflowActive: boolean): number[] {
  return overflowActive ? [-1.5, -0.5, 0.5, 1.5] : [-1, 1]
}
