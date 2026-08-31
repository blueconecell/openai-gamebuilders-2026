/**
 * Dev-only harness for the screens at `/src/screens/preview.html`.
 * The `flow` tab drives the real navigation module; the rest mount one screen
 * directly. Not referenced by the app bundle.
 */
import type { ShipPart } from '../game/logic'
import { createScreenFlow, type FlowData } from './flow'
import { createLobbyScreen } from './lobby/lobby'
import { createResultScreen } from './result/result'
import { DEFAULT_SHOP_ITEMS } from './shop/pricing'
import { createShopScreen } from './shop/shop'
import type { ScreenHandle, ShipSlots } from './screen'

const slots: ShipSlots = [
  { kind: 'add', value: 1, mass: 2 } as ShipPart,
  { kind: 'multiply', value: 2, mass: 5 } as ShipPart,
  { kind: 'weapon', weapon: 'homing', mass: 3 } as ShipPart,
  null,
  null,
  null,
]

const gained: ShipPart[] = [
  { kind: 'multiply', value: 2, mass: 5 },
  { kind: 'defense', defense: 'shield', mass: 3 },
]

const data: FlowData = {
  slots,
  scrap: 12,
  discoveries: 3,
  victories: 1,
  canContinue: true,
  items: DEFAULT_SHOP_ITEMS,
}

const root = document.querySelector<HTMLDivElement>('#preview-root')!
const tabs = document.querySelector<HTMLElement>('#preview-tabs')!

let active: ScreenHandle<never> | null = null
let flow: ReturnType<typeof createScreenFlow> | null = null

const teardown = () => {
  active?.destroy()
  active = null
  flow?.destroy()
  flow = null
  root.textContent = ''
}

const screens: Record<string, () => void> = {
  flow: () => {
    flow = createScreenFlow(root, data, {
      onNewRun: () => console.log('new run · 캔버스로 전환'),
      onContinue: () => console.log('continue · 캔버스로 전환'),
      onPurchase: (item) => console.log('buy', item.id),
      onScreenChange: (screen) => console.log('screen →', screen),
    })
    flow.show('lobby')
  },
  lobby: () => mount(createLobbyScreen({
    ...data,
    onNewRun: () => console.log('new run'),
    onContinue: () => console.log('continue'),
    onOpenShop: () => show('shop'),
  }) as ScreenHandle<never>),
  shop: () => mount(createShopScreen({
    slots,
    scrap: 5,
    items: DEFAULT_SHOP_ITEMS,
    delivering: '증폭기 ×2',
    onPurchase: (item) => console.log('buy', item.id),
    onBack: () => show('lobby'),
  }) as ScreenHandle<never>),
  victory: () => mount(createResultScreen({
    outcome: 'victory',
    scrapGained: 25,
    discoveries: 4,
    gained,
    defeated: ['미지 정예기체 // WARDEN', 'MAIN SIGNAL // LIMIT BREAKER'],
    onNewRun: () => console.log('new run'),
    onLobby: () => show('lobby'),
  }) as ScreenHandle<never>),
  defeat: () => mount(createResultScreen({
    outcome: 'defeat',
    scrapGained: 4,
    discoveries: 1,
    defeated: ['미지 정예기체 // WARDEN'],
    onNewRun: () => console.log('new run'),
    onLobby: () => show('lobby'),
  }) as ScreenHandle<never>),
}

function mount(handle: ScreenHandle<never>): void {
  active = handle
  root.appendChild(handle.el)
}

function show(name: keyof typeof screens): void {
  teardown()
  screens[name]()
  for (const button of tabs.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.screen === name))
  }
}

for (const name of Object.keys(screens)) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.screen = name
  button.textContent = name.toUpperCase()
  button.addEventListener('click', () => show(name))
  tabs.appendChild(button)
}

function initial(): keyof typeof screens {
  const requested = new URL(location.href).searchParams.get('screen') ?? ''
  return requested in screens ? requested : 'flow'
}

show(initial())
