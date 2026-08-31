import type { OperatorPart } from '../game/logic'

/**
 * Every screen is a self-contained factory: it owns a detached root element,
 * re-renders from props on `update`, and reports intent through callbacks only.
 * Screens never read or write persistent state themselves.
 */
export type ScreenHandle<Props> = {
  el: HTMLElement
  update(props: Props): void
  destroy(): void
}

export type ShipSlots = Array<OperatorPart | null>

export function operatorLabel(part: OperatorPart): string {
  return part.kind === 'add' ? `+${part.value}` : `×${part.value}`
}

export function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

/**
 * Screens use one delegated listener so `update` can replace markup freely
 * without leaking handlers.
 */
export function delegateClicks(
  root: HTMLElement,
  handle: (action: string, element: HTMLElement) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    const trigger = target?.closest<HTMLElement>('[data-action]')
    if (!trigger || !root.contains(trigger)) return
    if (trigger instanceof HTMLButtonElement && trigger.disabled) return
    handle(trigger.dataset.action ?? '', trigger)
  }
  root.addEventListener('click', onClick)
  return () => root.removeEventListener('click', onClick)
}
