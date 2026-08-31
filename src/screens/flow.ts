import { createLobbyScreen } from './lobby/lobby'
import { nextScreen, type ScreenName } from './navigation'
import { createResultScreen, type ResultProps } from './result/result'
import type { ScreenHandle, ShipSlots } from './screen'
import { DEFAULT_SHOP_ITEMS, type ShopItem } from './shop/pricing'
import { createShopScreen } from './shop/shop'
import { ensureScreenStyles } from './styles'

/** Everything the menus render. The host owns it; the flow only reads it. */
export type FlowData = {
  slots: ShipSlots
  scrap: number
  discoveries: number
  victories: number
  /** A cloaked run exists to resume. */
  canContinue: boolean
  /** Name of an inbound warp capsule, shown in the shop while it travels. */
  delivering?: string
  items?: ShopItem[]
}

export type ResultSummary = Omit<ResultProps, 'onNewRun' | 'onLobby'>

export type FlowCallbacks = {
  /** Start a fresh exploration — the host should hide the menus. */
  onNewRun(): void
  /** Resume the cloaked run — the host should hide the menus. */
  onContinue(): void
  onPurchase(item: ShopItem): void
  /** Fired whenever the visible screen changes, including on hide. */
  onScreenChange?(screen: ScreenName | null): void
}

export type ScreenFlow = {
  /** Show a menu screen, mounting the flow if it was hidden. */
  show(screen: ScreenName): void
  /** Show the result screen for a finished exploration. */
  showResult(summary: ResultSummary): void
  /** Unmount every menu so the canvas is visible again. */
  hide(): void
  /** Push new data into whichever screen is mounted. */
  setData(data: FlowData): void
  readonly screen: ScreenName | null
  destroy(): void
}

/**
 * Owns navigation between the three menu screens and mounts exactly one of them
 * into `container`. Game actions are handed back through callbacks — the flow
 * never touches game state or storage.
 */
export function createScreenFlow(
  container: HTMLElement,
  data: FlowData,
  callbacks: FlowCallbacks,
): ScreenFlow {
  ensureScreenStyles()

  let current: FlowData = data
  let screen: ScreenName | null = null
  let result: ResultSummary | null = null
  let handle: ScreenHandle<never> | null = null

  const unmount = () => {
    handle?.destroy()
    handle = null
  }

  const go = (next: ScreenName | null) => {
    if (next === screen) return
    unmount()
    screen = next
    if (next) {
      handle = build(next)
      container.appendChild(handle.el)
    }
    callbacks.onScreenChange?.(screen)
  }

  const navigate = (action: Parameters<typeof nextScreen>[1]) => {
    if (!screen) return
    const next = nextScreen(screen, action)
    if (next === null) {
      go(null)
      return
    }
    go(next)
  }

  const build = (name: ScreenName): ScreenHandle<never> => {
    if (name === 'lobby') {
      return createLobbyScreen({
        slots: current.slots,
        scrap: current.scrap,
        discoveries: current.discoveries,
        victories: current.victories,
        canContinue: current.canContinue,
        onNewRun: () => {
          navigate('enter-game')
          callbacks.onNewRun()
        },
        onContinue: () => {
          navigate('enter-game')
          callbacks.onContinue()
        },
        onOpenShop: () => navigate('open-shop'),
      }) as ScreenHandle<never>
    }

    if (name === 'shop') {
      return createShopScreen({
        slots: current.slots,
        scrap: current.scrap,
        items: current.items ?? DEFAULT_SHOP_ITEMS,
        delivering: current.delivering,
        onPurchase: (item) => callbacks.onPurchase(item),
        onBack: () => navigate('back'),
      }) as ScreenHandle<never>
    }

    return createResultScreen({
      outcome: result?.outcome ?? 'defeat',
      scrapGained: result?.scrapGained ?? 0,
      defeated: result?.defeated ?? [],
      discoveries: result?.discoveries ?? 0,
      gained: result?.gained,
      help: result?.help,
      onNewRun: () => {
        navigate('enter-game')
        callbacks.onNewRun()
      },
      onLobby: () => navigate('to-lobby'),
    }) as ScreenHandle<never>
  }

  /** Rebuild in place so the mounted screen reflects the newest data. */
  const refresh = () => {
    if (!screen) return
    const mounted = screen
    unmount()
    handle = build(mounted)
    container.appendChild(handle.el)
  }

  return {
    show: (next) => go(next),
    showResult(summary) {
      result = summary
      if (screen === 'result') refresh()
      else go('result')
    },
    hide: () => go(null),
    setData(next) {
      current = next
      refresh()
    },
    get screen() {
      return screen
    },
    destroy() {
      unmount()
      screen = null
    },
  }
}
