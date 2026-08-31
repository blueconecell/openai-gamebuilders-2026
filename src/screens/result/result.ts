import { delegateClicks, element, type ScreenHandle } from '../screen'
import { ensureScreenStyles } from '../styles'
import { isRunOver, penaltyLines, type RunPenalty } from './penalty'

export type ResultProps = {
  outcome: 'victory' | 'defeat'
  scrapGained: number
  /** Enemy or boss names destroyed during the encounter, in kill order. */
  defeated: string[]
  /** Required on defeat: what the respawn costs. Integrity at zero ends the run. */
  penalty?: RunPenalty
  /** Continue the exploration — respawn into the void, or start over once the run is spent. */
  onContinue(): void
  onLobby(): void
}

export function createResultScreen(props: ResultProps): ScreenHandle<ResultProps> {
  ensureScreenStyles()
  let current = props

  const el = element('section', 'gb-screen gb-result')
  el.setAttribute('aria-label', '전투 결과')

  const release = delegateClicks(el, (action) => {
    if (action === 'continue') current.onContinue()
    if (action === 'lobby') current.onLobby()
  })

  const render = () => {
    const won = current.outcome === 'victory'
    const penalty = current.penalty
    const runOver = !won && Boolean(penalty && isRunOver(penalty))
    el.textContent = ''

    const verdict = element('div', `gb-verdict ${won ? 'is-win' : 'is-loss'}`)
    const headline = element('h2')
    headline.textContent = won ? 'OVERFLOW' : runOver ? 'RUN END' : 'CORE BREACH'
    const caption = element('p', 'gb-eyebrow')
    caption.textContent = won
      ? '한계를 돌파했습니다'
      : runOver
        ? '무결성 소진 · 이번 탐험을 종료합니다'
        : '코어가 파손되었습니다 · 공백 공간으로 리스폰합니다'
    verdict.append(headline, caption)

    const stats = element('dl', 'gb-stats')
    stats.append(
      stat('획득 SCRAP', `+${current.scrapGained}`, 'is-amber'),
      stat('격파', `${current.defeated.length}`),
    )
    if (penalty) {
      stats.appendChild(stat(
        '무결성',
        `${penalty.integrityAfter} / ${penalty.integrityMax}`,
        penalty.integrityAfter <= 1 ? 'is-danger' : '',
      ))
    }

    el.append(verdict, stats)
    if (penalty) el.appendChild(penaltyPanel(penalty, runOver))
    el.append(killPanel(current.defeated), actions(won, runOver))
  }

  render()

  return {
    el,
    update(next) {
      current = next
      render()
    },
    destroy() {
      release()
      el.remove()
    },
  }
}

function penaltyPanel(penalty: RunPenalty, runOver: boolean): HTMLElement {
  const panel = element('div', 'gb-panel')
  const title = element('p', 'gb-eyebrow')
  title.textContent = runOver ? '최종 손상 기록' : '리스폰 비용'
  panel.appendChild(title)

  const rows = element('div', 'gb-ship-readout')
  for (const line of penaltyLines(penalty)) {
    const row = element('div', 'gb-readout-row')
    const label = element('span')
    label.textContent = line.label
    const value = element('b', line.tone === 'loss' ? 'is-danger' : line.tone === 'keep' ? 'is-keep' : '')
    value.textContent = line.value
    row.append(label, value)
    rows.appendChild(row)
  }
  panel.appendChild(rows)

  const note = element('p', 'gb-note')
  note.textContent = runOver
    ? '무결성이 모두 소진되어 우주선을 잃었습니다. 발견한 부품은 도감에 남습니다.'
    : '장착한 부품은 하나도 잃지 않습니다. 무결성은 공백 상점의 수리 키트로 회복할 수 있습니다.'
  panel.appendChild(note)
  return panel
}

function killPanel(defeated: string[]): HTMLElement {
  const panel = element('div', 'gb-panel')
  const title = element('p', 'gb-eyebrow')
  title.textContent = '해체한 기체'
  panel.appendChild(title)

  if (!defeated.length) {
    const empty = element('p', 'gb-note')
    empty.textContent = '해체한 기체가 없습니다.'
    panel.appendChild(empty)
    return panel
  }

  const list = element('ul', 'gb-kills')
  for (const name of defeated) {
    const item = element('li')
    item.textContent = name
    list.appendChild(item)
  }
  panel.appendChild(list)
  return panel
}

function actions(won: boolean, runOver: boolean): HTMLElement {
  const wrap = element('div', 'gb-actions is-split')
  const label = won ? '계속 항해' : runOver ? '새 탐사' : '공백으로 귀환'
  const hint = won ? 'CONTINUE' : runOver ? 'NEW RUN' : 'RESPAWN'
  wrap.append(
    button('continue', label, hint, 'is-primary'),
    button('lobby', '로비로', 'LOBBY'),
  )
  return wrap
}

function stat(label: string, value: string, modifier = ''): HTMLElement {
  const wrap = element('div', 'gb-stat')
  const term = element('dt')
  term.textContent = label
  const detail = element('dd', modifier)
  detail.textContent = value
  wrap.append(term, detail)
  return wrap
}

function button(action: string, label: string, hint: string, modifier = ''): HTMLButtonElement {
  const el = element('button', `gb-button ${modifier}`.trim())
  el.type = 'button'
  el.dataset.action = action
  const text = element('span')
  text.textContent = label
  const note = element('i')
  note.textContent = hint
  el.append(text, note)
  return el
}
