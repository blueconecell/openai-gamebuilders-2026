export type ScreenName = 'lobby' | 'shop' | 'result'

export type NavAction =
  | 'open-shop'
  | 'back'
  | 'to-lobby'
  | 'show-result'
  /** Handed to the host instead of navigating: the canvas takes over. */
  | 'enter-game'

/**
 * Navigation between the menu screens is a closed loop, so it lives here as a
 * pure transition table the flow and its tests can share. `null` means the
 * action leaves the menus entirely and the host decides what happens.
 */
export function nextScreen(current: ScreenName, action: NavAction): ScreenName | null {
  if (action === 'enter-game') return null
  if (action === 'show-result') return 'result'
  if (action === 'open-shop') return current === 'lobby' ? 'shop' : current
  if (action === 'back') return current === 'shop' ? 'lobby' : current
  return 'lobby'
}
