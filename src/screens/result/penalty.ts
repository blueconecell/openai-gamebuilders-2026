/**
 * Defeat no longer ends the exploration: the pilot respawns in the void with
 * every part still attached. The run only ends when hull integrity hits zero,
 * so integrity is what carries the roguelike tension.
 *
 * The game session owns these numbers; the result screen only renders them.
 */
export type RunPenalty = {
  scrapLost: number
  integrityBefore: number
  integrityAfter: number
  integrityMax: number
  /** Parts still installed after respawn — always kept, shown to reassure. */
  partsKept: number
}

export type PenaltyLine = {
  label: string
  value: string
  tone: 'loss' | 'keep' | 'neutral'
}

export function penaltyLines(penalty: RunPenalty): PenaltyLine[] {
  return [
    {
      label: '선체 무결성',
      value: `${penalty.integrityBefore} → ${penalty.integrityAfter} / ${penalty.integrityMax}`,
      tone: penalty.integrityAfter < penalty.integrityBefore ? 'loss' : 'neutral',
    },
    {
      label: '스크랩 손실',
      value: penalty.scrapLost > 0 ? `-${penalty.scrapLost}` : '없음',
      tone: penalty.scrapLost > 0 ? 'loss' : 'neutral',
    },
    {
      label: '장착 부품',
      value: `${penalty.partsKept}개 전부 유지`,
      tone: 'keep',
    },
  ]
}

export function isRunOver(penalty: RunPenalty): boolean {
  return penalty.integrityAfter <= 0
}
