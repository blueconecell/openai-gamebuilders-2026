import { delegateClicks, element, type ScreenHandle, type ShipSlots } from '../screen'
import { ensureScreenStyles } from '../styles'
import { createShipPreview, shipSummary } from './ship-preview'

export type LobbyProps = {
  slots: ShipSlots
  scrap: number
  discoveries: number
  victories: number
  /** A saved run exists; when absent 이어하기 is unavailable. */
  canContinue: boolean
  onNewRun(): void
  onContinue(): void
  onOpenShop(): void
}

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
      readoutRow('소켓', `${ship.installed} / ${current.slots.length}`),
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

    el.append(head, hangar, stats, actions)
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
