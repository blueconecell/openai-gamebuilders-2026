import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found')
}

app.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">GB//26 · GO LIMITLESS</p>
        <h1>OVERFLOW<span>:</span> FAR SPACE</h1>
      </div>
      <p class="status"><i></i> LOCAL PILOT LINK</p>
    </header>
    <section class="game-frame" aria-label="게임 데모">
      <canvas id="game" width="1280" height="720"></canvas>
      <div class="boot-card">
        <p>CORE SYSTEM</p>
        <strong>DEMO SHELL READY</strong>
        <span>게임 루프를 연결하는 중입니다.</span>
      </div>
    </section>
  </main>
`
