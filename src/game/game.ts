import {
  calculateMass,
  calculateMassLimit,
  calculatePower,
  canAttachPart,
  firstOpenSocket,
  isSocketUnlocked,
  movementScale,
  partDurability,
  partResaleValue,
  readSave,
  shipSocketLayout,
  socketDescendantIndices,
  SOCKET_LAYOUT_VERSION,
  writeSave,
  type DefenseKind,
  type OperatorPart,
  type SaveData,
  type ShipPart,
  type WeaponKind,
} from './logic'
import { previewPart, rewardScrapValue, rollRewardChoices } from './rewards'
import {
  COMBAT_CLEAR_DURATION,
  OVERFLOW_COOLDOWN,
  OVERFLOW_DURATION,
  OVERFLOW_THRESHOLD,
  basicCannonOffsets,
  resolvedCombatPhase,
  type CombatPhase,
} from './combat'

type Phase =
  | 'tutorial'
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
type Button = {
  x: number
  y: number
  w: number
  h: number
  action: () => void
  hoverText?: string
  hitTest?(point: Point): boolean
}
type ModuleKind = 'guard' | 'gun' | 'core'
type Zone = { x: number; y: number; radius: number; label: string; risk: string }
type EnemyModule = {
  id: string
  kind: ModuleKind
  offset: Point
  hp: number
  maxHp: number
}
type EnemyShip = { x: number; y: number; heading: number; name: string; modules: EnemyModule[] }
type Bullet = { x: number; y: number; vx: number; vy: number; damage: number; life: number; kind: 'cannon' | 'homing' | 'explosive'; size?: number }
type Mine = { x: number; y: number; damage: number; life: number }
type EnemyBullet = { x: number; y: number; vx: number; vy: number; damage: number; life: number }
type PlayerModule = { id: 'armor-top' | 'armor-bottom' | 'core'; kind: 'armor' | 'core'; offset: Point; hp: number; maxHp: number }
type Stick = { pointerId: number; originX: number; originY: number; x: number; y: number }

const ADD_ONE: OperatorPart = { kind: 'add', value: 1, mass: 2 }
const ADD_THREE: OperatorPart = { kind: 'add', value: 3, mass: 3 }
const TIMES_TWO: OperatorPart = { kind: 'multiply', value: 2, mass: 5 }
const HOMING_PART: ShipPart = { kind: 'weapon', weapon: 'homing', mass: 4 }
const MINE_PART: ShipPart = { kind: 'weapon', weapon: 'mine', mass: 3 }
const SAW_PART: ShipPart = { kind: 'weapon', weapon: 'saw', mass: 4 }
const EXPLOSIVE_PART: ShipPart = { kind: 'weapon', weapon: 'explosive', mass: 5 }
const BODY_PART: ShipPart = { kind: 'body', mass: 2 }
const INTERCEPTOR_PART: ShipPart = { kind: 'defense', defense: 'interceptor', mass: 3 }
const SHIELD_PART: ShipPart = { kind: 'defense', defense: 'shield', mass: 4 }
const REPAIR_PART: ShipPart = { kind: 'defense', defense: 'repair', mass: 4 }
const REWARD_POOL: readonly ShipPart[] = [
  ADD_THREE,
  TIMES_TWO,
  BODY_PART,
  HOMING_PART,
  MINE_PART,
  EXPLOSIVE_PART,
]
const CYAN = '#65f5ed'
const AMBER = '#ffbd59'
const RED = '#ff5268'
const INK = '#071016'
const WORLD = { w: 4200, h: 4200 }
const STICK_RADIUS = 62
const DEFAULT_ZOOM = 0.72
const MIN_ZOOM = 0.45
const MAX_ZOOM = 1.1
const BOSS_REWARD_SCRAP = 25
const SENSOR_RANGE = 920
const GRID_WORLD_SIZE = 120
const CRUISE_SPEED = 112
const BOOST_SPEED = 185
const BOOST_DURATION = 1.2
const BOOST_COOLDOWN = 2.6
const WARP_DURATION = 1.25
const UNKNOWN_ZONE: Zone = { x: 2920, y: 1900, radius: 155, label: 'UNKNOWN // WARDEN', risk: '■■■□□' }
const BOSS_ZONE: Zone = { x: 3580, y: 820, radius: 190, label: 'MAIN // LIMIT BREAKER', risk: '■■■■■' }

export type GameResult = {
  outcome: 'victory' | 'defeat'
  scrapGained: number
  defeated: string[]
  discoveries: number
  slots: Array<ShipPart | null>
}

export function createGame(
  canvas: HTMLCanvasElement,
  options: { onResult?(result: GameResult): void } = {},
): { destroy(): void } {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')

  let width = 1280
  let height = 720
  let phase: Phase = 'void'
  const storage = safeStorage()
  let save: SaveData = readSave(storage)
  phase = save.tutorialSeen ? 'void' : 'tutorial'
  const restoredRun = save.safeRun
  let slots: Array<ShipPart | null> = restoredRun?.slots.slice()
    ?? [ADD_ONE, null, null, null]
  let slotIntegrity = slots.map((part, index) => part
    ? restoredRun?.slotIntegrity[index] ?? partDurability(part)
    : 0)
  let pendingPart: ShipPart | null = null
  let rewardChoices: ShipPart[] = []
  let selectedRewardIndex: number | null = null
  let rewardRerolled = false
  let deliveryPart: ShipPart | null = null
  let pendingSelected = false
  let player = {
    x: WORLD.w * (restoredRun?.xRatio ?? 0.5),
    y: WORLD.h * (restoredRun?.yRatio ?? 0.5),
  }
  let playerModules = createPlayerModules()
  let heading = -Math.PI / 2
  let velocity: Point = { x: 0, y: 0 }
  let thrust = 0
  let boostTime = 0
  let boostCooldown = 0
  let warpTimer = 0
  let warpDestination: Point | null = null
  let enemy: EnemyShip | null = null
  let bullets: Bullet[] = []
  let mines: Mine[] = []
  let enemyBullets: EnemyBullet[] = []
  let fireTimer = 0
  const equipmentTimers = { homing: 0, mine: 0, saw: 0, explosive: 0, interceptor: 0, repair: 0 }
  let shieldFlash = 0
  let collisionTimer = 0
  let enemyAttackTimer = 1.2
  let combatClearTime = 0
  let clearedCombatPhase: CombatPhase | null = null
  let explored = restoredRun?.explored ?? 0
  let unknownDiscovered = explored > 0
  let unknownResolved = explored >= 100
  let idleTime = 4
  let cloaked = true
  let stick: Stick | null = null
  let hoverPoint: Point | null = null
  let deliveryTimer = 0
  let overflowPulse = 0
  let overflowTime = 0
  let overflowCooldown = 0
  let flash = 0
  let message = '자유 항해 중 · 센서 범위에서 미지 구역을 찾으세요'
  let buttons: Button[] = []
  let shopPage = 0
  let shopManagePage = 0
  let selectedMountedSlot: number | null = null
  let selectedSwapSlot: number | null = null
  let massHelpOpen = false
  let cameraZoom = DEFAULT_ZOOM
  let tutorialPage = 0
  let frame = 0
  let destroyed = false
  let lastTime = performance.now()
  const keys = new Set<string>()

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const nextWidth = Math.max(320, Math.round(rect.width || 1280))
    const nextHeight = Math.max(420, Math.round(rect.height || 720))
    const pixelWidth = Math.round(nextWidth * ratio)
    const pixelHeight = Math.round(nextHeight * ratio)
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }
    width = nextWidth
    height = nextHeight
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  const persist = () => writeSave(save, storage)

  const persistSafeRun = () => {
    save.safeRun = {
      socketLayoutVersion: SOCKET_LAYOUT_VERSION,
      xRatio: player.x / WORLD.w,
      yRatio: player.y / WORLD.h,
      explored,
      slots: slots.map((part) => part ? { ...part } : null),
      slotIntegrity: [...slotIntegrity],
    }
    persist()
  }

  // The ship stays locked to the middle of the screen; the world scrolls past it.
  const applyCamera = () => {
    ctx.translate(width / 2, height / 2)
    ctx.scale(cameraZoom, cameraZoom)
    ctx.translate(-player.x, -player.y)
  }

  const modulePosition = (part: EnemyModule): Point => ({
    x: (enemy?.x ?? 0) + part.offset.x * Math.cos(enemy?.heading ?? 0) - part.offset.y * Math.sin(enemy?.heading ?? 0),
    y: (enemy?.y ?? 0) + part.offset.x * Math.sin(enemy?.heading ?? 0) + part.offset.y * Math.cos(enemy?.heading ?? 0),
  })

  const playerCore = () => playerModules.find((part) => part.kind === 'core')!

  const damagePlayerSlot = (index: number, damage: number) => {
    const part = slots[index]
    if (!part) return
    slotIntegrity[index] = Math.max(0, slotIntegrity[index] - damage)
    if (slotIntegrity[index] > 0) return
    const destroyed = partLabel(part)
    const destroyedWasBody = part.kind === 'body'
    slots[index] = null
    message = `${destroyed} 부품 파괴 · 연결 효과 상실`
    if (destroyedWasBody) {
      for (const orphan of socketDescendantIndices(index)) {
        if (!slots[orphan]) continue
        slots[orphan] = null
        slotIntegrity[orphan] = 0
        message = `${destroyed} 파괴 · 연결된 외곽 부품도 분리됨`
      }
    }
  }

  const resolveShipCollision = () => {
    if (!enemy) return
    let dx = enemy.x - player.x
    let dy = enemy.y - player.y
    let distance = Math.hypot(dx, dy)
    const hullRadius = Math.max(50, ...shipSocketLayout(slots)
      .filter((socket) => slots[socket.index])
      .map((socket) => Math.hypot(socket.x, socket.y) + 16))
    const collisionDistance = hullRadius + 55
    if (distance >= collisionDistance) return
    if (distance < 0.01) {
      dx = Math.cos(heading)
      dy = Math.sin(heading)
      distance = 1
    }
    const nx = dx / distance
    const ny = dy / distance
    const overlap = collisionDistance - distance
    player.x -= nx * overlap * 0.45
    player.y -= ny * overlap * 0.45
    enemy.x += nx * overlap * 0.55
    enemy.y += ny * overlap * 0.55
    const approachSpeed = velocity.x * nx + velocity.y * ny
    if (approachSpeed > 0) {
      velocity.x -= nx * approachSpeed * 1.45
      velocity.y -= ny * approachSpeed * 1.45
    }
    velocity.x -= nx * 12
    velocity.y -= ny * 12
    if (collisionTimer <= 0) {
      collisionTimer = 0.55
      shieldFlash = 0.16
      message = '기체 충돌 · 서로 밀려났습니다'
    }
  }

  const damageEnemyPart = (part: EnemyModule, damage: number) => {
    const targetEnemy = enemy
    part.hp = Math.max(0, part.hp - damage)
    if (part.hp > 0) return
    flash = 0.18
    if (part.kind === 'core' && targetEnemy) finishCombat(targetEnemy)
    else message = `${moduleLabel(part.kind)} 파괴`
  }

  const beginElite = () => {
    phase = 'elite'
    cloaked = false
    playerModules = createPlayerModules()
    heading = 0
    velocity = { x: 0, y: 0 }
    enemy = {
      x: player.x + 430,
      y: player.y - 20,
      heading: Math.PI,
      name: '미지 정예기체 // WARDEN',
      modules: [
        { id: 'elite-guard', kind: 'guard', offset: { x: 0, y: -52 }, hp: 16, maxHp: 16 },
        { id: 'elite-gun', kind: 'gun', offset: { x: 58, y: 0 }, hp: 14, maxHp: 14 },
        { id: 'elite-core', kind: 'core', offset: { x: 0, y: 0 }, hp: 30, maxHp: 30 },
      ],
    }
    bullets = []
    mines = []
    enemyBullets = []
    enemyAttackTimer = 1.1
    combatClearTime = 0
    clearedCombatPhase = null
    message = '코어를 바로 노리거나 외부 모듈부터 해체하세요'
  }

  const beginBoss = () => {
    phase = 'boss'
    cloaked = false
    playerModules = createPlayerModules()
    heading = 0
    velocity = { x: 0, y: 0 }
    enemy = {
      x: player.x + 460,
      y: player.y - 20,
      heading: Math.PI,
      name: 'MAIN SIGNAL // LIMIT BREAKER',
      modules: [
        { id: 'boss-guard-a', kind: 'guard', offset: { x: 0, y: -58 }, hp: 20, maxHp: 20 },
        { id: 'boss-guard-b', kind: 'guard', offset: { x: 0, y: 58 }, hp: 20, maxHp: 20 },
        { id: 'boss-gun', kind: 'gun', offset: { x: 64, y: 0 }, hp: 16, maxHp: 16 },
        { id: 'boss-core', kind: 'core', offset: { x: 0, y: 0 }, hp: 46, maxHp: 46 },
      ],
    }
    bullets = []
    mines = []
    enemyBullets = []
    enemyAttackTimer = 0.9
    combatClearTime = 0
    clearedCombatPhase = null
    message = '코어 직접 타격 가능 · 외부 무기를 먼저 끊을 수도 있습니다'
  }

  const relocateToVoid = () => {
    player = { x: WORLD.w * 0.5, y: WORLD.h * 0.5 }
    heading = -Math.PI / 2
    velocity = { x: 0, y: 0 }
    idleTime = 4
    cloaked = true
    stick = null
  }

  const finishCombat = (defeatedEnemy: EnemyShip) => {
    if (enemy !== defeatedEnemy) return
    const completedPhase = resolvedCombatPhase(phase, defeatedEnemy.modules)
    if (!completedPhase || combatClearTime > 0) return
    bullets = []
    mines = []
    enemyBullets = []
    velocity = { x: 0, y: 0 }
    stick = null
    boostTime = 0
    clearedCombatPhase = completedPhase
    combatClearTime = COMBAT_CLEAR_DURATION
    overflowPulse = completedPhase === 'boss' ? 2.4 : 1.4
    message = completedPhase === 'boss' ? 'MAIN CORE DESTROYED · LIMIT BREAK' : 'TARGET CORE DESTROYED · SIGNAL CLEAR'
  }

  const completeCombat = () => {
    const completedPhase = clearedCombatPhase
    if (!completedPhase) return
    if (phase !== completedPhase || !enemy || resolvedCombatPhase(phase, enemy.modules) !== completedPhase) {
      clearedCombatPhase = null
      combatClearTime = 0
      return
    }
    clearedCombatPhase = null
    combatClearTime = 0
    enemy = null
    relocateToVoid()
    if (completedPhase === 'elite') {
      save.scrap += 10
      persist()
      pendingPart = null
      rewardChoices = rollRewardChoices(REWARD_POOL, 3)
      selectedRewardIndex = null
      rewardRerolled = false
      phase = 'reward'
      message = '공백 복귀 완료 · 무작위 증강 3개 중 하나를 선택하세요'
    } else if (completedPhase === 'boss') {
      phase = 'victory'
      save.scrap += BOSS_REWARD_SCRAP
      save.victories += 1
      overflowPulse = 3
      unknownResolved = true
      explored = 100
      save.safeRun = null
      persist()
      message = `LIMIT 돌파 · 보상 ${BOSS_REWARD_SCRAP} SCRAP 획득`
      options.onResult?.({
        outcome: 'victory',
        scrapGained: BOSS_REWARD_SCRAP,
        defeated: ['미지 정예기체 // WARDEN', 'MAIN SIGNAL // LIMIT BREAKER'],
        discoveries: save.discoveries,
        slots: slots.map((part) => part ? { ...part } : null),
      })
    }
  }

  const resetRun = () => {
    phase = 'void'
    slots = [ADD_ONE, null, null, null]
    slotIntegrity = [partDurability(ADD_ONE), 0, 0, 0]
    pendingPart = null
    rewardChoices = []
    selectedRewardIndex = null
    rewardRerolled = false
    player = { x: WORLD.w * 0.5, y: WORLD.h * 0.5 }
    playerModules = createPlayerModules()
    heading = -Math.PI / 2
    velocity = { x: 0, y: 0 }
    enemy = null
    bullets = []
    mines = []
    enemyBullets = []
    overflowTime = 0
    overflowCooldown = 0
    combatClearTime = 0
    clearedCombatPhase = null
    explored = 0
    unknownDiscovered = false
    unknownResolved = false
    idleTime = 4
    cloaked = true
    stick = null
    save.safeRun = null
    persist()
    message = '자유 항해 중 · 센서 범위에서 미지 구역을 찾으세요'
  }

  const enterVoidAfterReward = () => {
    rewardChoices = []
    selectedRewardIndex = null
    rewardRerolled = false
    phase = 'void'
    explored = 100
    unknownResolved = true
    idleTime = 4
    cloaked = true
    persistSafeRun()
    message = '클로킹 완료 · 공백 상점을 이용하세요'
  }

  const warpNearBoss = () => {
    velocity = { x: 0, y: 0 }
    boostTime = 0
    idleTime = 0
    cloaked = false
    phase = 'void'
    warpTimer = WARP_DURATION
    warpDestination = { x: BOSS_ZONE.x - 760, y: BOSS_ZONE.y + 180 }
    message = 'WARP 좌표 고정 · 공간 도약 중'
  }

  const selectSocket = (index: number) => {
    if (!pendingPart || !pendingSelected || !canAttachPart(slots, index, pendingPart)) return
    slots[index] = pendingPart
    slotIntegrity[index] = partDurability(pendingPart)
    pendingPart = null
    pendingSelected = false
    overflowPulse = calculatePower(2, slots) >= 10 ? 1.8 : 0.6
    enterVoidAfterReward()
  }

  const dismantlePending = () => {
    if (!pendingPart) return
    save.scrap += rewardScrapValue(pendingPart)
    persist()
    pendingPart = null
    enterVoidAfterReward()
  }

  const attachRewardChoice = () => {
    if (selectedRewardIndex === null) {
      message = '먼저 증강 카드 하나를 선택하세요'
      return
    }
    pendingPart = rewardChoices[selectedRewardIndex]
    pendingSelected = false
    phase = 'assembly'
    message = `${partLabel(pendingPart)} 선택 · 장착할 소켓을 지정하세요`
  }

  const dismantleRewardChoice = () => {
    if (selectedRewardIndex === null) {
      message = '분해할 증강 카드 하나를 선택하세요'
      return
    }
    const part = rewardChoices[selectedRewardIndex]
    const value = rewardScrapValue(part)
    save.scrap += value
    persist()
    message = `${partLabel(part)} 분해 · +${value} SCRAP`
    enterVoidAfterReward()
  }

  const rerollRewards = () => {
    if (rewardRerolled) {
      message = '이번 보상의 리롤은 이미 사용했습니다'
      return
    }
    rewardChoices = rollRewardChoices(REWARD_POOL, 3)
    selectedRewardIndex = null
    rewardRerolled = true
    message = '후보 3개를 다시 추첨했습니다'
  }

  const abandonRewards = () => {
    message = '보상을 포기하고 공백 항로로 복귀합니다'
    enterVoidAfterReward()
  }

  const sellMountedPart = (index: number) => {
    const part = slots[index]
    if (!part) return
    if (selectedMountedSlot !== index) {
      selectedMountedSlot = index
      message = `${partLabel(part)} 판매를 한 번 더 눌러 확정하세요`
      return
    }
    const hasAttachedDescendant = part.kind === 'body'
      && socketDescendantIndices(index).some((candidateIndex) => Boolean(slots[candidateIndex]))
    if (hasAttachedDescendant) {
      selectedMountedSlot = null
      message = '몸체 제거 불가 · 연결된 외곽 장비를 먼저 판매하세요'
      return
    }
    const value = partResaleValue(part, slotIntegrity[index])
    save.scrap += value
    slots[index] = null
    slotIntegrity[index] = 0
    selectedMountedSlot = null
    persistSafeRun()
    message = `${partLabel(part)} 제거 및 판매 완료 · +${value} SCRAP`
  }

  const selectSwapSlot = (index: number) => {
    const part = slots[index]
    if (selectedSwapSlot === null) {
      if (!part) {
        message = '먼저 이동할 부품을 선택하세요'
        return
      }
      selectedSwapSlot = index
      message = `${partLabel(part)} 선택 · 옮길 소켓을 탭하세요`
      return
    }
    if (selectedSwapSlot === index) {
      selectedSwapSlot = null
      message = '순서 교환 선택을 취소했습니다'
      return
    }
    if (!isSocketUnlocked(slots, index)) {
      message = '잠긴 소켓에는 배치할 수 없습니다'
      return
    }
    const sourceIndex = selectedSwapSlot
    if (!slots[sourceIndex]) {
      selectedSwapSlot = null
      return
    }
    const projected = [...slots]
    ;[projected[sourceIndex], projected[index]] = [projected[index], projected[sourceIndex]]
    const createsOrphan = projected.some((candidate, candidateIndex) => candidate && !isSocketUnlocked(projected, candidateIndex))
    if (createsOrphan) {
      message = '배치 불가 · BODY에 연결된 외곽 부품을 먼저 이동하세요'
      return
    }
    const before = calculatePower(2, slots)
    ;[slots[sourceIndex], slots[index]] = [slots[index], slots[sourceIndex]]
    ;[slotIntegrity[sourceIndex], slotIntegrity[index]] = [slotIntegrity[index], slotIntegrity[sourceIndex]]
    const after = calculatePower(2, slots)
    selectedSwapSlot = null
    overflowPulse = after >= OVERFLOW_THRESHOLD ? 1.4 : 0.45
    persistSafeRun()
    message = `부품 배치 변경 · FIRE ${before} → ${after}${after >= OVERFLOW_THRESHOLD ? ' · OVERFLOW 준비' : ''}`
  }

  const openHullManagement = () => {
    velocity = { x: 0, y: 0 }
    stick = null
    shopPage = 3
    selectedMountedSlot = null
    selectedSwapSlot = null
    phase = 'shop'
    message = '함선 본체 정보 · 부품을 이동하거나 분해하세요'
  }

  const buyPart = (part: ShipPart, cost: number) => {
    if (firstOpenSocket(slots, part) < 0) {
      message = part.kind === 'body' ? 'BODY를 확장할 수 있는 소켓이 없습니다' : '장착 가능한 빈 소켓이 없습니다'
      return
    }
    if (save.scrap < cost) {
      message = '스크랩이 부족합니다'
      return
    }
    save.scrap -= cost
    persist()
    deliveryPart = part
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

  const inside = (point: Point, button: Button) => button.hitTest?.(point) ?? (
    point.x >= button.x
    && point.x <= button.x + button.w
    && point.y >= button.y
    && point.y <= button.y + button.h
  )

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
  }

  const onPointerMove = (event: PointerEvent) => {
    hoverPoint = pointFromEvent(event)
    if (!stick || stick.pointerId !== event.pointerId) return
    const point = hoverPoint
    stick.x = point.x
    stick.y = point.y
  }

  const onPointerUp = (event: PointerEvent) => {
    if (stick && stick.pointerId === event.pointerId) stick = null
  }
  const onPointerLeave = () => { hoverPoint = null }
  const onKeyDown = (event: KeyboardEvent) => {
    const code = event.code.toLowerCase()
    keys.add(code)
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'].includes(code)) {
      event.preventDefault()
    }
    if (!event.repeat && ['space', 'shiftleft', 'shiftright'].includes(code)) triggerBoost()
    if (!event.repeat && ['minus', 'bracketleft', 'numpadsubtract'].includes(code)) changeZoom(-0.1)
    if (!event.repeat && ['equal', 'bracketright', 'numpadadd'].includes(code)) changeZoom(0.1)
  }
  const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code.toLowerCase())
  const onBlur = () => {
    keys.clear()
    stick = null
    velocity = { x: 0, y: 0 }
    boostTime = 0
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
  canvas.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)

  const movementVector = (): Point => {
    let x = 0
    let y = 0
    if (keys.has('keya') || keys.has('arrowleft')) x -= 1
    if (keys.has('keyd') || keys.has('arrowright')) x += 1
    if (keys.has('keyw') || keys.has('arrowup')) y -= 1
    if (keys.has('keys') || keys.has('arrowdown')) y += 1

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

  const changeZoom = (delta: number) => {
    cameraZoom = clamp(Math.round((cameraZoom + delta) * 100) / 100, MIN_ZOOM, MAX_ZOOM)
    message = `화면 배율 ${Math.round(cameraZoom * 100)}%`
  }

  const triggerBoost = () => {
    const steerable = phase === 'void' || phase === 'elite' || phase === 'boss'
    if (!steerable || combatClearTime > 0 || boostCooldown > 0 || warpTimer > 0) return
    const movement = movementVector()
    const hasDirection = Math.hypot(movement.x, movement.y) > 0.05
    const angle = hasDirection ? Math.atan2(movement.y, movement.x) : heading
    const massScale = movementScale(calculateMass(slots), calculateMassLimit(slots))
    velocity.x += Math.cos(angle) * 86 * massScale
    velocity.y += Math.sin(angle) * 86 * massScale
    const speed = Math.hypot(velocity.x, velocity.y)
    const boostLimit = BOOST_SPEED * massScale
    if (speed > boostLimit) {
      velocity.x = velocity.x / speed * boostLimit
      velocity.y = velocity.y / speed * boostLimit
    }
    heading = angle
    boostTime = BOOST_DURATION
    boostCooldown = BOOST_COOLDOWN
    thrust = 1
    idleTime = 0
    cloaked = false
    message = 'BOOST 점화 · 속도 상한 일시 해제'
  }

  const updateMovement = (dt: number) => {
    const movement = movementVector()
    const throttle = Math.hypot(movement.x, movement.y)
    const accelerating = throttle > 0
    thrust += ((accelerating ? throttle : 0) - thrust) * Math.min(1, dt * 6)
    const massScale = movementScale(calculateMass(slots), calculateMassLimit(slots))
    const maxSpeed = (boostTime > 0 ? BOOST_SPEED : CRUISE_SPEED) * massScale
    if (accelerating) {
      // Only the hull turns — rotating the camera makes the void nauseating to read.
      heading = turnToward(heading, Math.atan2(movement.y, movement.x), dt * 7 * massScale)
      const acceleration = boostTime > 0 ? 225 : 155
      velocity.x += movement.x * acceleration * dt
      velocity.y += movement.y * acceleration * dt
      const speed = Math.hypot(velocity.x, velocity.y)
      if (speed > maxSpeed) {
        const limitedSpeed = boostTime > 0 ? maxSpeed : Math.max(maxSpeed, speed - 72 * dt)
        velocity.x = velocity.x / speed * limitedSpeed
        velocity.y = velocity.y / speed * limitedSpeed
      }
      idleTime = 0
      cloaked = false
    } else {
      const glide = Math.exp(-1.15 * dt)
      velocity.x *= glide
      velocity.y *= glide
      if (Math.hypot(velocity.x, velocity.y) < 1.2) velocity = { x: 0, y: 0 }
    }

    player.x += velocity.x * dt
    player.y += velocity.y * dt

    const drifting = Math.hypot(velocity.x, velocity.y) >= 1.2
    if (!accelerating && !drifting && phase === 'void') {
      const wasCloaked = cloaked
      idleTime += dt
      cloaked = idleTime >= 3
      if (!wasCloaked && cloaked) persistSafeRun()
    } else if (drifting) {
      idleTime = 0
      cloaked = false
    }

    if (phase !== 'void') return
    const unknownDistance = distanceTo(UNKNOWN_ZONE, player)
    if (!unknownResolved && unknownDistance <= SENSOR_RANGE && !unknownDiscovered) {
      unknownDiscovered = true
      explored = 1
      save.discoveries += 1
      persist()
      message = '미지 구역 감지 · 접근하거나 항로를 유지하세요'
    }
    if (!unknownResolved && unknownDistance <= UNKNOWN_ZONE.radius) {
      phase = 'signal'
      velocity = { x: 0, y: 0 }
      stick = null
      message = '미지 구역 경계 · 진입 여부를 선택하세요'
      return
    }
    const bossAvailable = unknownResolved
    if (bossAvailable && distanceTo(BOSS_ZONE, player) <= BOSS_ZONE.radius) {
      phase = 'bossIntro'
      velocity = { x: 0, y: 0 }
      stick = null
      message = '메인 퀘스트 구역 경계'
    }
  }

  const updateCombat = (dt: number) => {
    updateMovement(dt)
    if (!enemy) return
    const currentPower = calculatePower(2, slots)
    if (currentPower >= OVERFLOW_THRESHOLD && overflowTime <= 0 && overflowCooldown <= 0) {
      overflowTime = OVERFLOW_DURATION
      overflowCooldown = OVERFLOW_COOLDOWN
      overflowPulse = 1.8
      message = `OVERFLOW 발동 · FIRE ${currentPower} · 기본포 4발`
    }
    let chaseAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x)
    const nearbyMine = mines.find((mine) => Math.hypot(mine.x - enemy!.x, mine.y - enemy!.y) < 150)
    if (nearbyMine) chaseAngle += Math.sin(performance.now() * 0.003) > 0 ? 0.65 : -0.65
    enemy.heading = turnToward(enemy.heading, chaseAngle, dt * 1.25)
    const chaseDistance = Math.hypot(player.x - enemy.x, player.y - enemy.y)
    if (chaseDistance > 92) {
      const chaseSpeed = phase === 'boss' ? 22 : 27
      enemy.x += Math.cos(enemy.heading) * chaseSpeed * dt
      enemy.y += Math.sin(enemy.heading) * chaseSpeed * dt
    }
    resolveShipCollision()
    fireTimer -= dt
    if (fireTimer <= 0) {
      const overflowActive = overflowTime > 0
      for (const side of basicCannonOffsets(overflowActive)) {
        bullets.push({
          x: player.x + Math.cos(heading) * 28 - Math.sin(heading) * side * 6,
          y: player.y + Math.sin(heading) * 28 + Math.cos(heading) * side * 6,
          vx: Math.cos(heading) * 520,
          vy: Math.sin(heading) * 520,
          damage: currentPower * 0.7,
          life: 1.8,
          kind: 'cannon',
          size: overflowActive ? 6.5 : 3.5,
        })
      }
      fireTimer = 0.85
    }

    const weapons = slots.filter((part) => part?.kind === 'weapon').map((part) => part!.weapon)
    const defenses = slots.filter((part) => part?.kind === 'defense').map((part) => part!.defense)
    equipmentTimers.homing -= dt
    equipmentTimers.mine -= dt
    equipmentTimers.saw -= dt
    equipmentTimers.explosive -= dt
    equipmentTimers.interceptor -= dt
    equipmentTimers.repair -= dt
    if (weapons.includes('homing') && equipmentTimers.homing <= 0) {
      bullets.push({ x: player.x, y: player.y, vx: Math.cos(heading) * 185, vy: Math.sin(heading) * 185, damage: 26, life: 4.5, kind: 'homing' })
      equipmentTimers.homing = 2.6
    }
    if (weapons.includes('explosive') && equipmentTimers.explosive <= 0) {
      bullets.push({ x: player.x, y: player.y, vx: Math.cos(heading) * 155, vy: Math.sin(heading) * 155, damage: 30, life: 3.8, kind: 'explosive' })
      equipmentTimers.explosive = 3.4
    }
    if (weapons.includes('mine') && equipmentTimers.mine <= 0) {
      mines.push({ x: player.x - Math.cos(heading) * 32, y: player.y - Math.sin(heading) * 32, damage: 34, life: 8 })
      equipmentTimers.mine = 3
    }
    if (weapons.includes('saw') && equipmentTimers.saw <= 0) {
      const sawX = player.x + Math.cos(heading) * 54
      const sawY = player.y + Math.sin(heading) * 54
      const hit = enemy.modules.find((part) => part.hp > 0 && Math.hypot(modulePosition(part).x - sawX, modulePosition(part).y - sawY) < 42)
      if (hit) damageEnemyPart(hit, 24)
      equipmentTimers.saw = 0.38
    }
    if (defenses.includes('interceptor') && equipmentTimers.interceptor <= 0) {
      const shot = enemyBullets.find((item) => Math.hypot(item.x - player.x, item.y - player.y) < 170)
      if (shot) {
        enemyBullets = enemyBullets.filter((item) => item !== shot)
        shieldFlash = 0.28
      }
      equipmentTimers.interceptor = 1.8
    }
    if (defenses.includes('repair') && equipmentTimers.repair <= 0) {
      playerModules.forEach((part) => { part.hp = Math.min(part.maxHp, part.hp + 6) })
      slots.forEach((part, index) => {
        if (part) slotIntegrity[index] = Math.min(partDurability(part), slotIntegrity[index] + 5)
      })
      equipmentTimers.repair = 4.8
    }

    bullets = bullets.filter((bullet) => {
      if (bullet.kind === 'homing' && enemy) {
        const target = enemy.modules.find((part) => part.kind === 'core' && part.hp > 0)
          ?? enemy.modules.find((part) => part.hp > 0)
        if (target) {
          const pos = modulePosition(target)
          const current = Math.atan2(bullet.vy, bullet.vx)
          const aimed = turnToward(current, Math.atan2(pos.y - bullet.y, pos.x - bullet.x), dt * 1.6)
          bullet.vx = Math.cos(aimed) * 185
          bullet.vy = Math.sin(aimed) * 185
        }
      }
      bullet.x += bullet.vx * dt
      bullet.y += bullet.vy * dt
      bullet.life -= dt
      if (bullet.life <= 0 || !enemy) return false
      const part = enemy.modules.find((item) => {
        if (item.hp <= 0) return false
        const pos = modulePosition(item)
        return Math.hypot(pos.x - bullet.x, pos.y - bullet.y) <= (item.kind === 'core' ? 27 : 30)
      })
      if (part) {
        if (bullet.kind === 'explosive' && enemy) {
          const impact = modulePosition(part)
          enemy.modules.forEach((candidate) => {
            if (candidate.hp > 0 && Math.hypot(modulePosition(candidate).x - impact.x, modulePosition(candidate).y - impact.y) < 92) {
              damageEnemyPart(candidate, bullet.damage)
            }
          })
          overflowPulse = 0.35
        } else {
          damageEnemyPart(part, bullet.damage)
        }
        return false
      }
      return true
    })
    if (!enemy || combatClearTime > 0) return

    mines = mines.filter((mine) => {
      mine.life -= dt
      if (mine.life <= 0 || !enemy) return false
      if (Math.hypot(mine.x - enemy.x, mine.y - enemy.y) > 82) return true
      enemy.modules.forEach((part) => { if (part.hp > 0) damageEnemyPart(part, mine.damage) })
      overflowPulse = 0.4
      return false
    })
    if (!enemy || combatClearTime > 0) return

    enemyAttackTimer -= dt
    if (enemyAttackTimer <= 0) {
      // Shots leave the surviving gun modules, so tearing them off visibly thins the fire.
      const guns = enemy.modules.filter((part) => part.kind === 'gun' && part.hp > 0)
      const origins = guns.length ? guns.map(modulePosition) : [{ x: enemy.x, y: enemy.y }]
      const shotSpeed = phase === 'boss' ? 220 : 260
      const damage = phase === 'boss' ? 18 : 9
      for (const origin of origins) {
        enemyBullets.push({
          x: origin.x,
          y: origin.y,
          vx: Math.cos(enemy.heading) * shotSpeed,
          vy: Math.sin(enemy.heading) * shotSpeed,
          damage,
          life: 4,
        })
      }
      enemyAttackTimer = guns.length
        ? (phase === 'boss' ? 2.8 : 2.3)
        : (phase === 'boss' ? 3.4 : 3.8)
    }

    enemyBullets = enemyBullets.filter((shot) => {
      shot.x += shot.vx * dt
      shot.y += shot.vy * dt
      shot.life -= dt
      if (shot.life <= 0) return false
      if (defenses.includes('shield')) {
        const dx = shot.x - player.x
        const dy = shot.y - player.y
        const forward = dx * Math.cos(heading) + dy * Math.sin(heading)
        const side = Math.abs(-dx * Math.sin(heading) + dy * Math.cos(heading))
        if (forward > 0 && forward < 58 && side < 38) {
          shieldFlash = 0.35
          return false
        }
      }
      const slotHit = slots.findIndex((part, index) => {
        if (!part || slotIntegrity[index] <= 0) return false
        const socket = shipSocketLayout(slots).find((candidate) => candidate.index === index)
        if (!socket) return false
        const pos = rotatedOffsetPosition(socket, player, heading)
        return Math.hypot(pos.x - shot.x, pos.y - shot.y) <= 14
      })
      if (slotHit >= 0) {
        damagePlayerSlot(slotHit, shot.damage)
        flash = 0.2
        return false
      }
      const hit = playerModules.find((part) => {
        if (part.hp <= 0) return false
        const pos = playerModulePosition(part, player, heading)
        return Math.hypot(pos.x - shot.x, pos.y - shot.y) <= (part.kind === 'core' ? 12 : 15)
      })
      if (!hit) return true
      hit.hp = Math.max(0, hit.hp - shot.damage)
      flash = 0.25
      if (hit.kind === 'armor' && hit.hp <= 0) message = '외부 장갑 파괴 · 핵심 코어 노출 위험'
      if (playerCore().hp <= 0) {
        combatClearTime = 0
        clearedCombatPhase = null
        phase = 'defeat'
        enemy = null
        bullets = []
        mines = []
        enemyBullets = []
        save.safeRun = null
        persist()
        message = '핵심 코어가 파괴되었습니다'
        options.onResult?.({
          outcome: 'defeat',
          scrapGained: 0,
          defeated: unknownResolved ? ['미지 정예기체 // WARDEN'] : [],
          discoveries: save.discoveries,
          slots: [ADD_ONE, null, null, null],
        })
      }
      return false
    })
  }

  const update = (dt: number) => {
    flash = Math.max(0, flash - dt)
    shieldFlash = Math.max(0, shieldFlash - dt)
    collisionTimer = Math.max(0, collisionTimer - dt)
    overflowPulse = Math.max(0, overflowPulse - dt)
    overflowTime = Math.max(0, overflowTime - dt)
    overflowCooldown = Math.max(0, overflowCooldown - dt)
    boostTime = Math.max(0, boostTime - dt)
    boostCooldown = Math.max(0, boostCooldown - dt)
    if (warpTimer > 0) {
      const previousWarpTime = warpTimer
      warpTimer = Math.max(0, warpTimer - dt)
      if (previousWarpTime > WARP_DURATION / 2 && warpTimer <= WARP_DURATION / 2 && warpDestination) {
        player = { ...warpDestination }
        heading = -0.22
        warpDestination = null
      }
      if (warpTimer <= 0) message = '워프 완료 · 메인 신호까지 직접 접근하세요'
    } else if (phase === 'void') updateMovement(dt)
    if (combatClearTime > 0) {
      combatClearTime = Math.max(0, combatClearTime - dt)
      if (combatClearTime <= 0) completeCombat()
    } else if (phase === 'elite' || phase === 'boss') updateCombat(dt)
    if (phase === 'delivery') {
      deliveryTimer += dt
      if (deliveryTimer >= 1.8) {
        pendingPart = deliveryPart ?? TIMES_TWO
        deliveryPart = null
        pendingSelected = false
        phase = 'assembly'
        message = '배송 완료 · 부품을 선택하고 소켓에 장착하세요'
      }
    }
  }

  const glassPanel = (x: number, y: number, w: number, h: number, radius = 18, accent = '#35515d') => {
    const fill = ctx.createLinearGradient(x, y, x + w, y + h)
    fill.addColorStop(0, 'rgba(13,31,43,.92)')
    fill.addColorStop(0.55, 'rgba(8,17,27,.9)')
    fill.addColorStop(1, 'rgba(31,17,45,.82)')
    roundedPath(ctx, x, y, w, h, radius)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = accent
    ctx.lineWidth = 1
    ctx.stroke()
  }

  const addButton = (x: number, y: number, w: number, h: number, label: string, action: () => void, accent = CYAN, hoverText?: string) => {
    const button = { x, y, w, h, action, hoverText }
    const hovered = hoverPoint ? inside(hoverPoint, button) : false
    const fill = ctx.createLinearGradient(x, y, x + w, y + h)
    fill.addColorStop(0, `${accent}${hovered ? '40' : '24'}`)
    fill.addColorStop(1, hovered ? 'rgba(116,72,168,.32)' : 'rgba(38,25,59,.2)')
    roundedPath(ctx, x, y, w, h, Math.min(18, h / 2))
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = accent
    ctx.lineWidth = hovered ? 2 : 1
    ctx.stroke()
    ctx.fillStyle = accent
    ctx.font = '700 14px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
    buttons.push(button)
  }

  const drawBackground = (time: number) => {
    ctx.fillStyle = '#020609'
    ctx.fillRect(0, 0, width, height)

    // Match the Session B menu wash inside the opaque canvas: four slow,
    // low-contrast nebula lights sit behind the grid and star layers.
    const drift = time * 0.00008
    const washes = [
      { x: 0.22 + Math.sin(drift) * 0.035, y: 0.18 + Math.cos(drift * 0.8) * 0.025, radius: 0.46, color: '56,128,190', alpha: 0.25 },
      { x: 0.82 + Math.cos(drift * 0.7) * 0.03, y: 0.26 + Math.sin(drift) * 0.035, radius: 0.42, color: '150,74,190', alpha: 0.21 },
      { x: 0.62 + Math.sin(drift * 0.6) * 0.04, y: 0.88 + Math.cos(drift) * 0.025, radius: 0.5, color: '24,154,158', alpha: 0.22 },
      { x: 0.12 + Math.cos(drift * 0.9) * 0.025, y: 0.76 + Math.sin(drift * 0.7) * 0.03, radius: 0.36, color: '196,108,70', alpha: 0.14 },
    ]
    for (const wash of washes) {
      const centerX = width * wash.x
      const centerY = height * wash.y
      const radius = Math.max(width, height) * wash.radius
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      gradient.addColorStop(0, `rgba(${wash.color},${wash.alpha})`)
      gradient.addColorStop(0.58, `rgba(${wash.color},${wash.alpha * 0.36})`)
      gradient.addColorStop(1, `rgba(${wash.color},0)`)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    }

    // The grid belongs to world space, so acceleration is readable as faster line movement.
    const leftWorld = player.x - width / (2 * cameraZoom)
    const rightWorld = player.x + width / (2 * cameraZoom)
    const topWorld = player.y - height / (2 * cameraZoom)
    const bottomWorld = player.y + height / (2 * cameraZoom)
    const firstColumn = Math.floor(leftWorld / GRID_WORLD_SIZE)
    const lastColumn = Math.ceil(rightWorld / GRID_WORLD_SIZE)
    const firstRow = Math.floor(topWorld / GRID_WORLD_SIZE)
    const lastRow = Math.ceil(bottomWorld / GRID_WORLD_SIZE)
    const gridPulse = 0.85 + Math.sin(time * 0.0014) * 0.1
    for (let major = 0; major <= 1; major += 1) {
      ctx.beginPath()
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        if ((Math.abs(column) % 4 === 0) !== Boolean(major)) continue
        const x = width / 2 + (column * GRID_WORLD_SIZE - player.x) * cameraZoom
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
      }
      for (let row = firstRow; row <= lastRow; row += 1) {
        if ((Math.abs(row) % 4 === 0) !== Boolean(major)) continue
        const y = height / 2 + (row * GRID_WORLD_SIZE - player.y) * cameraZoom
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
      }
      ctx.strokeStyle = major
        ? `rgba(101,245,237,${0.12 * gridPulse})`
        : `rgba(101,245,237,${0.045 * gridPulse})`
      ctx.lineWidth = major ? 1.25 : 1
      ctx.stroke()
    }
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
  }

  const drawPlayer = () => {
    const pulse = 0.75 + Math.sin(performance.now() * 0.008) * 0.2
    const accent = overflowTime > 0 ? AMBER : CYAN
    ctx.save()
    ctx.translate(player.x, player.y)
    ctx.rotate(heading)
    if (cloaked) ctx.globalAlpha = 0.3 + pulse * 0.14

    // Engine bells and exhaust at the tail. Boost stretches and warms the plume briefly.
    const boostScale = boostTime > 0 ? 2.4 : 1
    ctx.fillStyle = '#0d222b'
    ctx.strokeStyle = '#3d6672'
    ctx.lineWidth = 1.5
    for (const side of [-1, 1]) {
      ctx.fillRect(-40, side * 9 - 7, 16, 14)
      ctx.strokeRect(-40, side * 9 - 7, 16, 14)
      if (thrust > 0.05) {
        ctx.fillStyle = boostTime > 0
          ? `rgba(255,189,89,${0.35 + thrust * 0.55})`
          : `rgba(101,245,237,${0.25 + thrust * 0.5})`
        ctx.beginPath()
        ctx.moveTo(-40, side * 9 - 5)
        ctx.lineTo(-40 - (16 * thrust + Math.random() * 7) * boostScale, side * 9)
        ctx.lineTo(-40, side * 9 + 5)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#0d222b'
      }
    }

    // Separate armor blocks can be shot away while the single core remains the loss condition.
    for (const part of playerModules) {
      if (part.kind !== 'armor' || part.hp <= 0) continue
      ctx.fillStyle = '#102a33'
      ctx.strokeStyle = part.hp / part.maxHp > 0.35 ? '#78aeb8' : RED
      ctx.lineWidth = 1.5
      ctx.fillRect(part.offset.x - 13, part.offset.y - 10, 26, 20)
      ctx.strokeRect(part.offset.x - 13, part.offset.y - 10, 26, 20)
    }

    // Empty socket brackets make the expandable frame legible from the first frame.
    const socketLayout = shipSocketLayout(slots)
    for (const socket of socketLayout) {
      const index = socket.index
      const parent = socket.parentIndex === null
        ? { x: socket.x * 0.35, y: socket.y * 0.35 }
        : socketLayout.find((candidate) => candidate.index === socket.parentIndex) ?? { x: 0, y: 0 }
      ctx.strokeStyle = slots[index] ? overflowTime > 0 ? AMBER : '#4d7c86' : 'rgba(101,245,237,.28)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(parent.x, parent.y)
      ctx.lineTo(socket.x, socket.y)
      ctx.stroke()
      if (!slots[index]) {
        ctx.setLineDash([3, 3])
        ctx.strokeRect(socket.x - 9, socket.y - 9, 18, 18)
        ctx.setLineDash([])
      }
    }

    // A small common core frame replaces a conventional ship-shaped hull.
    ctx.strokeStyle = accent
    ctx.shadowColor = accent
    ctx.shadowBlur = overflowTime > 0 ? 20 : 9
    ctx.lineWidth = 2
    ctx.fillStyle = '#08191f'
    ctx.fillRect(-13, -13, 26, 26)
    ctx.strokeRect(-13, -13, 26, 26)

    // Two fixed forward guns are part of every core loadout.
    ctx.fillStyle = '#0d222b'
    ctx.strokeStyle = '#5f97a1'
    ctx.shadowBlur = 0
    ctx.lineWidth = 1.5
    for (const side of [-1, 1]) {
      ctx.fillRect(13, side * 6 - 3, 34, 6)
      ctx.strokeRect(13, side * 6 - 3, 34, 6)
    }

    if (slots.some((part) => part?.kind === 'weapon' && part.weapon === 'saw')) {
      ctx.save()
      ctx.translate(57, 0)
      ctx.rotate(performance.now() * 0.012)
      ctx.strokeStyle = AMBER
      ctx.beginPath()
      for (let index = 0; index < 12; index += 1) {
        const angle = index / 12 * Math.PI * 2
        const radius = index % 2 ? 13 : 19
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }
    if (slots.some((part) => part?.kind === 'defense' && part.defense === 'shield')) {
      ctx.strokeStyle = `rgba(101,245,237,${shieldFlash > 0 ? 0.95 : 0.38})`
      ctx.lineWidth = shieldFlash > 0 ? 4 : 2
      ctx.beginPath()
      ctx.arc(0, 0, 58, -0.72, 0.72)
      ctx.stroke()
    }
    if (slots.some((part) => part?.kind === 'defense' && part.defense === 'repair')) {
      for (const side of [-1, 1]) {
        const botAngle = performance.now() * 0.0018 * side
        ctx.fillStyle = CYAN
        ctx.fillRect(Math.cos(botAngle) * 35 - 3, Math.sin(botAngle) * 35 - 3, 6, 6)
      }
    }

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

    // Installed parts are physical targets; their small bars expose remaining integrity.
    for (const socket of socketLayout) {
      const index = socket.index
      const part = slots[index]
      if (!part) continue
      const color = partColor(part)
      ctx.save()
      ctx.translate(socket.x, socket.y)
      ctx.fillStyle = '#08191f'
      ctx.strokeStyle = color
      ctx.lineWidth = 1.8
      ctx.shadowColor = color
      ctx.shadowBlur = 8
      ctx.fillRect(-11, -11, 22, 22)
      ctx.strokeRect(-11, -11, 22, 22)
      ctx.shadowBlur = 0
      ctx.rotate(-heading)
      ctx.fillStyle = color
      ctx.font = '700 11px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(partLabel(part), 0, 0)
      ctx.fillStyle = '#182329'
      ctx.fillRect(-11, 14, 22, 3)
      ctx.fillStyle = slotIntegrity[index] / partDurability(part) > 0.35 ? color : RED
      ctx.fillRect(-11, 14, 22 * slotIntegrity[index] / partDurability(part), 3)
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

  const drawBoostControl = () => {
    if ((phase !== 'void' && phase !== 'elite' && phase !== 'boss') || combatClearTime > 0 || warpTimer > 0) return
    const ready = boostCooldown <= 0
    const size = 72
    const x = width - size - 28
    const y = Math.max(120, height * 0.53 - size / 2)
    const label = ready ? 'BOOST' : `${boostCooldown.toFixed(1)}s`
    const centerX = x + size / 2
    const centerY = y + size / 2
    const button: Button = {
      x,
      y,
      w: size,
      h: size,
      action: triggerBoost,
      hoverText: '추진기 점화 · SPACE / SHIFT',
      hitTest: (point) => Math.hypot(point.x - centerX, point.y - centerY) <= size / 2,
    }
    const hovered = hoverPoint ? inside(hoverPoint, button) : false
    const glow = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, size / 2)
    glow.addColorStop(0, ready ? 'rgba(255,221,151,.82)' : 'rgba(102,121,130,.48)')
    glow.addColorStop(0.48, ready ? 'rgba(255,153,61,.32)' : 'rgba(69,82,91,.24)')
    glow.addColorStop(1, 'rgba(21,12,27,.86)')
    ctx.beginPath()
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()
    ctx.strokeStyle = ready ? AMBER : '#667982'
    ctx.lineWidth = hovered ? 3 : 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(centerX, centerY, size / 2 - 7, -Math.PI * 0.8, Math.PI * 0.55)
    ctx.strokeStyle = ready ? 'rgba(255,218,143,.72)' : 'rgba(102,121,130,.42)'
    ctx.stroke()
    ctx.fillStyle = ready ? '#ffe2a8' : '#8b9ba2'
    ctx.font = '800 11px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, centerX, centerY)
    buttons.push(button)
    ctx.fillStyle = ready ? '#dca34f' : '#667982'
    ctx.font = '9px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('THRUSTER · SHIFT', centerX, y + size + 7)
  }

  const drawZoomControl = () => {
    if (phase !== 'void' && phase !== 'elite' && phase !== 'boss') return
    const y = 86
    const x = width < 640 ? width - 138 : 180
    addButton(x, y, 34, 30, '−', () => changeZoom(-0.1), '#8198a2', '화면 축소  [ 또는 -')
    addButton(x + 88, y, 34, 30, '+', () => changeZoom(0.1), CYAN, '화면 확대  ] 또는 +')
    glassPanel(x + 36, y, 50, 30, 15, '#263b48')
    ctx.fillStyle = '#b8cbd2'
    ctx.font = '700 10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${Math.round(cameraZoom * 100)}%`, x + 61, y + 15)
  }

  const drawHoverTooltip = () => {
    if (!hoverPoint || massHelpOpen) return
    const hovered = [...buttons].reverse().find((button) => button.hoverText && inside(hoverPoint!, button))
    if (!hovered?.hoverText) return
    ctx.font = '700 11px ui-monospace, monospace'
    const tooltipWidth = Math.min(width - 32, ctx.measureText(hovered.hoverText).width + 28)
    const x = clamp(hovered.x + hovered.w - tooltipWidth, 16, width - tooltipWidth - 16)
    const y = Math.max(88, hovered.y - 38)
    glassPanel(x, y, tooltipWidth, 28, 14, AMBER)
    ctx.fillStyle = AMBER
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(hovered.hoverText, x + 14, y + 14)
  }

  const drawWarpEffect = (time: number) => {
    if (warpTimer <= 0) return
    const progress = 1 - warpTimer / WARP_DURATION
    const intensity = Math.sin(progress * Math.PI)
    ctx.fillStyle = `rgba(2,6,9,${0.18 + intensity * 0.58})`
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.strokeStyle = `rgba(101,245,237,${0.18 + intensity * 0.72})`
    ctx.lineWidth = 1 + intensity * 2
    for (let index = 0; index < 42; index += 1) {
      const angle = index / 42 * Math.PI * 2 + time * 0.00012
      const inner = 54 + (index % 5) * 13
      const length = 90 + intensity * (150 + (index % 7) * 18)
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
      ctx.lineTo(Math.cos(angle) * (inner + length), Math.sin(angle) * (inner + length))
      ctx.stroke()
    }
    ctx.strokeStyle = `rgba(255,189,89,${0.3 + intensity * 0.7})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 44 + intensity * 34, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#d9ffff'
    ctx.font = '700 13px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(progress < 0.5 ? 'WARP // FOLDING SPACE' : 'WARP // EXIT VECTOR', 0, 0)
    ctx.restore()
  }

  const drawCombatClear = (time: number) => {
    if (combatClearTime <= 0 || !clearedCombatPhase) return
    const progress = 1 - combatClearTime / COMBAT_CLEAR_DURATION
    const pulse = Math.sin(progress * Math.PI)
    const accent = clearedCombatPhase === 'boss' ? AMBER : CYAN
    const radius = 52 + progress * Math.min(width, height) * 0.32
    ctx.save()
    ctx.fillStyle = `rgba(3,9,14,${0.18 + pulse * 0.28})`
    ctx.fillRect(0, 0, width, height)
    ctx.translate(width / 2, height / 2)
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.25 + pulse * 0.7
    ctx.lineWidth = 2 + pulse * 3
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.rotate(time * 0.0012)
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * (radius * 0.72), Math.sin(angle) * (radius * 0.72))
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      ctx.stroke()
    }
    ctx.rotate(-time * 0.0012)
    ctx.globalAlpha = Math.min(1, progress * 5) * Math.min(1, (1 - progress) * 6)
    ctx.fillStyle = accent
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `800 ${width < 520 ? 25 : 38}px ui-monospace, monospace`
    ctx.fillText(clearedCombatPhase === 'boss' ? 'LIMIT BREAK' : 'SIGNAL CLEAR', 0, -8)
    ctx.fillStyle = '#d9ffff'
    ctx.font = '700 11px ui-monospace, monospace'
    ctx.fillText('CORE DESTROYED // ROUTE SECURED', 0, 27)
    ctx.restore()
  }

  const drawEnemy = () => {
    if (!enemy) return
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
      ctx.save()
      ctx.translate(pos.x, pos.y)
      ctx.rotate(enemy.heading)
      ctx.strokeStyle = part.kind === 'core' ? RED : '#91acb8'
      ctx.fillStyle = part.kind === 'core' ? '#33121a' : '#0a171d'
      ctx.lineWidth = 1.5
      ctx.shadowColor = ctx.strokeStyle
      ctx.shadowBlur = 5
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
        ctx.fillStyle = '#ff9aa8'
        ctx.font = '700 10px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('CORE', 0, 0)
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
      ctx.fillStyle = bullet.kind === 'explosive' ? RED : bullet.kind === 'homing' ? AMBER : overflowTime > 0 ? AMBER : CYAN
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(bullet.x, bullet.y, bullet.kind === 'explosive' ? 7 : bullet.kind === 'homing' ? 5 : bullet.size ?? 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const mine of mines) {
      ctx.strokeStyle = RED
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(mine.x, mine.y, 11 + Math.sin(performance.now() * 0.01) * 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#48131c'
      ctx.fillRect(mine.x - 4, mine.y - 4, 8, 8)
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
    const massLimit = calculateMassLimit(slots)
    const speed = Math.round(Math.hypot(velocity.x, velocity.y))
    const hudWidth = Math.min(430, width - 32)
    glassPanel(16, 16, hudWidth, 62, 20, '#2d5665')
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '700 13px ui-monospace, monospace'
    ctx.fillStyle = CYAN
    ctx.fillText(`CORE ${Math.ceil(playerCore().hp / playerCore().maxHp * 100)}%`, 30, 27)
    ctx.fillStyle = power >= 10 ? AMBER : '#d9ffff'
    ctx.fillText(`FIRE ${power}${power >= 10 ? '  // OVERFLOW' : ''}`, 130, 27)
    ctx.textAlign = 'right'
    ctx.fillStyle = speed > CRUISE_SPEED * movementScale(mass, massLimit) ? AMBER : '#d9ffff'
    ctx.fillText(`SPD ${speed}`, 16 + hudWidth - 14, 27)
    ctx.textAlign = 'left'
    ctx.fillStyle = mass > massLimit ? RED : '#91a9b3'
    ctx.fillText(`MASS ${mass}/${massLimit}${mass > massLimit ? ' 과적' : ' 안정'}`, 30, 50)
    ctx.fillStyle = AMBER
    ctx.fillText(`SCRAP ${save.scrap}`, 190, 50)
    ctx.textAlign = 'right'
    ctx.fillStyle = boostCooldown <= 0 ? AMBER : '#71858d'
    ctx.fillText(boostCooldown <= 0 ? 'BST READY' : `BST ${boostCooldown.toFixed(1)}s`, 16 + hudWidth - 14, 50)
    ctx.textAlign = 'left'

    const messageWidth = Math.min(width - 32, 620)
    glassPanel(16, height - 46, messageWidth, 30, 15, 'rgba(72,119,130,.5)')
    ctx.fillStyle = '#bed0d7'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText(message, 28, height - 37)
    addButton(158, 45, 22, 22, '?', () => { massHelpOpen = !massHelpOpen }, mass > massLimit ? RED : '#71858d', '과적 디메리트 확인')
  }

  const drawOverflowStatus = () => {
    if (phase !== 'elite' && phase !== 'boss') return
    const active = overflowTime > 0
    if (!active && overflowCooldown <= 0) return
    const w = Math.min(330, width - 32)
    const x = (width - w) / 2
    const y = width < 520 ? 88 : 24
    glassPanel(x, y, w, 48, 20, active ? AMBER : '#52666e')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = active ? AMBER : '#8fa4ad'
    ctx.font = '700 12px ui-monospace, monospace'
    ctx.fillText(active ? `OVERFLOW // ${overflowTime.toFixed(1)}s` : `OVERFLOW 재충전 // ${overflowCooldown.toFixed(1)}s`, width / 2, y + 8)
    ctx.fillStyle = active ? '#fff1c9' : '#71858d'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(active ? `CORE 2 ${operatorFormula(slots)} = FIRE ${calculatePower(2, slots)} · 기본포 4발` : 'FIRE 10 이상에서 자동 재발동', width / 2, y + 28)
  }

  const drawMassHelp = () => {
    if (!massHelpOpen || phase === 'tutorial') return
    const mass = calculateMass(slots)
    const massLimit = calculateMassLimit(slots)
    const scale = movementScale(mass, massLimit)
    const penalty = Math.round((1 - scale) * 100)
    const panelWidth = Math.min(390, width - 32)
    const x = 16
    const y = 86
    const h = 126
    glassPanel(x, y, panelWidth, h, 22, mass > massLimit ? RED : CYAN)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = mass > massLimit ? RED : CYAN
    ctx.font = '700 13px ui-monospace, monospace'
    ctx.fillText(`MASS LIMIT ${massLimit} // ${mass > massLimit ? `과적 -${penalty}%` : '안정'}`, x + 14, y + 14)
    ctx.fillStyle = '#b8cbd2'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(`질량 ${massLimit} 초과: 1당 속도·회전 -7.5%`, x + 14, y + 43)
    ctx.fillText('최대 패널티 -45% · 큰 외곽 구조는 피격 면적 증가', x + 14, y + 64)
    ctx.fillStyle = mass > massLimit ? AMBER : '#8198a2'
    ctx.fillText(`현재 이동·회전 효율 ${Math.round(scale * 100)}%`, x + 14, y + 91)
    addButton(x + panelWidth - 42, y + 10, 28, 24, '×', () => { massHelpOpen = false }, '#81949c')
  }

  const drawWorldZones = () => {
    const contacts: Array<{ zone: Zone; color: string }> = []
    if (!unknownResolved && distanceTo(UNKNOWN_ZONE, player) <= SENSOR_RANGE) {
      contacts.push({ zone: UNKNOWN_ZONE, color: CYAN })
    }
    if (unknownResolved && distanceTo(BOSS_ZONE, player) <= SENSOR_RANGE) {
      contacts.push({ zone: BOSS_ZONE, color: AMBER })
    }
    for (const { zone, color } of contacts) {
      ctx.save()
      ctx.translate(zone.x, zone.y)
      ctx.strokeStyle = `${color}88`
      ctx.lineWidth = 2
      ctx.setLineDash([14, 12])
      ctx.beginPath()
      ctx.arc(0, 0, zone.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = `${color}12`
      ctx.beginPath()
      ctx.arc(0, 0, zone.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = color
      ctx.font = '700 12px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(zone.label, 0, -zone.radius - 18)
      ctx.restore()
    }
  }

  const drawSensorHud = () => {
    const contacts: Array<{ zone: Zone; color: string }> = []
    if (!unknownResolved && distanceTo(UNKNOWN_ZONE, player) <= SENSOR_RANGE) contacts.push({ zone: UNKNOWN_ZONE, color: CYAN })
    if (unknownResolved && distanceTo(BOSS_ZONE, player) <= SENSOR_RANGE) {
      contacts.push({ zone: BOSS_ZONE, color: AMBER })
    }
    contacts.forEach(({ zone, color }) => {
      const dx = zone.x - player.x
      const dy = zone.y - player.y
      const screenX = width / 2 + dx * cameraZoom
      const screenY = height / 2 + dy * cameraZoom
      const screenRadius = zone.radius * cameraZoom
      const nearestX = clamp(screenX, 0, width)
      const nearestY = clamp(screenY, 0, height)
      if (Math.hypot(screenX - nearestX, screenY - nearestY) <= screenRadius) return
      const angle = Math.atan2(dy, dx)
      const distance = Math.round(Math.hypot(dx, dy))
      const edgeX = clamp(width / 2 + Math.cos(angle) * width * 0.38, 54, width - 54)
      const edgeY = clamp(height / 2 + Math.sin(angle) * height * 0.34, 100, height - 82)
      ctx.save()
      ctx.translate(edgeX, edgeY)
      ctx.rotate(angle)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(15, 0)
      ctx.lineTo(-9, -8)
      ctx.lineTo(-9, 8)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = color
      ctx.font = '700 10px ui-monospace, monospace'
      ctx.textAlign = edgeX < width / 2 ? 'left' : 'right'
      ctx.fillText(`${zone === BOSS_ZONE ? 'MAIN' : 'SIGNAL'} ${distance}m`, edgeX + (edgeX < width / 2 ? 18 : -18), edgeY - 4)
    })
  }

  const finishTutorial = () => {
    save.tutorialSeen = true
    persist()
    tutorialPage = 0
    phase = 'void'
    idleTime = 4
    cloaked = true
    message = '시스템 확인 완료 · 자유 항해를 시작하세요'
  }

  const drawTutorial = () => {
    const steps = [
      { title: '가속하고 짧게 부스트', body: ['WASD로 가속하며 속도에는 상한이 있습니다.', 'Space·Shift 또는 BOOST 버튼으로 잠시 한계를 넘습니다.'] },
      { title: '코어는 처음부터 파괴 가능', body: ['모든 기체의 붉은 CORE는 첫 탄부터 피해를 받습니다.', '외부 무기와 방어 부품을 먼저 끊는 선택도 가능합니다.'] },
      { title: '신호를 직접 찾아가기', body: ['센서 화살표의 방향과 거리를 따라 미지 구역에 접근합니다.', '경계에서 진입하거나 그대로 지나갈 수 있습니다.'] },
      { title: '선택하고 소켓에 부착', body: ['부품을 먼저 누르면 장착 가능한 연결부에 전기가 흐릅니다.', '전투가 끝나면 안전한 공백으로 자동 복귀합니다.'] },
    ]
    const step = steps[tutorialPage]
    const panel = drawPanel(step.title, step.body, 390)
    ctx.fillStyle = tutorialPage === 1 ? RED : tutorialPage === 3 ? AMBER : CYAN
    ctx.font = '700 11px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`SYSTEM GUIDE  ${tutorialPage + 1} / ${steps.length}`, panel.x + 24, panel.y + 145)
    drawTutorialGraphic(panel.x + panel.w / 2, panel.y + 225, tutorialPage)
    addButton(panel.x + 24, panel.y + panel.h - 62, 128, 38, '건너뛰기', finishTutorial, '#81949c')
    addButton(panel.x + panel.w - 188, panel.y + panel.h - 62, 164, 38, tutorialPage === steps.length - 1 ? '항해 시작' : '다음', () => {
      if (tutorialPage === steps.length - 1) finishTutorial()
      else tutorialPage += 1
    }, tutorialPage === steps.length - 1 ? AMBER : CYAN)
  }

  const drawTutorialGraphic = (cx: number, cy: number, page: number) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.lineWidth = 2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (page === 0) {
      ctx.strokeStyle = CYAN
      ctx.strokeRect(-22, -22, 44, 44)
      ctx.fillStyle = CYAN
      ctx.font = '700 11px ui-monospace, monospace'
      ctx.fillText('WASD', 0, 0)
      for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * 36, Math.sin(angle) * 36)
        ctx.lineTo(Math.cos(angle) * 64, Math.sin(angle) * 64)
        ctx.stroke()
      }
    } else if (page === 1) {
      ctx.strokeStyle = '#627b84'
      ctx.beginPath()
      ctx.moveTo(-70, 0)
      ctx.lineTo(-24, 0)
      ctx.stroke()
      ctx.fillStyle = CYAN
      ctx.fillRect(-78, -3, 12, 6)
      ctx.fillStyle = '#33121a'
      ctx.strokeStyle = RED
      ctx.beginPath()
      ctx.arc(0, 0, 24, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = RED
      ctx.font = '700 10px ui-monospace, monospace'
      ctx.fillText('CORE', 0, 0)
    } else if (page === 2) {
      ctx.strokeStyle = CYAN
      ctx.setLineDash([8, 7])
      ctx.beginPath()
      ctx.arc(28, 0, 58, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = CYAN
      ctx.beginPath()
      ctx.moveTo(-58, 0)
      ctx.lineTo(-78, -10)
      ctx.lineTo(-78, 10)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillStyle = '#0a1a21'
      ctx.strokeStyle = CYAN
      ctx.fillRect(-18, -18, 36, 36)
      ctx.strokeRect(-18, -18, 36, 36)
      for (const side of [-1, 1]) {
        ctx.strokeStyle = AMBER
        ctx.beginPath()
        ctx.moveTo(side * 18, 0)
        ctx.lineTo(side * 42, -8)
        ctx.lineTo(side * 62, 0)
        ctx.stroke()
        ctx.strokeRect(side * 62 - 12, -12, 24, 24)
      }
    }
    ctx.restore()
  }

  const drawVoidUi = () => {
    ctx.fillStyle = '#78909a'
    ctx.textAlign = 'center'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(`SENSOR ${SENSOR_RANGE}m // 자유 항해`, width / 2, width < 520 ? 140 : 104)
    addButton(18, 88, 132, 34, '시스템 가이드 ?', () => {
      tutorialPage = 0
      velocity = { x: 0, y: 0 }
      phase = 'tutorial'
    }, '#81949c')
    if (cloaked) {
      ctx.textAlign = 'center'
      ctx.fillStyle = CYAN
      ctx.font = '700 18px ui-monospace, monospace'
      ctx.fillText('CLOAKING // SAFE', width / 2, height * 0.3)
      ctx.fillStyle = '#8198a2'
      ctx.font = '12px ui-monospace, monospace'
      ctx.fillText('정지 상태 · 안전 저장됨', width / 2, height * 0.3 + 26)
      ctx.fillStyle = '#a9c1c9'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText('내 함선 탭 · 본체 정보 / 배치 관리', width / 2, height * 0.3 + 47)
      const w = Math.min(260, width - 40)
      const x = width - w - 22
      addButton(x, height - 126, w, 44, '공백 상점 열기', () => { phase = 'shop' })
      if (unknownResolved) {
        addButton(x, height - 180, w, 44, '메인 신호 근처로 워프', warpNearBoss, AMBER, '경고 · 메인 퀘스트 강적 출현 예상')
      }
    }
  }

  const drawPanel = (title: string, body: string[], panelHeight = 320) => {
    const w = Math.min(620, width - 32)
    const h = Math.min(panelHeight, height - 100)
    const x = (width - w) / 2
    const y = (height - h) / 2
    glassPanel(x, y, w, h, 26, '#426575')
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
      explored = 100
      unknownResolved = true
      persistSafeRun()
      message = '미지 구역을 지나쳤습니다 · 자유 항해 복귀'
    }, '#8aa0aa')
  }

  const drawReward = () => {
    const compact = width < 520
    const panel = drawPanel('미지 증강 3택', [
      '후보를 탭한 뒤 장착·분해하거나 한 번만 다시 추첨합니다.',
      '카드의 FIRE와 MASS 변화를 먼저 비교하세요.',
    ], compact ? 690 : 590)
    const gap = compact ? 8 : 12
    const cardTop = panel.y + 150
    const cardWidth = compact ? panel.w - 48 : (panel.w - 48 - gap * 2) / 3
    const cardHeight = compact ? 104 : 230
    rewardChoices.forEach((part, index) => {
      const x = compact ? panel.x + 24 : panel.x + 24 + index * (cardWidth + gap)
      const y = compact ? cardTop + index * (cardHeight + gap) : cardTop
      drawRewardCard(part, index, x, y, cardWidth, cardHeight, compact)
    })

    const selected = selectedRewardIndex === null ? null : rewardChoices[selectedRewardIndex]
    const dismantleLabel = selected ? `분해 +${rewardScrapValue(selected)}` : '분해'
    if (compact) {
      const buttonWidth = (panel.w - 48 - gap) / 2
      const firstRow = panel.y + panel.h - 112
      addButton(panel.x + 24, firstRow, buttonWidth, 40, '장착', attachRewardChoice, AMBER)
      addButton(panel.x + 24 + buttonWidth + gap, firstRow, buttonWidth, 40, dismantleLabel, dismantleRewardChoice, '#9db0b7')
      addButton(panel.x + 24, firstRow + 48, buttonWidth, 40, rewardRerolled ? '리롤 사용됨' : '1회 리롤', rerollRewards, CYAN)
      addButton(panel.x + 24 + buttonWidth + gap, firstRow + 48, buttonWidth, 40, '보상 포기', abandonRewards, '#71858d')
    } else {
      const buttonWidth = (panel.w - 48 - gap * 3) / 4
      const y = panel.y + panel.h - 62
      addButton(panel.x + 24, y, buttonWidth, 40, '장착', attachRewardChoice, AMBER)
      addButton(panel.x + 24 + (buttonWidth + gap), y, buttonWidth, 40, dismantleLabel, dismantleRewardChoice, '#9db0b7')
      addButton(panel.x + 24 + (buttonWidth + gap) * 2, y, buttonWidth, 40, rewardRerolled ? '리롤 사용됨' : '1회 리롤', rerollRewards, CYAN)
      addButton(panel.x + 24 + (buttonWidth + gap) * 3, y, buttonWidth, 40, '보상 포기', abandonRewards, '#71858d')
    }
  }

  const drawRewardCard = (part: ShipPart, index: number, x: number, y: number, w: number, h: number, compact: boolean) => {
    const selected = selectedRewardIndex === index
    const preview = previewPart(slots, part, unlockedSocketCount(slots))
    const accent = selected ? AMBER : partColor(part)
    ctx.fillStyle = selected ? 'rgba(255,189,89,.13)' : '#091820'
    ctx.strokeStyle = accent
    ctx.lineWidth = selected ? 2.5 : 1
    ctx.fillRect(x, y, w, h)
    ctx.strokeRect(x, y, w, h)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = accent
    ctx.font = `700 ${compact ? 13 : 17}px ui-monospace, monospace`
    ctx.fillText(partLabel(part), x + 12, y + 10)
    ctx.fillStyle = '#b8cbd2'
    ctx.font = `${compact ? 9 : 10}px ui-monospace, monospace`
    ctx.fillText(partDescription(part), x + 12, y + (compact ? 32 : 47))
    ctx.fillStyle = '#7f98a2'
    ctx.fillText(`MASS ${preview.massBefore} → ${preview.massAfter}  (+${part.mass})`, x + 12, y + (compact ? 53 : 86))
    ctx.fillStyle = preview.fireAfter >= 10 ? AMBER : '#d9ffff'
    ctx.font = `700 ${compact ? 11 : 14}px ui-monospace, monospace`
    ctx.fillText(`FIRE ${preview.fireBefore} → ${preview.fireAfter}`, x + 12, y + (compact ? 72 : 119))
    ctx.fillStyle = !preview.canAttach ? RED : preview.overloaded ? RED : CYAN
    ctx.font = '700 10px ui-monospace, monospace'
    ctx.fillText(!preview.canAttach ? '소켓 부족' : preview.overloaded ? '과적 발생' : '질량 안정', x + 12, y + (compact ? 88 : 151))
    if (!compact) {
      ctx.fillStyle = selected ? AMBER : '#71858d'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText(selected ? '선택됨 // 행동을 결정하세요' : '탭하여 선택', x + 12, y + h - 28)
    }
    buttons.push({ x, y, w, h, action: () => { selectedRewardIndex = index } })
  }

  const drawAssembly = () => {
    const part = pendingPart ?? TIMES_TWO
    const preview = previewPart(slots, part, unlockedSocketCount(slots))
    const panel = drawPanel(`배송 캡슐  ${partLabel(part)}`, [
      partDescription(part),
      `FIRE ${preview.fireBefore} → ${preview.fireAfter} · MASS ${preview.massBefore}/${preview.massLimitBefore} → ${preview.massAfter}/${preview.massLimitAfter} · ${preview.overloaded ? '과적' : '안정'}`,
    ], 440)
    drawAttachmentGrid(panel, part)
    addButton(panel.x + 24, panel.y + panel.h - 68, 180, 44, '분해  +6 SCRAP', dismantlePending, '#9db0b7')
  }

  const drawAttachmentGrid = (panel: { x: number; y: number; w: number; h: number }, previewPart: ShipPart) => {
    const compact = width < 520
    const cx = panel.x + panel.w * (compact ? 0.64 : 0.62)
    const cy = panel.y + 250
    const socketLayout = shipSocketLayout(slots)
    const layoutExtent = Math.max(46, ...socketLayout.map((socket) => Math.hypot(socket.x, socket.y)))
    const scale = Math.min(compact ? 1.05 : 1.35, (compact ? 112 : 142) / layoutExtent)
    let minimumScreenGap = Number.POSITIVE_INFINITY
    for (let left = 0; left < socketLayout.length; left += 1) {
      for (let right = left + 1; right < socketLayout.length; right += 1) {
        minimumScreenGap = Math.min(minimumScreenGap, Math.hypot(
          socketLayout[left].x - socketLayout[right].x,
          socketLayout[left].y - socketLayout[right].y,
        ) * scale)
      }
    }
    const nodeHalf = Math.max(2, Math.min(17, minimumScreenGap * 0.32))
    const hitHalf = Math.max(nodeHalf + 0.5, Math.min(24, minimumScreenGap * 0.42))
    const coreHalf = Math.max(3, Math.min(22, 16 * scale))
    const socketFontSize = Math.max(4, Math.min(10, nodeHalf * 0.6))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = CYAN
    ctx.fillStyle = '#0a1a21'
    ctx.fillRect(cx - coreHalf, cy - coreHalf, coreHalf * 2, coreHalf * 2)
    ctx.strokeRect(cx - coreHalf, cy - coreHalf, coreHalf * 2, coreHalf * 2)
    ctx.fillStyle = CYAN
    ctx.font = `700 ${Math.max(4, Math.min(11, coreHalf * 0.5))}px ui-monospace, monospace`
    ctx.fillText(coreHalf >= 12 ? 'CORE 2' : 'C', cx, cy)

    socketLayout.forEach((socket) => {
      const index = socket.index
      const part = slots[index]
      const sx = cx + socket.x * scale
      const sy = cy + socket.y * scale
      const available = isSocketUnlocked(slots, index)
      const canAttach = pendingSelected && canAttachPart(slots, index, previewPart)
      const parent = socket.parentIndex === null
        ? { x: cx, y: cy }
        : socketLayout.find((candidate) => candidate.index === socket.parentIndex)
      const startX = parent && 'index' in parent ? cx + parent.x * scale : cx
      const startY = parent && 'index' in parent ? cy + parent.y * scale : cy
      const dismantleSelected = Boolean(part) && selectedMountedSlot === index
      ctx.strokeStyle = dismantleSelected ? RED : part ? partColor(part) : available ? `${CYAN}88` : '#2a3439'
      ctx.lineWidth = canAttach || dismantleSelected ? 2.5 : 1.2
      ctx.setLineDash(canAttach ? [3, 4] : [])
      ctx.beginPath()
      if (canAttach) {
        const jitter = Math.sin(performance.now() * 0.025 + index) * 7
        ctx.moveTo(startX, startY)
        ctx.lineTo((startX + sx) / 2 + jitter, (startY + sy) / 2 - jitter)
        ctx.lineTo(sx, sy)
      } else {
        ctx.moveTo(startX, startY)
        ctx.lineTo(sx, sy)
      }
      ctx.stroke()
      ctx.fillStyle = part ? '#0b2027' : '#071016'
      ctx.fillRect(sx - nodeHalf, sy - nodeHalf, nodeHalf * 2, nodeHalf * 2)
      ctx.strokeRect(sx - nodeHalf, sy - nodeHalf, nodeHalf * 2, nodeHalf * 2)
      ctx.setLineDash([])
      ctx.fillStyle = dismantleSelected ? RED : part ? partColor(part) : available ? '#58717b' : '#303b40'
      ctx.font = `700 ${socketFontSize}px ui-monospace, monospace`
      ctx.fillText(dismantleSelected ? '분해?' : part ? nodeHalf >= 10 ? partLabel(part) : '■' : available ? '+' : 'LOCK', sx, sy)
      if (canAttach) {
        buttons.push({
          x: sx - hitHalf,
          y: sy - hitHalf,
          w: hitHalf * 2,
          h: hitHalf * 2,
          action: () => selectSocket(index),
          hitTest: (point) => Math.hypot(point.x - sx, point.y - sy) <= hitHalf,
        })
      } else if (part) {
        buttons.push({
          x: sx - hitHalf,
          y: sy - hitHalf,
          w: hitHalf * 2,
          h: hitHalf * 2,
          action: () => sellMountedPart(index),
          hoverText: '두 번 눌러 기존 부품 분해',
          hitTest: (point) => Math.hypot(point.x - sx, point.y - sy) <= hitHalf,
        })
      }
    })
    const firstEmpty = firstOpenSocket(slots, previewPart)
    const previewSlots = [...slots]
    if (firstEmpty >= 0) previewSlots[firstEmpty] = previewPart
    const preview = calculatePower(2, previewSlots)
    ctx.textAlign = 'left'
    ctx.fillStyle = preview >= 10 ? AMBER : '#bcd1d9'
    ctx.font = '700 12px ui-monospace, monospace'
    ctx.fillText(`FIRE ${calculatePower(2, slots)} → ${preview}${preview >= 10 ? '  OVERFLOW!' : ''}`, panel.x + 24, panel.y + 330)
    addButton(panel.x + 24, panel.y + 190, compact ? 108 : 150, 52, pendingSelected ? `${partLabel(previewPart)} 선택됨` : `${partLabel(previewPart)} 선택`, () => {
      pendingSelected = true
      message = '전기 표시된 빈 소켓을 선택하세요'
    }, partColor(previewPart))
  }

  const drawShop = () => {
    const managing = shopPage === 3
    const panel = drawPanel(managing ? '함선 본체 정보' : '공백 상점', managing ? [
      `CORE 2 ${operatorFormula(slots)} = FIRE ${calculatePower(2, slots)}`,
      '부품 탭 후 다른 소켓 탭: 이동 · 판매 버튼 두 번: 분해',
    ] : [
      `보유 스크랩  ${save.scrap}`,
      '구매한 부품은 배송 캡슐로 즉시 워프합니다.',
    ], 560)
    const pages: Array<Array<{ part: ShipPart; cost: number }>> = [
      [
        { part: TIMES_TWO, cost: 6 }, { part: BODY_PART, cost: 4 }, { part: HOMING_PART, cost: 8 },
      ],
      [
        { part: MINE_PART, cost: 6 }, { part: SAW_PART, cost: 7 }, { part: EXPLOSIVE_PART, cost: 9 },
      ],
      [
        { part: SHIELD_PART, cost: 7 }, { part: INTERCEPTOR_PART, cost: 7 }, { part: REPAIR_PART, cost: 8 },
      ],
    ]
    if (shopPage === 3) {
      const listTop = panel.y + 145
      const rowGap = 4
      const allSockets = shipSocketLayout(slots)
      const pageSize = 6
      const pageCount = Math.max(1, Math.ceil(allSockets.length / pageSize))
      const listBottom = panel.y + panel.h - (pageCount > 1 ? 116 : 72)
      shopManagePage = Math.min(shopManagePage, pageCount - 1)
      const visibleSockets = allSockets.slice(shopManagePage * pageSize, (shopManagePage + 1) * pageSize)
      const rowHeight = Math.min(50, (listBottom - listTop - rowGap * (visibleSockets.length - 1)) / visibleSockets.length)
      visibleSockets.forEach((socket, rowIndex) => {
        const index = socket.index
        const part = slots[index]
        const cardX = panel.x + 24
        const cardY = listTop + rowIndex * (rowHeight + rowGap)
        const swapSelected = selectedSwapSlot === index
        glassPanel(cardX, cardY, panel.w - 48, rowHeight, 15, swapSelected ? AMBER : part ? partColor(part) : '#263b43')
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillStyle = part ? partColor(part) : '#52636a'
        ctx.font = '700 12px ui-monospace, monospace'
        ctx.fillText(`SLOT ${index + 1}  ${part ? partLabel(part) : 'EMPTY'}${swapSelected ? '  // 교환 1/2' : ''}`, cardX + 12, cardY + 6)
        if (isSocketUnlocked(slots, index)) {
          buttons.push({ x: cardX, y: cardY, w: panel.w - 48, h: rowHeight, action: () => selectSwapSlot(index) })
        }
        if (!part) return
        const value = partResaleValue(part, slotIntegrity[index])
        ctx.fillStyle = '#8fa5af'
        ctx.font = '10px ui-monospace, monospace'
        ctx.fillText(width < 520
          ? `내구 ${Math.ceil(slotIntegrity[index])}/${partDurability(part)} · 제거`
          : `내구 ${Math.ceil(slotIntegrity[index])}/${partDurability(part)} · 판매 후 소켓 비움`, cardX + 12, cardY + 23)
        const confirming = selectedMountedSlot === index
        addButton(panel.x + panel.w - 154, cardY + 6, 114, Math.max(28, rowHeight - 12), confirming ? `확정 +${value}` : `판매 +${value}`, () => sellMountedPart(index), confirming ? RED : AMBER)
      })
      if (pageCount > 1) {
        addButton(panel.x + panel.w / 2 - 62, panel.y + panel.h - 102, 124, 32, `소켓 ${shopManagePage + 1}/${pageCount} →`, () => {
          shopManagePage = (shopManagePage + 1) % pageCount
          selectedMountedSlot = null
          selectedSwapSlot = null
        }, CYAN)
      }
    } else pages[shopPage].forEach(({ part, cost }, index) => {
      const preview = previewPart(slots, part, unlockedSocketCount(slots))
      const cardX = panel.x + 24
      const cardY = panel.y + 145 + index * 76
      glassPanel(cardX, cardY, panel.w - 48, 68, 17, partColor(part))
      ctx.fillStyle = partColor(part)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = '700 13px ui-monospace, monospace'
      ctx.fillText(partLabel(part), cardX + 12, cardY + 8)
      ctx.fillStyle = '#8fa5af'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText(partDescription(part), cardX + 12, cardY + 28)
      ctx.fillStyle = preview.overloaded ? RED : '#b8cbd2'
      ctx.fillText(`FIRE ${preview.fireBefore}→${preview.fireAfter} · MASS ${preview.massBefore}/${preview.massLimitBefore}→${preview.massAfter}/${preview.massLimitAfter} · ${preview.canAttach ? preview.overloaded ? '과적' : '안정' : '소켓 부족'}`, cardX + 12, cardY + 48)
      addButton(panel.x + panel.w - 130, cardY + 8, 90, 34, `${cost} SCRAP`, () => buyPart(part, cost), partColor(part))
    })
    const nextLabels = ['무기 장비 →', '방어 장비 →', '장착 관리 →', '← 기본 장비']
    addButton(panel.x + panel.w - 150, panel.y + panel.h - 58, 126, 36, nextLabels[shopPage], () => {
      shopPage = (shopPage + 1) % 4
      shopManagePage = 0
      selectedMountedSlot = null
      selectedSwapSlot = null
    }, AMBER)
    addButton(panel.x + 24, panel.y + panel.h - 58, 120, 36, '닫기', () => {
      phase = 'void'
      shopManagePage = 0
      selectedMountedSlot = null
      selectedSwapSlot = null
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
    const panel = drawPanel('메인 퀘스트 경계', [
      '워프는 감지 범위 밖에 도착했습니다. 직접 접근 완료.',
      '보호 모듈 2개를 제거한 뒤 핵심 코어를 파괴하세요.',
    ], 300)
    addButton(panel.x + 24, panel.y + panel.h - 74, panel.w - 48, 50, '보스 구역 진입', beginBoss, AMBER)
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
      if (phase === 'void') drawWorldZones()
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
    if (phase === 'void') {
      buttons.push({
        x: width / 2 - 56,
        y: height / 2 - 56,
        w: 112,
        h: 112,
        action: openHullManagement,
        hoverText: '내 함선 정보 · 배치 관리',
        hitTest: (point) => Math.hypot(point.x - width / 2, point.y - height / 2) <= 56,
      })
    }
    drawWarpEffect(time)
    drawStick()
    drawBoostControl()
    drawZoomControl()
    if (phase === 'void') drawSensorHud()
    if (phase === 'tutorial') drawTutorial()
    if (phase === 'void' && warpTimer <= 0) drawVoidUi()
    if (phase === 'signal') drawSignal()
    if (phase === 'reward') drawReward()
    if (phase === 'shop') drawShop()
    if (phase === 'delivery') drawDelivery()
    if (phase === 'assembly') drawAssembly()
    if (phase === 'bossIntro') drawBossIntro()
    if (phase === 'victory') drawEnd(true)
    if (phase === 'defeat') drawEnd(false)
    if (phase !== 'tutorial') drawHud()
    drawOverflowStatus()
    drawMassHelp()
    drawCombatClear(time)
    drawHoverTooltip()
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
    if (destroyed) return
    resize()
    const dt = Math.min(0.04, (time - lastTime) / 1000)
    lastTime = time
    update(dt)
    draw(time)
    if (!destroyed) frame = requestAnimationFrame(tick)
  }

  resize()
  frame = requestAnimationFrame(tick)

  return {
    destroy() {
      destroyed = true
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
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

function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function distanceTo(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function createPlayerModules(): PlayerModule[] {
  return [
    { id: 'armor-top', kind: 'armor', offset: { x: 0, y: -32 }, hp: 12, maxHp: 12 },
    { id: 'armor-bottom', kind: 'armor', offset: { x: 0, y: 32 }, hp: 12, maxHp: 12 },
    { id: 'core', kind: 'core', offset: { x: 0, y: 0 }, hp: 32, maxHp: 32 },
  ]
}

function playerModulePosition(part: PlayerModule, player: Point, heading: number): Point {
  return rotatedOffsetPosition(part.offset, player, heading)
}

function rotatedOffsetPosition(offset: Point, origin: Point, heading: number): Point {
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)
  return {
    x: origin.x + offset.x * cos - offset.y * sin,
    y: origin.y + offset.x * sin + offset.y * cos,
  }
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

function unlockedSocketCount(slots: Array<ShipPart | null>): number {
  return shipSocketLayout(slots).length
}

function operatorFormula(slots: Array<ShipPart | null>): string {
  const operators = slots
    .filter((part): part is OperatorPart => part?.kind === 'add' || part?.kind === 'multiply')
    .map((part) => part.kind === 'add' ? `→ +${part.value}` : `→ ×${part.value}`)
  return operators.length ? ` ${operators.join(' ')}` : ''
}

function partColor(part: ShipPart): string {
  if (part.kind === 'multiply' || part.kind === 'weapon') return AMBER
  if (part.kind === 'defense') return CYAN
  if (part.kind === 'body') return '#a6b5bb'
  return CYAN
}

function partLabel(part: ShipPart): string {
  if (part.kind === 'add') return `+${part.value}`
  if (part.kind === 'multiply') return `×${part.value}`
  if (part.kind === 'body') return 'BODY'
  if (part.kind === 'weapon') return weaponLabel(part.weapon)
  if (part.kind === 'defense') return defenseLabel(part.defense)
  return 'PART'
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

function partDescription(part: ShipPart): string {
  if (part.kind === 'add') return `누적 FIRE에 ${part.value} 추가`
  if (part.kind === 'multiply') return `앞에서 계산된 누적 FIRE를 ${part.value}배`
  if (part.kind === 'body') return '주변 연결 소켓 +3 · 분기 확장 · 질량 한도 +6'
  if (part.kind === 'weapon') {
    if (part.weapon === 'homing') return '느린 주기 · 강한 유도 공격'
    if (part.weapon === 'mine') return '후방 설치 · 적이 살짝 회피'
    if (part.weapon === 'saw') return '근접 전용 · 매우 강한 연속 피해'
    return '느린 직선탄 · 충돌 지점 범위 폭발'
  }
  if (part.kind === 'defense' && part.defense === 'interceptor') return '주기적으로 근처 투사체 제거'
  if (part.kind === 'defense' && part.defense === 'shield') return '함선 전방으로 들어오는 공격 차단'
  return '주기적으로 수리봇이 모듈 내구도 회복'
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
