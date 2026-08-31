import { shipSocketLayout, type DefenseKind, type ShipPart, type WeaponKind } from '../game/logic'

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

export type ShipSlots = Array<ShipPart | null>

export const CYAN = '#69e6e8'
export const AMBER = '#ffb84a'
export const STEEL = '#a6b5bb'

/**
 * Part glyphs and colours mirror what the game canvas draws, so a part reads
 * the same in the hangar as it does in flight. The game keeps its copy private,
 * so the screens carry their own; keep the two in step.
 */
export function partLabel(part: ShipPart): string {
  if (part.kind === 'add') return `+${part.value}`
  if (part.kind === 'multiply') return `×${part.value}`
  if (part.kind === 'body') return 'BODY'
  if (part.kind === 'weapon') return weaponLabel(part.weapon)
  if (part.kind === 'defense') return defenseLabel(part.defense)
  return 'PART'
}

export function partColor(part: ShipPart): string {
  if (part.kind === 'multiply' || part.kind === 'weapon') return AMBER
  if (part.kind === 'body') return STEEL
  return CYAN
}

export function partKindLabel(part: ShipPart): string {
  if (part.kind === 'weapon') return '무기'
  if (part.kind === 'defense') return '방어'
  if (part.kind === 'body') return '몸체'
  return '증강'
}

function weaponLabel(kind: WeaponKind): string {
  if (kind === 'homing') return '유도탄'
  if (kind === 'mine') return '지뢰'
  if (kind === 'saw') return '톱'
  return '폭파탄'
}

function defenseLabel(kind: DefenseKind): string {
  if (kind === 'interceptor') return '요격기'
  if (kind === 'shield') return '전방방패'
  return '수리봇'
}

/** Body parts open extra sockets; four are available before any are installed. */
export function unlockedSockets(slots: ShipSlots): number {
  return shipSocketLayout(slots).length
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

/**
 * Collapsible explainer every screen carries. Callers may override the copy
 * through their `help` prop when the integration wants different wording.
 */
export function createHelp(summaryText: string, lines: string[]): HTMLElement {
  const details = document.createElement('details')
  details.className = 'gb-help'
  const summary = document.createElement('summary')
  summary.textContent = summaryText
  const list = element('ul')
  for (const line of lines) {
    const item = element('li')
    item.textContent = line
    list.appendChild(item)
  }
  details.append(summary, list)
  return details
}
