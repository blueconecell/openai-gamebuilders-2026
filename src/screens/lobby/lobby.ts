import { createHelp, delegateClicks, element, type ScreenHandle, type ShipSlots } from '../screen'
import { ensureScreenStyles } from '../styles'
import { createShipPreview, shipSummary } from './ship-preview'

export type LobbyProps = {
  slots: ShipSlots
  scrap: number
  discoveries: number
  victories: number
  /** A saved run exists; when absent 이어하기 is unavailable. */
  canContinue: boolean
  /** Overrides the built-in explainer copy. */
  help?: string[]
  onNewRun(): void
  onContinue(): void
  onOpenShop(): void
}

const LOBBY_HELP = [
  '격납고에서 현재 우주선의 화력, 질량, 소켓 상태를 확인합니다.',
  '화력은 +, × 증강 부품의 연결 순서로 결정됩니다.',
  '질량이 커지면 이동과 회전이 느려집니다. 과적을 주의하세요.',
  '몸체(BODY) 부품을 장착하면 소켓이 하나씩 더 열립니다.',
  '이어하기는 공백 공간에서 클로킹으로 저장된 탐험이 있을 때만 활성화됩니다.',
]

export function createLobbyScreen(props: LobbyProps): ScreenHandle<LobbyProps> {
  ensureScreenStyles()
  let current = props

  const el = element('section', 'gb-screen gb-lobby')
  el.setAttribute('aria-label', '로비')

  const release = delegateClicks(el, (action) => {
    if (action === 'new-run') current.onNewRun()
    if (action === 'continue') current.onContinue()
    if (action === 'shop') current.onOpenShop()
  })

  const render = () => {
    const ship = shipSummary(current.slots)
    el.textContent = ''

    const head = element('header')
    const eyebrow = element('p', 'gb-eyebrow')
    eyebrow.textContent = 'GB//26 · GO LIMITLESS'
    const title = element('h1', 'gb-title')
    title.innerHTML = 'OVERFLOW<span>:</span> FAR SPACE'
    head.append(eyebrow, title)

    const hangar = element('div', 'gb-panel gb-ship')
    hangar.appendChild(createShipPreview(current.slots))
    const readout = element('div', 'gb-ship-readout')
    readout.append(
      readoutRow('화력', `${ship.power}`, ship.power >= 10 ? 'is-amber' : ''),
      readoutRow('질량', `${ship.mass}`, ship.overloaded ? 'is-danger' : ''),
      readoutRow('소켓', `${ship.installed} / ${ship.unlocked}`),
      readoutRow('무장', `무기 ${ship.weapons} · 방어 ${ship.defenses}`),
      readoutRow('상태', ship.overloaded ? '과적' : '안정', ship.overloaded ? 'is-danger' : ''),
    )
    hangar.appendChild(readout)

    const stats = element('dl', 'gb-stats')
    stats.append(
      stat('SCRAP', `${current.scrap}`, true),
      stat('발견', `${current.discoveries}`),
      stat('돌파', `${current.victories}`),
    )

    const actions = element('div', 'gb-actions')
    actions.append(
      button('new-run', '새 탐사', 'NEW RUN', 'is-primary'),
      button('continue', '이어하기', current.canContinue ? 'CLOAKED' : 'NO SIGNAL', '', !current.canContinue),
      button('shop', '공백 상점', `SCRAP ${current.scrap}`),
    )

    el.append(head, hangar, stats, createHelp('이 화면은?', current.help ?? LOBBY_HELP), actions)
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

function readoutRow(label: string, value: string, modifier = ''): HTMLElement {
  const row = element('div', 'gb-readout-row')
  const name = element('span')
  name.textContent = label
  const readout = element('b', modifier)
  readout.textContent = value
  row.append(name, readout)
  return row
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

function button(
  action: string,
  label: string,
  hint: string,
  modifier = '',
  disabled = false,
): HTMLButtonElement {
  const el = element('button', `gb-button ${modifier}`.trim())
  el.type = 'button'
  el.dataset.action = action
  el.disabled = disabled
  const text = element('span')
  text.textContent = label
  const note = element('i')
  note.textContent = hint
  el.append(text, note)
  return el
}
