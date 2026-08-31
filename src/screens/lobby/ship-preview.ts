import { calculateMass, calculatePower } from '../../game/logic'
import { operatorLabel, type ShipSlots } from '../screen'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Socket anchors mirror the in-game hull layout so the preview stays recognisable. */
const SOCKETS = [
  { x: -4, y: -30 },
  { x: -4, y: 30 },
  { x: -34, y: -20 },
  { x: -34, y: 20 },
]

const CYAN = '#69e6e8'
const AMBER = '#ffb84a'

function node(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

/**
 * Draws the current hull: exposed core, fixed forward gun, engines, and either a
 * filled socket or an empty bracket for each of the four operator slots.
 */
export function createShipPreview(slots: ShipSlots): SVGElement {
  const power = calculatePower(2, slots)
  const accent = power >= 10 ? AMBER : CYAN
  const svg = node('svg', {
    viewBox: '-62 -52 130 104',
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
    const part = slots[index]
    svg.appendChild(node('line', {
      x1: `${socket.x * 0.35}`, y1: `${socket.y * 0.35}`,
      x2: `${socket.x}`, y2: `${socket.y}`,
      stroke: part ? '#4d7c86' : 'rgba(105,230,232,.28)', 'stroke-width': '2',
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
    if (!part) {
      svg.appendChild(node('rect', {
        x: `${socket.x - 9}`, y: `${socket.y - 9}`, width: '18', height: '18',
        fill: 'none', stroke: 'rgba(105,230,232,.28)', 'stroke-width': '2',
        'stroke-dasharray': '3 3',
      }))
      return
    }
    const color = part.kind === 'multiply' ? AMBER : CYAN
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
    label.textContent = operatorLabel(part)
    svg.appendChild(label)
  })

  return svg
}

export function shipSummary(slots: ShipSlots) {
  const mass = calculateMass(slots)
  return {
    power: calculatePower(2, slots),
    mass,
    installed: slots.filter(Boolean).length,
    overloaded: mass > 6,
  }
}
