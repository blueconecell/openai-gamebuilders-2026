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
type EnemyBullet = { x: number; y: number; vx: number; vy: number; damage: number; life: number }
type Stick = { pointerId: number; originX: number; originY: number; x: number; y: number }

const ADD_ONE: OperatorPart = { kind: 'add', value: 1, mass: 2 }
const ADD_THREE: OperatorPart = { kind: 'add', value: 3, mass: 3 }
const TIMES_TWO: OperatorPart = { kind: 'multiply', value: 2, mass: 5 }
const CYAN = '#65f5ed'
const AMBER = '#ffbd59'
const RED = '#ff5268'
const INK = '#071016'
const WORLD = { w: 4200, h: 4200 }
const HULL_RADIUS = 24
const STICK_RADIUS = 62

export function createGame(canvas: HTMLCanvasElement): { destroy(): void } {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')

  let width = 1280
  let height = 720
  let phase: Phase = 'void'
  const storage = safeStorage()
  let save: SaveData = readSave(storage)
  const restoredRun = save.safeRun
  let slots: Array<OperatorPart | null> = Array.from(
    { length: 4 },
    (_, index) => restoredRun?.slots[index] ?? (index === 0 ? ADD_ONE : null),
  )
  let pendingPart: OperatorPart | null = null
  let player = {
    x: WORLD.w * (restoredRun?.xRatio ?? 0.5),
    y: WORLD.h * (restoredRun?.yRatio ?? 0.5),
    hp: 100,
  }
  let heading = -Math.PI / 2
  let thrust = 0
  let enemy: { x: number; y: number; name: string; modules: EnemyModule[] } | null = null
  let targetId = ''
  let bullets: Bullet[] = []
  let enemyBullets: EnemyBullet[] = []
  let fireTimer = 0
  let enemyAttackTimer = 1.2
  let explored = restoredRun?.explored ?? 0
  let idleTime = 4
  let cloaked = true
  let stick: Stick | null = null
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
    }
  }

  const persist = () => writeSave(save, storage)

  const persistSafeRun = () => {
    save.safeRun = {
      xRatio: player.x / WORLD.w,
      yRatio: player.y / WORLD.h,
      explored,
      slots: slots.map((part) => part ? { ...part } : null),
    }
    persist()
  }

  // The ship stays locked to the middle of the screen; the world scrolls past it.
  const screenToWorld = (point: Point): Point => ({
    x: point.x - width / 2 + player.x,
    y: point.y - height / 2 + player.y,
  })

  const applyCamera = () => ctx.translate(width / 2 - player.x, height / 2 - player.y)

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
    cloaked = false
    player.hp = 100
    heading = 0
    enemy = {
      x: player.x + 430,
      y: player.y - 20,
      name: '미지 정예기체 // WARDEN',
      modules: [
        { id: 'elite-guard', kind: 'guard', offset: { x: -62, y: 0 }, hp: 160, maxHp: 160 },
        { id: 'elite-gun', kind: 'gun', offset: { x: 12, y: -54 }, hp: 100, maxHp: 100 },
        { id: 'elite-core', kind: 'core', offset: { x: 12, y: 0 }, hp: 320, maxHp: 320 },
      ],
    }
    targetId = 'elite-guard'
    bullets = []
    enemyBullets = []
    enemyAttackTimer = 1.1
    message = '보호 모듈을 먼저 파괴하세요'
  }

  const beginBoss = () => {
    phase = 'boss'
    cloaked = false
    player.hp = 100
    heading = 0
    enemy = {
      x: player.x + 460,
      y: player.y - 20,
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
    enemyBullets = []
    enemyAttackTimer = 0.9
    message = '두 보호 모듈이 코어를 가리고 있습니다'
  }

  const finishCombat = () => {
    bullets = []
    enemyBullets = []
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
    player = { x: WORLD.w * 0.5, y: WORLD.h * 0.5, hp: 100 }
    heading = -Math.PI / 2
    enemy = null
    targetId = ''
    bullets = []
    enemyBullets = []
    explored = 0
    idleTime = 4
    cloaked = true
    stick = null
    save.safeRun = null
    persist()
    message = '이동하여 미지 신호를 탐색하세요'
  }

  const enterVoidAfterReward = () => {
    phase = 'void'
    explored = 100
    idleTime = 4
    cloaked = true
    persistSafeRun()
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
    if (save.scrap < 6) {
      message = '스크랩이 부족합니다'
      return
    }
    save.scrap -= 6
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
    const world = screenToWorld(point)
    const selected = enemy.modules
      .filter((part) => part.hp > 0)
      .find((part) => {
        const pos = modulePosition(part)
        return Math.hypot(world.x - pos.x, world.y - pos.y) < 38
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

  // Touch drives a floating stick in the lower-left; a mouse never steers the ship.
  const inStickZone = (point: Point) => point.x < width * 0.5 && point.y > height * 0.45

  const onPointerDown = (event: PointerEvent) => {
    const point = pointFromEvent(event)
    const hit = [...buttons].reverse().find((button) => inside(point, button))
    if (hit) {
      hit.action()
      return
    }
    const steerable = phase === 'void' || phase === 'elite' || phase === 'boss'
    if (event.pointerType !== 'mouse' && steerable && inStickZone(point)) {
      stick = { pointerId: event.pointerId, originX: point.x, originY: point.y, x: point.x, y: point.y }
      canvas.setPointerCapture?.(event.pointerId)
      return
    }
    selectEnemyModule(point)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!stick || stick.pointerId !== event.pointerId) return
    const point = pointFromEvent(event)
    stick.x = point.x
    stick.y = point.y
  }

  const onPointerUp = (event: PointerEvent) => {
    if (stick && stick.pointerId === event.pointerId) stick = null
  }
  const onKeyDown = (event: KeyboardEvent) => {
    keys.add(event.key.toLowerCase())
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
      event.preventDefault()
    }
  }
  const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase())
  const onBlur = () => {
    keys.clear()
    stick = null
    if (phase === 'void') {
      cloaked = true
      idleTime = 4
      persistSafeRun()
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
      const length = Math.hypot(x, y)
      return { x: x / length, y: y / length }
    }
    if (stick) {
      const dx = stick.x - stick.originX
      const dy = stick.y - stick.originY
      const length = Math.hypot(dx, dy)
      if (length > 10) {
        // Past the ring the stick reads as full throttle, so the thumb never has to reach.
        const strength = Math.min(1, length / STICK_RADIUS)
        return { x: dx / length * strength, y: dy / length * strength }
      }
    }
    return { x: 0, y: 0 }
  }

  const updateMovement = (dt: number) => {
    const movement = movementVector()
    const throttle = Math.hypot(movement.x, movement.y)
    const moving = throttle > 0
    thrust += ((moving ? throttle : 0) - thrust) * Math.min(1, dt * 9)
    if (moving) {
      // Only the hull turns — rotating the camera makes the void nauseating to read.
      heading = turnToward(heading, Math.atan2(movement.y, movement.x), dt * 7)
      const speed = 190 * movementScale(calculateMass(slots))
      player.x = clamp(player.x + movement.x * speed * dt, 60, WORLD.w - 60)
      player.y = clamp(player.y + movement.y * speed * dt, 60, WORLD.h - 60)
      idleTime = 0
      cloaked = false
      if (phase === 'void' && explored < 100) {
        explored += speed * throttle * dt * 0.28
        if (explored >= 100) {
          explored = 100
          phase = 'signal'
          save.discoveries += 1
          persist()
          stick = null
          message = '미지 신호가 항로에 나타났습니다'
        }
      }
    } else if (phase === 'void') {
      const wasCloaked = cloaked
      idleTime += dt
      cloaked = idleTime >= 3
      if (!wasCloaked && cloaked) persistSafeRun()
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
        x: player.x + Math.cos(heading) * 26,
        y: player.y + Math.sin(heading) * 26,
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
      // Shots leave the surviving gun modules, so tearing them off visibly thins the fire.
      const guns = enemy.modules.filter((part) => part.kind === 'gun' && part.hp > 0)
      const origins = guns.length ? guns.map(modulePosition) : [{ x: enemy.x, y: enemy.y }]
      const spread = phase === 'boss' ? 0.16 : 0
      const shotSpeed = phase === 'boss' ? 330 : 290
      const damage = phase === 'boss' ? 14 : 11
      for (const origin of origins) {
        const aim = Math.atan2(player.y - origin.y, player.x - origin.x)
        for (const offset of spread ? [-spread, 0, spread] : [0]) {
          enemyBullets.push({
            x: origin.x,
            y: origin.y,
            vx: Math.cos(aim + offset) * shotSpeed,
            vy: Math.sin(aim + offset) * shotSpeed,
            damage,
            life: 4,
          })
        }
      }
      enemyAttackTimer = guns.length
        ? (phase === 'boss' ? 1.5 : 1.9)
        : (phase === 'boss' ? 2.8 : 3.4)
    }

    const hitRadius = HULL_RADIUS + calculateMass(slots) * 0.5
    enemyBullets = enemyBullets.filter((shot) => {
      shot.x += shot.vx * dt
      shot.y += shot.vy * dt
      shot.life -= dt
      if (shot.life <= 0) return false
      if (Math.hypot(player.x - shot.x, player.y - shot.y) > hitRadius) return true
      player.hp = Math.max(0, player.hp - shot.damage)
      flash = 0.25
      if (player.hp <= 0) {
        phase = 'defeat'
        enemy = null
        bullets = []
        enemyBullets = []
        message = '핵심 코어가 파괴되었습니다'
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
    // Three depths of stars scroll against the camera so movement reads without turning the view.
    for (let layer = 0; layer < 3; layer += 1) {
      const depth = 0.25 + layer * 0.35
      const tile = 220 + layer * 90
      const size = layer === 2 ? 2 : 1
      const offsetX = -player.x * depth
      const offsetY = -player.y * depth
      const startX = Math.floor(-offsetX / tile) * tile + offsetX
      const startY = Math.floor(-offsetY / tile) * tile + offsetY
      ctx.globalAlpha = 0.2 + layer * 0.22
      ctx.fillStyle = layer === 2 ? '#bafcff' : '#7fd3dd'
      for (let x = startX; x < width + tile; x += tile) {
        for (let y = startY; y < height + tile; y += tile) {
          const jitterX = ((Math.round((x - offsetX) / tile) * 73.1) % tile + tile) % tile
          const jitterY = ((Math.round((y - offsetY) / tile) * 151.7) % tile + tile) % tile
          ctx.fillRect(x + jitterX * 0.6, y + jitterY * 0.6, size, size)
        }
      }
    }
    ctx.globalAlpha = 1
    const gradient = ctx.createRadialGradient(width * 0.55, height * 0.45, 20, width * 0.55, height * 0.45, width * 0.7)
    gradient.addColorStop(0, 'rgba(10,55,67,.14)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  // Socket anchors around the core, in hull space (nose points along +x).
  const SOCKETS: Point[] = [
    { x: -4, y: -30 },
    { x: -4, y: 30 },
    { x: -34, y: -20 },
    { x: -34, y: 20 },
  ]

  const drawPlayer = () => {
    const power = calculatePower(2, slots)
    const pulse = 0.75 + Math.sin(performance.now() * 0.008) * 0.2
    const accent = power >= 10 ? AMBER : CYAN
    ctx.save()
    ctx.translate(player.x, player.y)
    ctx.rotate(heading)
    if (cloaked) ctx.globalAlpha = 0.3 + pulse * 0.14

    // Engine bells and exhaust at the tail.
    ctx.fillStyle = '#0d222b'
    ctx.strokeStyle = '#3d6672'
    ctx.lineWidth = 1.5
    for (const side of [-1, 1]) {
      ctx.fillRect(-40, side * 9 - 7, 16, 14)
      ctx.strokeRect(-40, side * 9 - 7, 16, 14)
      if (thrust > 0.05) {
        ctx.fillStyle = `rgba(101,245,237,${0.25 + thrust * 0.5})`
        ctx.beginPath()
        ctx.moveTo(-40, side * 9 - 5)
        ctx.lineTo(-40 - 16 * thrust - Math.random() * 7, side * 9)
        ctx.lineTo(-40, side * 9 + 5)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#0d222b'
      }
    }

    // Empty socket brackets make the expandable frame legible from the first frame.
    for (let index = 0; index < SOCKETS.length; index += 1) {
      const socket = SOCKETS[index]
      ctx.strokeStyle = slots[index] ? '#4d7c86' : 'rgba(101,245,237,.28)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(socket.x * 0.35, socket.y * 0.35)
      ctx.lineTo(socket.x, socket.y)
      ctx.stroke()
      if (!slots[index]) {
        ctx.setLineDash([3, 3])
        ctx.strokeRect(socket.x - 9, socket.y - 9, 18, 18)
        ctx.setLineDash([])
      }
    }

    // Main hull.
    ctx.strokeStyle = accent
    ctx.shadowColor = accent
    ctx.shadowBlur = power >= 10 ? 20 : 9
    ctx.lineWidth = 2
    ctx.fillStyle = '#08191f'
    ctx.beginPath()
    ctx.moveTo(30, 0)
    ctx.lineTo(10, -15)
    ctx.lineTo(-26, -16)
    ctx.lineTo(-32, 0)
    ctx.lineTo(-26, 16)
    ctx.lineTo(10, 15)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Fixed forward gun, always visible so the base loadout is readable.
    ctx.fillStyle = '#0d222b'
    ctx.strokeStyle = '#5f97a1'
    ctx.shadowBlur = 0
    ctx.lineWidth = 1.5
    ctx.fillRect(14, -3.5, 22, 7)
    ctx.strokeRect(14, -3.5, 22, 7)

    // Exposed core.
    ctx.shadowColor = accent
    ctx.shadowBlur = 16
    ctx.fillStyle = accent
    ctx.beginPath()
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2
      const radius = 9 + pulse
      const px = Math.cos(angle) * radius
      const py = Math.sin(angle) * radius
      if (index === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2)
    ctx.fill()

    // Installed operator parts sit in their sockets and keep their glyph upright.
    for (let index = 0; index < SOCKETS.length; index += 1) {
      const part = slots[index]
      if (!part) continue
      const socket = SOCKETS[index]
      const partColor = part.kind === 'multiply' ? AMBER : CYAN
      ctx.save()
      ctx.translate(socket.x, socket.y)
      ctx.fillStyle = '#08191f'
      ctx.strokeStyle = partColor
      ctx.lineWidth = 1.8
      ctx.shadowColor = partColor
      ctx.shadowBlur = 8
      ctx.fillRect(-11, -11, 22, 22)
      ctx.strokeRect(-11, -11, 22, 22)
      ctx.shadowBlur = 0
      ctx.rotate(-heading)
      ctx.fillStyle = partColor
      ctx.font = '700 11px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(operatorLabel(part), 0, 0)
      ctx.restore()
    }
    ctx.restore()
  }

  const drawStick = () => {
    if (!stick) return
    const dx = stick.x - stick.originX
    const dy = stick.y - stick.originY
    const length = Math.hypot(dx, dy)
    const capped = Math.min(length, STICK_RADIUS)
    const nx = length > 0 ? dx / length : 0
    const ny = length > 0 ? dy / length : 0
    ctx.strokeStyle = 'rgba(101,245,237,.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(stick.originX, stick.originY, STICK_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(101,245,237,.22)'
    ctx.strokeStyle = CYAN
    ctx.beginPath()
    ctx.arc(stick.originX + nx * capped, stick.originY + ny * capped, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
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
    for (const shot of enemyBullets) {
      const angle = Math.atan2(shot.vy, shot.vx)
      ctx.save()
      ctx.translate(shot.x, shot.y)
      ctx.rotate(angle)
      ctx.fillStyle = RED
      ctx.shadowColor = RED
      ctx.shadowBlur = 12
      ctx.fillRect(-7, -2, 14, 4)
      ctx.restore()
    }
    ctx.shadowBlur = 0
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
    addButton(panel.x + panel.w - 174, cardY + 14, 134, 44, '6 SCRAP', buyAmplifier, AMBER)
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
    ctx.save()
    applyCamera()
    if (!['signal', 'reward', 'shop', 'assembly', 'bossIntro', 'victory', 'defeat'].includes(phase)) {
      drawPlayer()
    }
    if (phase === 'elite' || phase === 'boss') {
      drawEnemy()
      drawCombatEffects()
      if (enemy) {
        ctx.fillStyle = '#d9e9ed'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.font = '700 12px ui-monospace, monospace'
        ctx.fillText(enemy.name, enemy.x, enemy.y - 96)
      }
    }
    ctx.restore()
    drawStick()
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

// Rotates along the short arc so the hull never spins the long way round.
function turnToward(current: number, target: number, rate: number): number {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * Math.min(1, rate)
}

function moduleLabel(kind: ModuleKind): string {
  if (kind === 'guard') return '보호 모듈'
  if (kind === 'gun') return '무기 모듈'
  return '핵심 코어'
}

function operatorLabel(part: OperatorPart): string {
  return part.kind === 'add' ? `+${part.value}` : `×${part.value}`
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
