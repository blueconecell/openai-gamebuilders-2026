import { describe, expect, it } from 'vitest'
import { isRunOver, penaltyLines, type RunPenalty } from './penalty'

const penalty: RunPenalty = {
  scrapLost: 7,
  integrityBefore: 3,
  integrityAfter: 2,
  integrityMax: 3,
  partsKept: 2,
}

describe('penaltyLines', () => {
  it('reports the integrity drop, the scrap loss and the kept parts', () => {
    expect(penaltyLines(penalty)).toEqual([
      { label: '선체 무결성', value: '3 → 2 / 3', tone: 'loss' },
      { label: '스크랩 손실', value: '-7', tone: 'loss' },
      { label: '장착 부품', value: '2개 전부 유지', tone: 'keep' },
    ])
  })

  it('stays neutral when nothing was lost', () => {
    const lines = penaltyLines({ ...penalty, scrapLost: 0, integrityAfter: 3 })
    expect(lines[0].tone).toBe('neutral')
    expect(lines[1]).toEqual({ label: '스크랩 손실', value: '없음', tone: 'neutral' })
  })
})

describe('isRunOver', () => {
  it('ends the exploration only when integrity is spent', () => {
    expect(isRunOver(penalty)).toBe(false)
    expect(isRunOver({ ...penalty, integrityAfter: 0 })).toBe(true)
  })
})
