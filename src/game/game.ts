import {
  calculateMass,
  calculatePower,
  movementScale,
  readSave,
  writeSave,
  type OperatorPart,
  type SaveData,
} from './logic'

type Phase =
  | 'void'
  | 'signal'
  | 'elite'
  | 'reward'
  | 'shop'
  | 'delivery'
  | 'assembly'
  | 'bossIntro'
  | 'boss'
  | 'victory'
  | 'defeat'

type Point = { x: number; y: number }
type Button = { x: number; y: number; w: number; h: number; action: () => void }
type ModuleKind = 'guard' | 'gun' | 'core'
type EnemyModule = {
  id: string
  kind: ModuleKind
  offset: Point
  hp: number
  maxHp: number
}
type Bullet = { x: number; y: number; targetId: string; speed: number; damage: number }
type Telegraph = { x: number; y: number; radius: number; timer: number; maxTimer: number }

const ADD_ONE: OperatorPart = { kind: 'add', value: 1, mass: 2 }
const ADD_THREE: OperatorPart = { kind: 'add', value: 3, mass: 3 }
const TIMES_TWO: OperatorPart = { kind: 'multiply', value: 2, mass: 5 }
const CYAN = '#65f5ed'
const AMBER = '#ffbd59'
const RED = '#ff5268'
const INK = '#071016'

export function createGame(canvas: HTMLCanvasElement): { destroy(): void } {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')

  let width = 1280
  let height = 720
  let phase: Phase = 'void'
  let save: SaveData = readSave(window.localStorage)
  let slots: Array<OperatorPart | null> = [ADD_ONE, null, null, null]
  let pendingPart: OperatorPart | null = null
  let player = { x: 330, y: 360, hp: 100 }
  let enemy: { x: number; y: number; name: string; modules: EnemyModule[] } | null = null
  let targetId = ''
  let bullets: Bullet[] = []
  let telegraphs: Telegraph[] = []
  let fireTimer = 0
  let enemyAttackTimer = 1.2
  let explored = 0
  let idleTime = 4
  let cloaked = true
  let pointerTarget: Point | null = null
  let pointerDown = false
  let deliveryTimer = 0
  let overflowPulse = 0
  let flash = 0
  let message = '이동하여 미지 신호를 탐색하세요'
  let buttons: Button[] = []
  let frame = 0
  let lastTime = performance.now()
  const keys = new Set<string>()

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const nextWidth = Math.max(320, Math.round(rect.width || 1280))
    const nextHeight = Math.max(420, Math.round(rect.height || 720))
    if (canvas.width !== nextWidth * ratio || canvas.height !== nextHeight * ratio) {
      canvas.width = nextWidth * ratio
      canvas.height = nextHeight * ratio
      width = nextWidth
      height = nextHeight
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      player.x = Math.min(player.x, width - 50)
      player.y = Math.min(player.y, height - 80)
    }
  }

  const persist = () => writeSave(save, window.localStorage)

  const modulePosition = (part: EnemyModule): Point => ({
    x: (enemy?.x ?? 0) + part.offset.x,
    y: (enemy?.y ?? 0) + part.offset.y,
  })

  const coreExposed = () => Boolean(enemy && enemy.modules
    .filter((part) => part.kind === 'guard')
    .every((part) => part.hp <= 0))

  const validTarget = (): EnemyModule | null => {
    if (!enemy) return null
    const selected = enemy.modules.find((part) => part.id === targetId && part.hp > 0)
    if (selected && (selected.kind !== 'core' || coreExposed())) return selected
    return enemy.modules.find((part) => part.kind === 'guard' && part.hp > 0)
      ?? enemy.modules.find((part) => part.kind === 'gun' && part.hp > 0)
      ?? enemy.modules.find((part) => part.kind === 'core' && part.hp > 0 && coreExposed())
      ?? null
  }

  const beginElite = () => {
    phase = 'elite'
    player.x = Math.max(90, width * 0.23)
    player.y = height * 0.52
    player.hp = 100
    enemy = {
      x: width * 0.72,
      y: height * 0.48,
      name: '미지 정예기체 // WARDEN',
      modules: [
        { id: 'elite-guard', kind: 'guard', offset: { x: -62, y: 0 }, hp: 160, maxHp: 160 },
        { id: 'elite-gun', kind: 'gun', offset: { x: 12, y: -54 }, hp: 100, maxHp: 100 },
        { id: 'elite-core', kind: 'core', offset: { x: 12, y: 0 }, hp: 320, maxHp: 320 },
      ],
    }
    targetId = 'elite-guard'
    bullets = []
    telegraphs = []
    enemyAttackTimer = 1.1
    message = '보호 모듈을 먼저 파괴하세요'
  }

  const beginBoss = () => {
    phase = 'boss'
    player.x = Math.max(90, width * 0.22)
    player.y = height * 0.5
    player.hp = 100
    enemy = {
      x: width * 0.74,
      y: height * 0.48,
      name: 'MAIN SIGNAL // LIMIT BREAKER',
      modules: [
        { id: 'boss-guard-a', kind: 'guard', offset: { x: -72, y: -45 }, hp: 150, maxHp: 150 },
        { id: 'boss-guard-b', kind: 'guard', offset: { x: -72, y: 45 }, hp: 150, maxHp: 150 },
        { id: 'boss-gun', kind: 'gun', offset: { x: 18, y: -68 }, hp: 140, maxHp: 140 },
        { id: 'boss-core', kind: 'core', offset: { x: 15, y: 0 }, hp: 430, maxHp: 430 },
      ],
    }
    targetId = 'boss-guard-a'
    bullets = []
    telegraphs = []
    enemyAttackTimer = 0.9
    message = '두 보호 모듈이 코어를 가리고 있습니다'
  }

  const finishCombat = () => {
    bullets = []
    telegraphs = []
    enemy = null
    if (phase === 'elite') {
      save.scrap += 10
      persist()
      pendingPart = ADD_THREE
      phase = 'reward'
      message = '회수한 증강을 장착하거나 분해하세요'
    } else {
      phase = 'victory'
      save.victories += 1
      persist()
      overflowPulse = 3
      message = 'LIMIT 신호를 돌파했습니다'
    }
  }

  const resetRun = () => {
    phase = 'void'
    slots = [ADD_ONE, null, null, null]
    pendingPart = null
    player = { x: width * 0.3, y: height * 0.52, hp: 100 }
    enemy = null
    targetId = ''
    bullets = []
    telegraphs = []
    explored = 0
    idleTime = 4
    cloaked = true
    pointerTarget = null
    message = '이동하여 미지 신호를 탐색하세요'
  }

  const enterVoidAfterReward = () => {
    phase = 'void'
    explored = 100
    idleTime = 4
    cloaked = true
    message = '클로킹 완료 · 공백 상점을 이용하세요'
  }

  const selectSocket = (index: number) => {
    if (!pendingPart || slots[index]) return
    slots[index] = pendingPart
    pendingPart = null
    overflowPulse = calculatePower(2, slots) >= 10 ? 1.8 : 0.6
    enterVoidAfterReward()
  }

  const dismantlePending = () => {
    if (!pendingPart) return
    save.scrap += pendingPart.kind === 'multiply' ? 6 : 5
    persist()
    pendingPart = null
    enterVoidAfterReward()
  }

  const buyAmplifier = () => {
    if (save.scrap < 8) {
      message = '스크랩이 부족합니다'
      return
    }
    save.scrap -= 8
    persist()
    phase = 'delivery'
    deliveryTimer = 0
    message = '배송 캡슐이 워프 중입니다'
  }

  const pointFromEvent = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (width / rect.width),
      y: (event.clientY - rect.top) * (height / rect.height),
    }
  }

  const inside = (point: Point, button: Button) => point.x >= button.x
    && point.x <= button.x + button.w
    && point.y >= button.y
    && point.y <= button.y + button.h

  const selectEnemyModule = (point: Point): boolean => {
    if (!enemy || (phase !== 'elite' && phase !== 'boss')) return false
    const selected = enemy.modules
      .filter((part) => part.hp > 0)
      .find((part) => {
        const pos = modulePosition(part)
        return Math.hypot(point.x - pos.x, point.y - pos.y) < 38
      })
    if (!selected) return false
    if (selected.kind === 'core' && !coreExposed()) {
      message = '코어 잠금 · 보호 모듈을 먼저 파괴하세요'
      flash = 0.25
      return true
    }
    targetId = selected.id
    message = `${moduleLabel(selected.kind)} 집중 조준`
    return true
  }

  const onPointerDown = (event: PointerEvent) => {
    const point = pointFromEvent(event)
    const hit = [...buttons].reverse().find((button) => inside(point, button))
    if (hit) {
      hit.action()
      return
    }
    if (selectEnemyModule(point)) return
    if (phase === 'void' || phase === 'elite' || phase === 'boss') {
      pointerDown = true
      pointerTarget = point
      canvas.setPointerCapture?.(event.pointerId)
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (pointerDown) pointerTarget = pointFromEvent(event)
  }

  const onPointerUp = () => { pointerDown = false }
  const onKeyDown = (event: KeyboardEvent) => {
    keys.add(event.key.toLowerCase())
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
      event.preventDefault()
    }
  }
  const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase())
  const onBlur = () => {
    keys.clear()
    pointerDown = false
    if (phase === 'void') {
      cloaked = true
      idleTime = 4
      persist()
    }
  }
  const onVisibility = () => {
    if (document.hidden) onBlur()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)

  const movementVector = (): Point => {
    let x = 0
    let y = 0
    if (keys.has('a') || keys.has('arrowleft')) x -= 1
    if (keys.has('d') || keys.has('arrowright')) x += 1
    if (keys.has('w') || keys.has('arrowup')) y -= 1
    if (keys.has('s') || keys.has('arrowdown')) y += 1

    if (x || y) {
      pointerTarget = null
      const length = Math.hypot(x, y)
      return { x: x / length, y: y / length }
    }
    if (pointerTarget) {
      const dx = pointerTarget.x - player.x
      const dy = pointerTarget.y - player.y
      const length = Math.hypot(dx, dy)
      if (length > 8) return { x: dx / length, y: dy / length }
      pointerTarget = null
    }
    return { x: 0, y: 0 }
  }

  const updateMovement = (dt: number) => {
    const movement = movementVector()
    const moving = movement.x !== 0 || movement.y !== 0
    if (moving) {
      const speed = 190 * movementScale(calculateMass(slots))
      player.x = clamp(player.x + movement.x * speed * dt, 35, width - 35)
      player.y = clamp(player.y + movement.y * speed * dt, 92, height - 55)
      idleTime = 0
      cloaked = false
      if (phase === 'void' && explored < 100) {
        explored += speed * dt * 0.28
        if (explored >= 100) {
          explored = 100
          phase = 'signal'
          save.discoveries += 1
          persist()
          pointerTarget = null
          message = '미지 신호가 항로에 나타났습니다'
        }
      }
    } else if (phase === 'void') {
      idleTime += dt
      cloaked = idleTime >= 3
    }
  }

  const updateCombat = (dt: number) => {
    updateMovement(dt)
    const target = validTarget()
    if (!enemy || !target) return
    targetId = target.id
    fireTimer -= dt
    if (fireTimer <= 0) {
      bullets.push({
        x: player.x + 22,
        y: player.y,
        targetId: target.id,
        speed: 520,
        damage: calculatePower(2, slots),
      })
      fireTimer = 0.22
    }

    bullets = bullets.filter((bullet) => {
      const part = enemy?.modules.find((item) => item.id === bullet.targetId)
      if (!part || part.hp <= 0) return false
      const pos = modulePosition(part)
      const dx = pos.x - bullet.x
      const dy = pos.y - bullet.y
      const distance = Math.hypot(dx, dy)
      if (distance < bullet.speed * dt + 12) {
        if (part.kind !== 'core' || coreExposed()) part.hp = Math.max(0, part.hp - bullet.damage)
        if (part.hp <= 0) {
          flash = 0.18
          if (part.kind === 'core') finishCombat()
          else if (part.kind === 'guard' && coreExposed()) message = '코어 노출! 코어를 탭해 집중 조준하세요'
          else message = `${moduleLabel(part.kind)} 파괴`
        }
        return false
      }
      bullet.x += dx / distance * bullet.speed * dt
      bullet.y += dy / distance * bullet.speed * dt
      return true
    })

    enemyAttackTimer -= dt
    if (enemyAttackTimer <= 0) {
      const count = phase === 'boss' ? 2 : 1
      for (let index = 0; index < count; index += 1) {
        telegraphs.push({
          x: clamp(player.x + (index ? 55 : 0), 55, width - 55),
          y: clamp(player.y + (index ? -45 : 0), 120, height - 55),
          radius: phase === 'boss' ? 48 : 42,
          timer: phase === 'boss' ? 0.85 : 1.05,
          maxTimer: phase === 'boss' ? 0.85 : 1.05,
        })
      }
      enemyAttackTimer = phase === 'boss' ? 2.1 : 2.7
    }

    telegraphs = telegraphs.filter((zone) => {
      zone.timer -= dt
      if (zone.timer > 0) return true
      const hitRadius = 17 + calculateMass(slots) * 0.6
      if (Math.hypot(player.x - zone.x, player.y - zone.y) < zone.radius + hitRadius) {
        player.hp = Math.max(0, player.hp - (phase === 'boss' ? 24 : 18))
        flash = 0.3
        if (player.hp <= 0) {
          phase = 'defeat'
          enemy = null
          bullets = []
          telegraphs = []
          message = '핵심 코어가 파괴되었습니다'
        }
      }
      return false
    })
  }

  const update = (dt: number) => {
    flash = Math.max(0, flash - dt)
    overflowPulse = Math.max(0, overflowPulse - dt)
    if (phase === 'void') updateMovement(dt)
    if (phase === 'elite' || phase === 'boss') updateCombat(dt)
    if (phase === 'delivery') {
      deliveryTimer += dt
      if (deliveryTimer >= 1.8) {
        pendingPart = TIMES_TWO
        phase = 'assembly'
        message = '배송 완료 · 증폭기를 소켓에 장착하세요'
      }
    }
  }

  const addButton = (x: number, y: number, w: number, h: number, label: string, action: () => void, accent = CYAN) => {
    ctx.fillStyle = `${accent}18`
    ctx.strokeStyle = accent
    ctx.lineWidth = 1
    ctx.fillRect(x, y, w, h)
    ctx.strokeRect(x, y, w, h)
    ctx.fillStyle = accent
    ctx.font = '700 14px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
    buttons.push({ x, y, w, h, action })
  }

  const drawBackground = (time: number) => {
    ctx.fillStyle = '#020609'
    ctx.fillRect(0, 0, width, height)
    for (let index = 0; index < 90; index += 1) {
      const x = (index * 139.7 + time * (index % 3) * -0.002) % width
      const y = (index * 71.3) % height
      ctx.globalAlpha = 0.25 + (index % 4) * 0.12
      ctx.fillStyle = index % 11 === 0 ? AMBER : '#bafcff'
      ctx.fillRect(x, y, index % 7 === 0 ? 2 : 1, index % 7 === 0 ? 2 : 1)
    }
    ctx.globalAlpha = 1
    const gradient = ctx.createRadialGradient(width * 0.55, height * 0.45, 20, width * 0.55, height * 0.45, width * 0.7)
    gradient.addColorStop(0, 'rgba(10,55,67,.14)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  const drawPlayer = () => {
    const power = calculatePower(2, slots)
    const mass = calculateMass(slots)
    const pulse = 0.75 + Math.sin(performance.now() * 0.008) * 0.2
    ctx.save()
    ctx.translate(player.x, player.y)
    if (cloaked) ctx.globalAlpha = 0.28 + pulse * 0.12
    ctx.strokeStyle = power >= 10 ? AMBER : CYAN
    ctx.shadowColor = ctx.strokeStyle
    ctx.shadowBlur = power >= 10 ? 22 : 10
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(26 + mass * 0.5, 0)
    ctx.lineTo(-20 - mass, -16 - mass * 0.25)
    ctx.lineTo(-12 - mass * 0.5, 0)
    ctx.lineTo(-20 - mass, 16 + mass * 0.25)
    ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = '#081820'
    ctx.fill()
    ctx.fillStyle = power >= 10 ? AMBER : CYAN
    ctx.beginPath()
    ctx.arc(0, 0, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = `${CYAN}66`
    for (let index = 0; index < slots.length; index += 1) {
      const part = slots[index]
      if (!part) continue
      const px = -8 - index * 15
      ctx.beginPath()
      ctx.moveTo(index === 0 ? 0 : px + 11, 0)
      ctx.lineTo(px, 0)
      ctx.stroke()
      ctx.fillStyle = part.kind === 'multiply' ? AMBER : CYAN
      ctx.fillRect(px - 5, -5, 10, 10)
    }
    ctx.restore()
  }

  const drawEnemy = () => {
    if (!enemy) return
    const exposed = coreExposed()
    ctx.strokeStyle = '#294450'
    ctx.lineWidth = 5
    for (const part of enemy.modules) {
      if (part.hp <= 0) continue
      const pos = modulePosition(part)
      ctx.beginPath()
      ctx.moveTo(enemy.x, enemy.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    for (const part of enemy.modules) {
      if (part.hp <= 0) continue
      const pos = modulePosition(part)
      const selected = part.id === targetId
      const locked = part.kind === 'core' && !exposed
      ctx.save()
      ctx.translate(pos.x, pos.y)
      ctx.strokeStyle = selected ? AMBER : part.kind === 'core' ? RED : '#91acb8'
      ctx.fillStyle = locked ? '#171c20' : part.kind === 'core' ? '#33121a' : '#0a171d'
      ctx.lineWidth = selected ? 3 : 1.5
      ctx.shadowColor = ctx.strokeStyle
      ctx.shadowBlur = selected ? 14 : 5
      if (part.kind === 'guard') {
        ctx.fillRect(-27, -21, 54, 42)
        ctx.strokeRect(-27, -21, 54, 42)
      } else if (part.kind === 'gun') {
        ctx.beginPath()
        ctx.moveTo(30, 0)
        ctx.lineTo(-22, -18)
        ctx.lineTo(-22, 18)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, 27, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        if (locked) {
          ctx.fillStyle = '#87949a'
          ctx.font = '700 12px ui-monospace, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('LOCK', 0, 0)
        }
      }
      ctx.shadowBlur = 0
      ctx.fillStyle = '#10171b'
      ctx.fillRect(-27, 29, 54, 5)
      ctx.fillStyle = part.hp / part.maxHp > 0.35 ? CYAN : RED
      ctx.fillRect(-27, 29, 54 * part.hp / part.maxHp, 5)
      ctx.restore()
    }
  }

  const drawCombatEffects = () => {
    for (const bullet of bullets) {
      ctx.fillStyle = calculatePower(2, slots) >= 10 ? AMBER : CYAN
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(bullet.x, bullet.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0
    for (const zone of telegraphs) {
      const progress = 1 - zone.timer / zone.maxTimer
      ctx.fillStyle = `rgba(255,82,104,${0.06 + progress * 0.16})`
      ctx.strokeStyle = RED
      ctx.lineWidth = 2 + progress * 3
      ctx.beginPath()
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(zone.x - 8, zone.y)
      ctx.lineTo(zone.x + 8, zone.y)
      ctx.moveTo(zone.x, zone.y - 8)
      ctx.lineTo(zone.x, zone.y + 8)
      ctx.stroke()
    }
  }

  const drawHud = () => {
    const power = calculatePower(2, slots)
    const mass = calculateMass(slots)
    ctx.fillStyle = 'rgba(4,12,17,.86)'
    ctx.fillRect(16, 16, Math.min(360, width - 32), 62)
    ctx.strokeStyle = '#223944'
    ctx.strokeRect(16, 16, Math.min(360, width - 32), 62)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '700 13px ui-monospace, monospace'
    ctx.fillStyle = CYAN
    ctx.fillText(`CORE ${Math.ceil(player.hp)}%`, 30, 27)
    ctx.fillStyle = power >= 10 ? AMBER : '#d9ffff'
    ctx.fillText(`FIRE ${power}${power >= 10 ? '  // OVERFLOW' : ''}`, 130, 27)
    ctx.fillStyle = mass > 6 ? RED : '#91a9b3'
    ctx.fillText(`MASS ${mass}/6${mass > 6 ? ' 과적' : ' 안정'}`, 30, 50)
    ctx.fillStyle = AMBER
    ctx.fillText(`SCRAP ${save.scrap}`, 190, 50)

    ctx.fillStyle = 'rgba(4,12,17,.76)'
    ctx.fillRect(16, height - 46, Math.min(width - 32, 620), 30)
    ctx.fillStyle = '#bed0d7'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText(message, 28, height - 37)
  }

  const drawVoidUi = () => {
    if (explored < 100) {
      const barWidth = Math.min(440, width - 60)
      const x = (width - barWidth) / 2
      const y = height * 0.17
      ctx.fillStyle = '#101b21'
      ctx.fillRect(x, y, barWidth, 8)
      ctx.fillStyle = CYAN
      ctx.fillRect(x, y, barWidth * explored / 100, 8)
      ctx.fillStyle = '#9bb1bb'
      ctx.textAlign = 'center'
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText('UNKNOWN SIGNAL SCAN', width / 2, y - 19)
    }
    if (cloaked) {
      ctx.textAlign = 'center'
      ctx.fillStyle = CYAN
      ctx.font = '700 18px ui-monospace, monospace'
      ctx.fillText('CLOAKING // SAFE', width / 2, height * 0.3)
      ctx.fillStyle = '#8198a2'
      ctx.font = '12px ui-monospace, monospace'
      ctx.fillText('정지 상태 · 안전 저장됨', width / 2, height * 0.3 + 26)
    }
    if (explored >= 100) {
      const w = Math.min(260, width - 40)
      addButton((width - w) / 2, height * 0.26, w, 52, '공백 상점 열기', () => { phase = 'shop' })
      if (slots.some((part) => part?.kind === 'multiply')) {
        addButton((width - w) / 2, height * 0.26 + 66, w, 58, '메인 신호로 워프', () => { phase = 'bossIntro' }, AMBER)
      }
    }
  }

  const drawPanel = (title: string, body: string[], panelHeight = 320) => {
    const w = Math.min(620, width - 32)
    const h = Math.min(panelHeight, height - 100)
    const x = (width - w) / 2
    const y = (height - h) / 2
    ctx.fillStyle = 'rgba(5,14,20,.96)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#35515d'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, w, h)
    ctx.fillStyle = CYAN
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '700 12px ui-monospace, monospace'
    ctx.fillText('OVERFLOW // NAV SYSTEM', x + 24, y + 20)
    ctx.fillStyle = '#f0ffff'
    ctx.font = `700 ${width < 520 ? 20 : 27}px ui-monospace, monospace`
    ctx.fillText(title, x + 24, y + 51)
    ctx.fillStyle = '#9fb2ba'
    ctx.font = '13px ui-monospace, monospace'
    body.forEach((line, index) => ctx.fillText(line, x + 24, y + 96 + index * 24))
    return { x, y, w, h }
  }

  const drawSignal = () => {
    const panel = drawPanel('미지 구역 발견', [
      '위험도  ■■■□□   예상 보상  증강 부품',
      '강한 단일 기체의 신호가 감지됩니다.',
    ], 300)
    const gap = 12
    const buttonWidth = (panel.w - 48 - gap) / 2
    addButton(panel.x + 24, panel.y + panel.h - 74, buttonWidth, 50, '진입', beginElite, AMBER)
    addButton(panel.x + 24 + buttonWidth + gap, panel.y + panel.h - 74, buttonWidth, 50, '지나가기', () => {
      phase = 'void'
      explored = 42
      message = '신호를 통과했습니다 · 새 항로 탐색 중'
    }, '#8aa0aa')
  }

  const drawReward = () => {
    const part = pendingPart ?? ADD_THREE
    const panel = drawPanel('부품 회수  +3', [
      '부품을 선택한 뒤 빈 소켓을 탭하면 자동 결합됩니다.',
      '필요 없다면 분해하여 스크랩으로 교환할 수 있습니다.',
    ], 390)
    drawRail(panel.x + 34, panel.y + 170, panel.w - 68, part)
    addButton(panel.x + 24, panel.y + panel.h - 68, 180, 44, '분해  +5 SCRAP', dismantlePending, '#9db0b7')
  }

  const drawAssembly = () => {
    const panel = drawPanel('배송 캡슐 개봉  ×2', [
      '곱연산 부품은 앞쪽의 모든 값을 증폭합니다.',
      '빈 소켓을 탭해 장착 순서를 완성하세요.',
    ], 390)
    drawRail(panel.x + 34, panel.y + 170, panel.w - 68, pendingPart ?? TIMES_TWO)
    addButton(panel.x + 24, panel.y + panel.h - 68, 180, 44, '분해  +6 SCRAP', dismantlePending, '#9db0b7')
  }

  const drawRail = (x: number, y: number, availableWidth: number, previewPart: OperatorPart) => {
    const gap = Math.max(8, Math.min(18, availableWidth * 0.035))
    const size = Math.max(46, Math.min(66, (availableWidth - gap * 5) / 6))
    const coreX = x
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = CYAN
    ctx.fillStyle = '#0a1a21'
    ctx.fillRect(coreX, y, size, size)
    ctx.strokeRect(coreX, y, size, size)
    ctx.fillStyle = CYAN
    ctx.font = '700 16px ui-monospace, monospace'
    ctx.fillText('CORE', coreX + size / 2, y + size / 2 - 9)
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText('2', coreX + size / 2, y + size / 2 + 12)

    slots.forEach((part, index) => {
      const sx = x + (index + 1) * (size + gap)
      ctx.strokeStyle = part ? (part.kind === 'multiply' ? AMBER : CYAN) : `${CYAN}88`
      ctx.fillStyle = part ? '#0b2027' : '#071016'
      ctx.setLineDash(part ? [] : [5, 4])
      ctx.fillRect(sx, y, size, size)
      ctx.strokeRect(sx, y, size, size)
      ctx.setLineDash([])
      ctx.fillStyle = part ? ctx.strokeStyle : '#58717b'
      ctx.font = '700 18px ui-monospace, monospace'
      ctx.fillText(part ? operatorLabel(part) : '+', sx + size / 2, y + size / 2)
      if (!part) {
        buttons.push({ x: sx - 5, y: y - 5, w: size + 10, h: size + 10, action: () => selectSocket(index) })
      }
    })
    const firstEmpty = slots.findIndex((part) => !part)
    const preview = firstEmpty < 0 ? calculatePower(2, slots) : calculatePower(2, slots.map((part, index) => index === firstEmpty ? previewPart : part))
    ctx.textAlign = 'left'
    ctx.fillStyle = preview >= 10 ? AMBER : '#bcd1d9'
    ctx.font = '700 13px ui-monospace, monospace'
    ctx.fillText(`예상 화력 ${calculatePower(2, slots)} → ${preview}${preview >= 10 ? '  OVERFLOW!' : ''}`, x, y + size + 26)
  }

  const drawShop = () => {
    const panel = drawPanel('공백 상점', [
      `보유 스크랩  ${save.scrap}`,
      '구매한 부품은 배송 캡슐로 즉시 워프합니다.',
    ], 350)
    const cardX = panel.x + 24
    const cardY = panel.y + 150
    ctx.fillStyle = '#0a1820'
    ctx.fillRect(cardX, cardY, panel.w - 48, 72)
    ctx.strokeStyle = AMBER
    ctx.strokeRect(cardX, cardY, panel.w - 48, 72)
    ctx.fillStyle = AMBER
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '700 17px ui-monospace, monospace'
    ctx.fillText('×2  OVERFLOW 증폭기', cardX + 16, cardY + 13)
    ctx.fillStyle = '#8fa5af'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText('질량 +5 · 앞선 연산 결과를 두 배로 증폭', cardX + 16, cardY + 42)
    addButton(panel.x + panel.w - 174, cardY + 14, 134, 44, '8 SCRAP', buyAmplifier, AMBER)
    addButton(panel.x + 24, panel.y + panel.h - 58, 120, 36, '닫기', () => {
      phase = 'void'
      message = '상점 연결 종료'
    }, '#80939b')
  }

  const drawDelivery = () => {
    const progress = Math.min(1, deliveryTimer / 1.8)
    const x = width + 100 - progress * (width * 0.5 + 100)
    const y = height * 0.46
    ctx.strokeStyle = AMBER
    ctx.shadowColor = AMBER
    ctx.shadowBlur = 20
    ctx.lineWidth = 2
    ctx.strokeRect(x - 28, y - 18, 56, 36)
    ctx.beginPath()
    ctx.moveTo(x + 34, y)
    ctx.lineTo(width, y)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.textAlign = 'center'
    ctx.fillStyle = AMBER
    ctx.font = '700 17px ui-monospace, monospace'
    ctx.fillText('WARP DELIVERY', width / 2, height * 0.28)
  }

  const drawBossIntro = () => {
    const panel = drawPanel('메인 퀘스트 구역', [
      '강한 LIMIT 신호가 바로 앞에 있습니다.',
      '보호 모듈 2개를 제거한 뒤 핵심 코어를 파괴하세요.',
    ], 300)
    addButton(panel.x + 24, panel.y + panel.h - 74, panel.w - 48, 50, '워프 개시', beginBoss, AMBER)
  }

  const drawEnd = (won: boolean) => {
    const panel = drawPanel(won ? 'OVERFLOW // 승리' : 'CORE LOST // 탐험 종료', [
      won ? '핵심 코어 파괴 · LIMIT 신호 좌표 획득' : '외부 부품보다 핵심 코어를 먼저 지켜야 합니다.',
      `발견 ${save.discoveries}   승리 ${save.victories}   스크랩 ${save.scrap}`,
    ], 300)
    addButton(panel.x + 24, panel.y + panel.h - 74, panel.w - 48, 50, '새 탐험 시작', resetRun, won ? AMBER : CYAN)
  }

  const draw = (time: number) => {
    buttons = []
    drawBackground(time)
    if (!['signal', 'reward', 'shop', 'assembly', 'bossIntro', 'victory', 'defeat'].includes(phase)) {
      drawPlayer()
    }
    if (phase === 'elite' || phase === 'boss') {
      drawEnemy()
      drawCombatEffects()
      if (enemy) {
        ctx.fillStyle = '#d9e9ed'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.font = '700 12px ui-monospace, monospace'
        ctx.fillText(enemy.name, enemy.x, 104)
      }
    }
    if (phase === 'void') drawVoidUi()
    if (phase === 'signal') drawSignal()
    if (phase === 'reward') drawReward()
    if (phase === 'shop') drawShop()
    if (phase === 'delivery') drawDelivery()
    if (phase === 'assembly') drawAssembly()
    if (phase === 'bossIntro') drawBossIntro()
    if (phase === 'victory') drawEnd(true)
    if (phase === 'defeat') drawEnd(false)
    drawHud()
    if (overflowPulse > 0) {
      ctx.strokeStyle = `rgba(255,189,89,${Math.min(1, overflowPulse) * 0.65})`
      ctx.lineWidth = 8
      ctx.strokeRect(5, 5, width - 10, height - 10)
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,82,104,${flash * 0.45})`
      ctx.fillRect(0, 0, width, height)
    }
  }

  const tick = (time: number) => {
    resize()
    const dt = Math.min(0.04, (time - lastTime) / 1000)
    lastTime = time
    update(dt)
    draw(time)
    frame = requestAnimationFrame(tick)
  }

  resize()
  frame = requestAnimationFrame(tick)

  return {
    destroy() {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      persist()
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function moduleLabel(kind: ModuleKind): string {
  if (kind === 'guard') return '보호 모듈'
  if (kind === 'gun') return '무기 모듈'
  return '핵심 코어'
}

function operatorLabel(part: OperatorPart): string {
  return part.kind === 'add' ? `+${part.value}` : `×${part.value}`
}
