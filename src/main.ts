import './style.css'
import { createGame } from './game/game'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found')
}

app.innerHTML = `
  <main class="shell">
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
      <p><kbd>AUTO</kbd><span>전방 2연장포 자동 사격</span></p>
      <p class="route"><b>감지</b><i></i><b>접근</b><i></i><b>해체</b><i></i><b>조립</b></p>
    </footer>
  </main>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game')

if (!canvas) {
  throw new Error('Game canvas not found')
}

const game = createGame(canvas)
canvas.focus()

window.addEventListener('beforeunload', () => game.destroy())
