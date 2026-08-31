import { delegateClicks, element, type ScreenHandle } from '../screen'
import { ensureScreenStyles } from '../styles'

export type ResultProps = {
  outcome: 'victory' | 'defeat'
  scrapGained: number
  /** Enemy or boss names destroyed during the encounter, in kill order. */
  defeated: string[]
  onRetry(): void
  onLobby(): void
}

export function createResultScreen(props: ResultProps): ScreenHandle<ResultProps> {
  ensureScreenStyles()
  let current = props

  const el = element('section', 'gb-screen gb-result')
  el.setAttribute('aria-label', '전투 결과')

  const release = delegateClicks(el, (action) => {
    if (action === 'retry') current.onRetry()
    if (action === 'lobby') current.onLobby()
  })

  const render = () => {
    const won = current.outcome === 'victory'
    el.textContent = ''

    const verdict = element('div', `gb-verdict ${won ? 'is-win' : 'is-loss'}`)
    const headline = element('h2')
    headline.textContent = won ? 'OVERFLOW' : 'CORE LOST'
    const caption = element('p', 'gb-eyebrow')
    caption.textContent = won ? '한계를 돌파했습니다' : '핵심 코어가 파괴되었습니다'
    verdict.append(headline, caption)

    const stats = element('dl', 'gb-stats')
    stats.append(
      stat('획득 SCRAP', `+${current.scrapGained}`, true),
      stat('격파', `${current.defeated.length}`),
    )

    const panel = element('div', 'gb-panel')
    const panelTitle = element('p', 'gb-eyebrow')
    panelTitle.textContent = '해체한 기체'
    panel.appendChild(panelTitle)

    if (current.defeated.length) {
      const list = element('ul', 'gb-kills')
      for (const name of current.defeated) {
        const item = element('li')
        item.textContent = name
        list.appendChild(item)
      }
      panel.appendChild(list)
    } else {
      const empty = element('p', 'gb-note')
      empty.textContent = '해체한 기체가 없습니다.'
      panel.appendChild(empty)
    }

    const actions = element('div', 'gb-actions is-split')
    actions.append(
      button('retry', '재도전', 'RETRY', won ? '' : 'is-primary'),
      button('lobby', '로비로', 'LOBBY', won ? 'is-primary' : ''),
    )

    el.append(verdict, stats, panel, actions)
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

function stat(label: string, value: string, amber = false): HTMLElement {
  const wrap = element('div', 'gb-stat')
  const term = element('dt')
  term.textContent = label
  const detail = element('dd', amber ? 'is-amber' : '')
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
