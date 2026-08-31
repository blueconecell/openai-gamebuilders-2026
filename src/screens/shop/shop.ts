import {
  createHelp,
  delegateClicks,
  element,
  formatSigned,
  partColor,
  partKindLabel,
  partLabel,
  type ScreenHandle,
  type ShipSlots,
} from '../screen'
import { ensureScreenStyles } from '../styles'
import { canPurchase, previewPurchase, type PurchasePreview, type ShopItem } from './pricing'

export type ShopProps = {
  slots: ShipSlots
  scrap: number
  items: ShopItem[]
  /** Set while a warp capsule is inbound so the screen can show the delivery notice. */
  delivering?: string
  /** Overrides the built-in explainer copy. */
  help?: string[]
  onPurchase(item: ShopItem): void
  onBack(): void
}

const SHOP_HELP = [
  '스크랩은 적 부품을 해체하거나 필요 없는 부품을 분해해서 모읍니다.',
  '화력은 +, × 증강 부품만 바꿉니다. 무기와 방어 부품은 화력 수치를 올리지 않습니다.',
  '모든 부품은 질량을 늘립니다. 무거워질수록 이동과 회전이 느려집니다.',
  '표시된 변화값은 빈 소켓 하나에 장착했을 때의 예상치입니다. 실제 장착 위치는 격납고에서 정합니다.',
  '구매한 부품은 배송 캡슐이 워프해 우주선 근처에 도착한 뒤 자동으로 열립니다.',
]

export function createShopScreen(props: ShopProps): ScreenHandle<ShopProps> {
  ensureScreenStyles()
  let current = props

  const el = element('section', 'gb-screen gb-shop')
  el.setAttribute('aria-label', '공백 상점')

  const release = delegateClicks(el, (action, trigger) => {
    if (action === 'back') {
      current.onBack()
      return
    }
    if (action !== 'buy') return
    const item = current.items.find((candidate) => candidate.id === trigger.dataset.item)
    if (!item) return
    if (!canPurchase(previewPurchase(item, current.slots, current.scrap))) return
    current.onPurchase(item)
  })

  const render = () => {
    el.textContent = ''

    const head = element('header')
    const eyebrow = element('p', 'gb-eyebrow')
    eyebrow.textContent = '공백 상점 · 클로킹 중'
    const title = element('h2', 'gb-heading')
    title.textContent = '보급 단말'
    head.append(eyebrow, title)

    const stats = element('dl', 'gb-stats')
    stats.append(statBlock('보유 SCRAP', `${current.scrap}`, 'is-amber'))

    const note = element('p', 'gb-note')
    note.textContent = '구매한 물품은 인벤토리로 들어오지 않습니다. 배송 캡슐이 워프해 우주선 근처에 도착하고 즉시 열립니다.'

    const goods = element('div', 'gb-goods')
    for (const item of current.items) {
      goods.appendChild(goodCard(item, previewPurchase(item, current.slots, current.scrap)))
    }

    const actions = element('div', 'gb-actions')
    actions.appendChild(backButton())

    el.append(head, stats, note)
    if (current.delivering) el.appendChild(deliveryBanner(current.delivering))
    el.append(goods, createHelp('구매 전에 알아둘 것', current.help ?? SHOP_HELP), actions)
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

function goodCard(item: ShopItem, preview: PurchasePreview): HTMLElement {
  const purchasable = canPurchase(preview)
  const card = element('article', `gb-good ${purchasable ? '' : 'is-locked'}`.trim())

  const header = element('header')
  const name = element('h3')
  name.textContent = item.name
  const cost = element('span', `gb-cost ${preview.affordable ? '' : 'is-short'}`.trim())
  cost.textContent = `${item.cost} SCRAP`
  header.append(name, cost)

  const tag = element('span', 'gb-tag')
  tag.textContent = `${partKindLabel(item.part)} · ${partLabel(item.part)}`
  tag.style.color = partColor(item.part)
  tag.style.borderColor = partColor(item.part)

  const detail = element('p', 'gb-note')
  detail.textContent = item.detail

  const delta = element('div', 'gb-delta')
  delta.appendChild(deltaRow(
    '화력',
    `${preview.power.before} → ${preview.power.after}`,
    preview.power.delta ? formatSigned(preview.power.delta) : '변화 없음',
    preview.power.delta ? 'is-amber' : '',
  ))
  delta.appendChild(deltaRow(
    '질량',
    `${preview.mass.before} → ${preview.mass.after}`,
    formatSigned(preview.mass.delta),
    'is-danger',
  ))
  if (preview.sockets.after !== preview.sockets.before) {
    delta.appendChild(deltaRow(
      '소켓',
      `${preview.sockets.before} → ${preview.sockets.after}`,
      formatSigned(preview.sockets.after - preview.sockets.before),
      '',
    ))
  }

  const buy = element('button', 'gb-button is-primary')
  buy.type = 'button'
  buy.dataset.action = 'buy'
  buy.dataset.item = item.id
  buy.disabled = !purchasable
  const buyLabel = element('span')
  buyLabel.textContent = purchasable ? '구매' : preview.affordable ? '빈 소켓 없음' : '스크랩 부족'
  const buyHint = element('i')
  buyHint.textContent = purchasable ? `잔여 ${preview.scrapAfter}` : ''
  buy.append(buyLabel, buyHint)

  card.append(header, tag, detail, delta, buy)
  return card
}

function deltaRow(label: string, value: string, change: string, modifier = ''): HTMLElement {
  const row = element('span')
  const name = element('span')
  name.textContent = `${label} `
  const readout = element('b', modifier)
  readout.textContent = `${value}  ${change}`
  row.append(name, readout)
  return row
}

function statBlock(label: string, value: string, modifier = ''): HTMLElement {
  const wrap = element('div', 'gb-stat')
  const term = element('dt')
  term.textContent = label
  const detail = element('dd', modifier)
  detail.textContent = value
  wrap.append(term, detail)
  return wrap
}

function deliveryBanner(name: string): HTMLElement {
  const banner = element('p', 'gb-banner')
  banner.textContent = `배송 캡슐 워프 중 · ${name}`
  return banner
}

function backButton(): HTMLButtonElement {
  const back = element('button', 'gb-button')
  back.type = 'button'
  back.dataset.action = 'back'
  const label = element('span')
  label.textContent = '돌아가기'
  const hint = element('i')
  hint.textContent = 'BACK'
  back.append(label, hint)
  return back
}
