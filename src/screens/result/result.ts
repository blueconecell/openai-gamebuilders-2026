import type { ShipPart } from '../../game/logic'
import {
  createHelp,
  delegateClicks,
  element,
  partColor,
  partKindLabel,
  partLabel,
  type ScreenHandle,
} from '../screen'
import { ensureScreenStyles } from '../styles'

export type ResultProps = {
  /**
   * Losing the core ends the exploration outright — there is no respawn and no
   * spare life, so a defeat result is always terminal.
   */
  outcome: 'victory' | 'defeat'
  scrapGained: number
  /** Enemy or boss names destroyed during the exploration, in kill order. */
  defeated: string[]
  discoveries: number
  /** Parts recovered during this exploration, in pickup order. */
  gained?: ShipPart[]
  /** Overrides the built-in explainer copy. */
  help?: string[]
  onNewRun(): void
  onLobby(): void
}

const VICTORY_HELP = [
  'LIMIT 신호를 돌파하면 다음 항로의 좌표를 얻습니다.',
  '획득한 스크랩은 다음 탐험의 공백 상점에서 그대로 사용할 수 있습니다.',
  '발견 기록은 부품 도감에 남습니다.',
]

const DEFEAT_HELP = [
  '핵심 코어가 파괴되면 우주선 전체가 폭파되고 탐험이 즉시 종료됩니다.',
  '외부 부품은 개별적으로 떨어져 나가지만, 코어는 하나뿐입니다.',
  '장갑과 몸체 부품으로 코어를 감싸는 배치가 생존을 좌우합니다.',
  '이번 탐험에서 획득한 스크랩과 발견 기록은 그대로 남습니다.',
]

export function createResultScreen(props: ResultProps): ScreenHandle<ResultProps> {
  ensureScreenStyles()
  let current = props

  const el = element('section', 'gb-screen gb-result')
  el.setAttribute('aria-label', '탐험 결과')

  const release = delegateClicks(el, (action) => {
    if (action === 'new-run') current.onNewRun()
    if (action === 'lobby') current.onLobby()
  })

  const render = () => {
    const won = current.outcome === 'victory'
    el.textContent = ''

    const verdict = element('div', `gb-verdict ${won ? 'is-win' : 'is-loss'}`)
    const headline = element('h2')
    headline.textContent = won ? 'OVERFLOW' : 'CORE LOST'
    const caption = element('p', 'gb-eyebrow')
    caption.textContent = won
      ? 'LIMIT 신호를 돌파했습니다'
      : '핵심 코어가 파괴되어 탐험이 종료되었습니다'
    verdict.append(headline, caption)

    const stats = element('dl', 'gb-stats')
    stats.append(
      stat('획득 SCRAP', `+${current.scrapGained}`, 'is-amber'),
      stat('격파', `${current.defeated.length}`),
      stat('발견', `${current.discoveries}`),
    )

    const actions = element('div', 'gb-actions is-split')
    actions.append(
      button('new-run', '새 탐사', 'NEW RUN', 'is-primary'),
      button('lobby', '로비로', 'LOBBY'),
    )

    const help = current.help ?? (won ? VICTORY_HELP : DEFEAT_HELP)
    el.append(verdict, stats)
    if (current.gained?.length) el.appendChild(gainedPanel(current.gained))
    el.append(killPanel(current.defeated), createHelp('결과 읽는 법', help), actions)
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

/** Recovered parts, so the pilot sees what the exploration actually paid out. */
function gainedPanel(gained: ShipPart[]): HTMLElement {
  const panel = element('div', 'gb-panel')
  const title = element('p', 'gb-eyebrow')
  title.textContent = '회수한 부품'
  panel.appendChild(title)

  const list = element('div', 'gb-gained')
  for (const part of gained) {
    const chip = element('span', 'gb-chip')
    chip.style.color = partColor(part)
    chip.style.borderColor = partColor(part)
    chip.textContent = `${partKindLabel(part)} · ${partLabel(part)}`
    list.appendChild(chip)
  }
  panel.appendChild(list)
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
