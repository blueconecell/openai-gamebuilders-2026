import { calculateMass, calculateMassLimit, calculatePower } from '../../game/logic'
import { partColor, partKindLabel, partLabel, unlockedSockets, type ShipSlots } from '../screen'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Socket anchors mirror the in-game hull layout so the preview stays recognisable. */
const SOCKETS = [
  { x: 38, y: -24 },
  { x: 38, y: 24 },
  { x: 0, y: -46 },
  { x: 0, y: 46 },
  { x: -42, y: -25 },
  { x: -42, y: 25 },
]

const CYAN = '#69e6e8'
const AMBER = '#ffb84a'

function node(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

/**
 * Draws the current hull: exposed core, fixed forward gun, engines, and one
 * bracket per socket — filled, empty, or locked until a body part opens it.
 */
export function createShipPreview(slots: ShipSlots): SVGElement {
  const power = calculatePower(2, slots)
  const accent = power >= 10 ? AMBER : CYAN
  const unlocked = unlockedSockets(slots)
  const svg = node('svg', {
    viewBox: '-64 -64 128 128',
    role: 'img',
    'aria-label': `화력 ${power}, 장착 부품 ${slots.filter(Boolean).length}개`,
  })

  for (const side of [-1, 1]) {
    svg.appendChild(node('rect', {
      x: '-40', y: `${side * 9 - 7}`, width: '16', height: '14',
      fill: '#0d222b', stroke: '#3d6672', 'stroke-width': '1.5',
    }))
  }

  SOCKETS.forEach((socket, index) => {
    if (index >= unlocked) return
    svg.appendChild(node('line', {
      x1: `${socket.x * 0.3}`, y1: `${socket.y * 0.3}`,
      x2: `${socket.x}`, y2: `${socket.y}`,
      stroke: slots[index] ? '#4d7c86' : 'rgba(105,230,232,.28)', 'stroke-width': '2',
    }))
  })

  svg.appendChild(node('path', {
    d: 'M30 0 L10 -15 L-26 -16 L-32 0 L-26 16 L10 15 Z',
    fill: '#08191f', stroke: accent, 'stroke-width': '2',
  }))
  svg.appendChild(node('rect', {
    x: '14', y: '-3.5', width: '22', height: '7',
    fill: '#0d222b', stroke: '#5f97a1', 'stroke-width': '1.5',
  }))
  svg.appendChild(node('circle', { cx: '0', cy: '0', r: '9', fill: accent }))
  svg.appendChild(node('circle', { cx: '0', cy: '0', r: '3.6', fill: '#071016' }))

  SOCKETS.forEach((socket, index) => {
    const part = slots[index]
    const locked = index >= unlocked

    if (!part) {
      svg.appendChild(node('rect', {
        x: `${socket.x - 9}`, y: `${socket.y - 9}`, width: '18', height: '18',
        fill: 'none', stroke: locked ? '#2a3439' : 'rgba(105,230,232,.28)',
        'stroke-width': '2', 'stroke-dasharray': locked ? '2 4' : '3 3',
      }))
      return
    }

    const color = partColor(part)
    // Part kinds read as silhouettes; Korean part names do not fit a socket box.
    if (part.kind === 'weapon') {
      svg.appendChild(node('path', {
        d: `M${socket.x} ${socket.y - 12} L${socket.x + 11} ${socket.y + 8} L${socket.x - 11} ${socket.y + 8} Z`,
        fill: '#08191f', stroke: color, 'stroke-width': '1.8', 'stroke-linejoin': 'round',
      }))
    } else if (part.kind === 'defense') {
      const points = Array.from({ length: 6 }, (_, corner) => {
        const angle = (corner / 6) * Math.PI * 2 - Math.PI / 2
        return `${socket.x + Math.cos(angle) * 12},${socket.y + Math.sin(angle) * 12}`
      }).join(' ')
      svg.appendChild(node('polygon', {
        points, fill: '#08191f', stroke: color, 'stroke-width': '1.8', 'stroke-linejoin': 'round',
      }))
    } else if (part.kind === 'body') {
      svg.appendChild(node('rect', {
        x: `${socket.x - 12}`, y: `${socket.y - 8}`, width: '24', height: '16', rx: '3',
        fill: '#08191f', stroke: color, 'stroke-width': '1.8',
      }))
    } else {
      svg.appendChild(node('rect', {
        x: `${socket.x - 11}`, y: `${socket.y - 11}`, width: '22', height: '22',
        fill: '#08191f', stroke: color, 'stroke-width': '1.8',
      }))
      const label = node('text', {
        x: `${socket.x}`, y: `${socket.y}`,
        fill: color, 'font-size': '11', 'font-weight': '700',
        'font-family': 'ui-monospace, monospace',
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      })
      label.textContent = partLabel(part)
      svg.appendChild(label)
    }

    const title = node('title', {})
    title.textContent = `${partKindLabel(part)} · ${partLabel(part)}`
    svg.appendChild(title)
  })

  return svg
}

export function shipSummary(slots: ShipSlots) {
  const mass = calculateMass(slots)
  const massLimit = calculateMassLimit(slots)
  const unlocked = unlockedSockets(slots)
  return {
    power: calculatePower(2, slots),
    mass,
    massLimit,
    installed: slots.filter(Boolean).length,
    unlocked,
    overloaded: mass > massLimit,
    weapons: slots.filter((part) => part?.kind === 'weapon').length,
    defenses: slots.filter((part) => part?.kind === 'defense').length,
  }
}
