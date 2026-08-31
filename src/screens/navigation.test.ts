import { describe, expect, it } from 'vitest'
import { nextScreen } from './navigation'

describe('nextScreen', () => {
  it('walks the lobby and shop loop', () => {
    expect(nextScreen('lobby', 'open-shop')).toBe('shop')
    expect(nextScreen('shop', 'back')).toBe('lobby')
  })

  it('reaches the result screen from anywhere and returns to the lobby', () => {
    expect(nextScreen('lobby', 'show-result')).toBe('result')
    expect(nextScreen('result', 'to-lobby')).toBe('lobby')
  })

  it('hands control back to the host when the run starts', () => {
    expect(nextScreen('lobby', 'enter-game')).toBeNull()
    expect(nextScreen('result', 'enter-game')).toBeNull()
  })

  it('ignores actions that do not apply to the current screen', () => {
    expect(nextScreen('shop', 'open-shop')).toBe('shop')
    expect(nextScreen('lobby', 'back')).toBe('lobby')
  })
})
