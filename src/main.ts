import './style.css'
import { createGame, type GameResult } from './game/game'
import { firstOpenSocket, partDurability, readSave, writeSave, type ShipPart } from './game/logic'
import { createScreenFlow, type FlowData } from './screens/flow'
import { DEFAULT_SHOP_ITEMS, type ShopItem } from './screens/shop/pricing'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found')
}

app.innerHTML = `
  <div id="menu" class="menu-host"></div>
  <main id="game-shell" class="shell" hidden>
    <header class="masthead">
      <div>
        <p class="eyebrow">GB//26 · GO LIMITLESS</p>
        <h1>무한항로</h1>
      </div>
      <p class="status"><i></i> LOCAL PILOT LINK</p>
    </header>
    <section class="game-frame" aria-label="게임 데모">
      <canvas id="game" width="1280" height="720" tabindex="0" aria-label="무한항로 플레이 화면"></canvas>
    </section>
    <footer class="control-strip" aria-label="조작 안내">
      <p><kbd>WASD</kbd><span>또는 드래그로 관성 조향</span></p>
      <p><kbd>SHIFT</kbd><span>짧은 한계 돌파 부스트</span></p>
      <p><kbd>− / +</kbd><span>화면 배율 조절</span></p>
      <p><kbd>AUTO</kbd><span>전방 2연장포 자동 사격</span></p>
      <p class="route"><b>감지</b><i></i><b>접근</b><i></i><b>해체</b><i></i><b>조립</b></p>
    </footer>
  </main>
`

const menu = document.querySelector<HTMLDivElement>('#menu')
const shell = document.querySelector<HTMLElement>('#game-shell')
const canvas = document.querySelector<HTMLCanvasElement>('#game')

if (!menu || !shell || !canvas) {
  throw new Error('App UI root not found')
}

const storage = safeStorage()
let save = readSave(storage)
let slots: Array<ShipPart | null> = save.safeRun?.slots.slice()
  ?? [{ kind: 'add', value: 1, mass: 2 }, null, null, null]

const flowData = (): FlowData => ({
  slots,
  scrap: save.scrap,
  discoveries: save.discoveries,
  victories: save.victories,
  canContinue: save.safeRun !== null,
  items: DEFAULT_SHOP_ITEMS,
})

let game: ReturnType<typeof createGame> | null = null

const showResult = (result: GameResult) => {
  game?.destroy()
  game = null
  save = readSave(storage)
  slots = result.slots.slice()
  shell.hidden = true
  menu.hidden = false
  flow.setData(flowData())
  flow.showResult({
    outcome: result.outcome,
    scrapGained: result.scrapGained,
    defeated: result.defeated,
    discoveries: result.discoveries,
  })
}

const startGame = (continueRun: boolean) => {
  if (!continueRun) {
    save.safeRun = {
      xRatio: 0.5,
      yRatio: 0.5,
      explored: 0,
      slots,
      slotIntegrity: slots.map((part) => part ? partDurability(part) : 0),
    }
    writeSave(save, storage)
  }
  flow.hide()
  menu.hidden = true
  shell.hidden = false
  game = createGame(canvas, { onResult: showResult })
  canvas.focus()
}

const purchase = (item: ShopItem) => {
  const openSocket = firstOpenSocket(slots)
  if (openSocket < 0 || save.scrap < item.cost) return

  const savedIntegrity = save.safeRun?.slotIntegrity ?? []
  slots[openSocket] = item.part
  save.scrap -= item.cost
  save.safeRun = {
    xRatio: save.safeRun?.xRatio ?? 0.5,
    yRatio: save.safeRun?.yRatio ?? 0.5,
    explored: save.safeRun?.explored ?? 0,
    slots,
    slotIntegrity: slots.map((part, index) => {
      if (!part) return 0
      return index === openSocket ? partDurability(part) : savedIntegrity[index] ?? partDurability(part)
    }),
  }
  writeSave(save, storage)
  flow.setData({ ...flowData(), delivering: item.name })
}

const flow = createScreenFlow(menu, flowData(), {
  onNewRun: () => startGame(false),
  onContinue: () => startGame(true),
  onPurchase: purchase,
})

flow.show('lobby')

window.addEventListener('beforeunload', () => {
  game?.destroy()
  flow.destroy()
})

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
