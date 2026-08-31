/**
 * Dev-only harness for eyeballing the screens in isolation at
 * `/src/screens/preview.html`. Not referenced by the app bundle.
 */
import type { ShipPart } from '../game/logic'
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

const root = document.querySelector<HTMLDivElement>('#preview-root')!
const tabs = document.querySelector<HTMLElement>('#preview-tabs')!

const screens: Record<string, () => ScreenHandle<never>> = {
  lobby: () => createLobbyScreen({
    slots,
    scrap: 12,
    discoveries: 3,
    victories: 1,
    canContinue: true,
    onNewRun: () => console.log('new run'),
    onContinue: () => console.log('continue'),
    onOpenShop: () => show('shop'),
  }) as ScreenHandle<never>,
  shop: () => createShopScreen({
    slots,
    scrap: 5,
    items: DEFAULT_SHOP_ITEMS,
    delivering: '증폭기 ×2',
    onPurchase: (item) => console.log('buy', item.id),
    onBack: () => show('lobby'),
  }) as ScreenHandle<never>,
  victory: () => createResultScreen({
    outcome: 'victory',
    scrapGained: 18,
    discoveries: 4,
    defeated: ['미지 정예기체 // WARDEN', 'MAIN SIGNAL // LIMIT BREAKER'],
    onNewRun: () => console.log('new run'),
    onLobby: () => show('lobby'),
  }) as ScreenHandle<never>,
  defeat: () => createResultScreen({
    outcome: 'defeat',
    scrapGained: 4,
    discoveries: 1,
    defeated: ['미지 정예기체 // WARDEN'],
    onNewRun: () => console.log('new run'),
    onLobby: () => show('lobby'),
  }) as ScreenHandle<never>,
}

let active: ScreenHandle<never> | null = null

function show(name: keyof typeof screens): void {
  active?.destroy()
  active = screens[name]()
  root.appendChild(active.el)
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
  return requested in screens ? requested : 'lobby'
}

show(initial())
