const STYLE_ID = 'gb-screens-style'

/**
 * Screens ship their own scoped styles because the shared stylesheet is owned
 * by the integration session. Colours fall back to literals so a screen still
 * renders correctly when mounted outside the main shell.
 */
const CSS = `
/* Screens own their box model: the shared stylesheet is not guaranteed to be loaded. */
.gb-screen,
.gb-screen *,
.gb-screen *::before,
.gb-screen *::after {
  box-sizing: border-box;
}

.gb-screen {
  --gb-cyan: var(--cyan, #69e6e8);
  --gb-amber: var(--amber, #ffb84a);
  --gb-danger: var(--danger, #ff5c6c);
  --gb-ghost: var(--ghost, #93a7b3);
  --gb-line: var(--line, #263b48);
  --gb-panel: var(--panel, #0c141c);
  --gb-radius-panel: clamp(18px, 3vw, 26px);
  --gb-radius-control: 16px;
  --gb-glass: linear-gradient(145deg, rgba(20, 36, 54, 0.82), rgba(8, 15, 25, 0.68));
  --gb-glass-soft: linear-gradient(145deg, rgba(21, 38, 57, 0.68), rgba(8, 15, 25, 0.54));
  --gb-glass-border: rgba(158, 221, 236, 0.20);
  --gb-glow: 0 18px 48px rgba(0, 3, 12, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.05);

  /*
   * Korean set in monospace is what makes an interface look machine-written.
   * Prose runs in the platform UI face; the mono face is kept for readouts,
   * where fixed-width digits actually earn their place.
   */
  --gb-sans: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont,
    'Apple SD Gothic Neo', 'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif;
  --gb-display: 'Avenir Next Condensed', 'HelveticaNeue-CondensedBold', 'Arial Narrow',
    'Apple SD Gothic Neo', 'Segoe UI', system-ui, sans-serif;
  --gb-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: clamp(12px, 2.4vh, 22px);
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: clamp(14px, 3vw, 30px);
  overflow-x: hidden;
  overflow-y: auto;
  color: #e9ffff;
  font-family: var(--gb-sans);
  letter-spacing: 0;
  background: #04070c;
}

/* Deep-space wash: slow colour drift, far enough back to stay readable. */
.gb-screen::before {
  content: '';
  position: absolute;
  z-index: -2;
  inset: -25%;
  pointer-events: none;
  background:
    radial-gradient(38% 30% at 22% 18%, rgba(56, 128, 190, 0.30), transparent 70%),
    radial-gradient(34% 28% at 82% 26%, rgba(150, 74, 190, 0.24), transparent 72%),
    radial-gradient(46% 36% at 62% 88%, rgba(24, 154, 158, 0.26), transparent 74%),
    radial-gradient(30% 24% at 12% 76%, rgba(196, 108, 70, 0.16), transparent 70%);
  filter: blur(14px);
  animation: gb-drift 42s ease-in-out infinite alternate;
}

/* Two star layers at different scales, sliding to suggest depth. */
.gb-screen::after {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;
  opacity: 0.55;
  background-image:
    radial-gradient(1px 1px at 12% 22%, #cbeaff 99%, transparent),
    radial-gradient(1px 1px at 74% 12%, #a7d8ff 99%, transparent),
    radial-gradient(1px 1px at 44% 62%, #ffffff 99%, transparent),
    radial-gradient(1px 1px at 88% 74%, #bfe6ff 99%, transparent),
    radial-gradient(1px 1px at 28% 86%, #9fd0ff 99%, transparent),
    radial-gradient(2px 2px at 62% 38%, rgba(255, 232, 190, 0.9) 99%, transparent);
  background-size: 240px 240px, 240px 240px, 380px 380px, 380px 380px, 520px 520px, 520px 520px;
  animation: gb-parallax 90s linear infinite;
}

@keyframes gb-drift {
  0%   { transform: translate3d(-2%, -1%, 0) scale(1.02); }
  50%  { transform: translate3d(2%, 2%, 0) scale(1.08); }
  100% { transform: translate3d(-1%, 3%, 0) scale(1.03); }
}

@keyframes gb-parallax {
  to {
    background-position:
      240px -240px, -240px 240px,
      380px -380px, -380px 380px,
      520px -520px, -520px 520px;
  }
}

/* Keep the column readable on desktop instead of stretching panels edge to edge. */
.gb-screen > * {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  width: 100%;
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
}

.gb-eyebrow {
  margin: 0;
  color: var(--gb-ghost);
  font-family: var(--gb-mono);
  font-size: 10px;
  letter-spacing: 0.2em;
}

.gb-title {
  margin: 0;
  font-family: var(--gb-display);
  font-size: clamp(28px, 6.4vw, 56px);
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 0.98;
  text-transform: uppercase;
}

.gb-title span { color: var(--gb-amber); }

.gb-heading {
  margin: 0;
  font-family: var(--gb-display);
  font-size: clamp(19px, 3.4vw, 26px);
  font-weight: 700;
  letter-spacing: 0.01em;
}

.gb-note {
  margin: 0;
  color: var(--gb-ghost);
  font-size: clamp(12px, 2vw, 13px);
  line-height: 1.65;
}

.gb-panel {
  display: grid;
  gap: 10px;
  align-content: start;
  border: 1px solid var(--gb-glass-border);
  border-radius: var(--gb-radius-panel);
  background: var(--gb-glass);
  box-shadow: var(--gb-glow);
  backdrop-filter: blur(16px) saturate(120%);
  padding: clamp(12px, 2.2vw, 18px);
}

/* Per-screen explainer. Collapsed by default so it never crowds the controls. */
.gb-help {
  overflow: hidden;
  border: 1px solid var(--gb-glass-border);
  border-radius: var(--gb-radius-control);
  background: var(--gb-glass-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(14px) saturate(120%);
}

.gb-help > summary {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  color: var(--gb-cyan);
  font-family: var(--gb-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  cursor: pointer;
  list-style: none;
}

.gb-help > summary::-webkit-details-marker { display: none; }

.gb-help > summary::before {
  content: '?';
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: 1px solid var(--gb-cyan);
  border-radius: 50%;
  font-size: 10px;
}

.gb-help[open] > summary { border-bottom: 1px solid rgba(158, 221, 236, 0.14); }

.gb-help ul {
  margin: 0;
  padding: 12px 16px 14px 30px;
  display: grid;
  gap: 7px;
  color: var(--gb-ghost);
  font-size: 12px;
  line-height: 1.6;
}

.gb-help li::marker { color: var(--gb-cyan); }

.gb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--gb-glass-border);
  border-radius: var(--gb-radius-control);
  background: rgba(158, 221, 236, 0.14);
  box-shadow: 0 12px 32px rgba(0, 3, 12, 0.22);
}

.gb-stat {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  background: linear-gradient(150deg, rgba(18, 31, 47, 0.92), rgba(7, 13, 22, 0.88));
}

.gb-stat dt {
  color: var(--gb-ghost);
  font-family: var(--gb-mono);
  font-size: 9px;
  letter-spacing: 0.16em;
}

.gb-stat dd {
  margin: 0;
  font-family: var(--gb-mono);
  font-size: clamp(17px, 3.4vw, 23px);
  line-height: 1;
}

.gb-stat dd.is-amber { color: var(--gb-amber); }
.gb-stat dd.is-danger { color: var(--gb-danger); }

/*
 * On touch widths the primary actions stay pinned to the bottom, within thumb
 * reach. On desktop that would leave a dead gap, so they follow the content.
 */
.gb-actions {
  display: grid;
  gap: 10px;
  margin-top: auto;
}

.gb-actions.is-split { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }

@media (min-width: 641px) {
  .gb-actions { margin-top: 0; }
}

.gb-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 12px 16px;
  border: 1px solid var(--gb-glass-border);
  border-radius: 999px;
  color: #e9ffff;
  background: linear-gradient(135deg, rgba(26, 43, 62, 0.92), rgba(11, 19, 30, 0.88));
  box-shadow: 0 9px 24px rgba(0, 3, 12, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  font: inherit;
  font-size: clamp(13px, 2.2vw, 15px);
  font-weight: 600;
  letter-spacing: 0.01em;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.gb-button i {
  font-style: normal;
  color: var(--gb-ghost);
  font-family: var(--gb-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.gb-button:hover:not(:disabled) {
  border-color: rgba(105, 230, 232, 0.72);
  box-shadow: 0 12px 30px rgba(0, 3, 12, 0.3), 0 0 20px rgba(105, 230, 232, 0.09);
  transform: translateY(-1px);
}
.gb-button:active:not(:disabled) { transform: translateY(0); }
.gb-button:focus-visible { outline: 2px solid var(--gb-cyan); outline-offset: 2px; }

.gb-button.is-primary {
  border-color: rgba(185, 255, 249, 0.68);
  color: #04121a;
  background: linear-gradient(120deg, #84f0e7 0%, #6cc9ef 52%, #b5a5ff 100%);
  box-shadow: 0 12px 30px rgba(74, 198, 221, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.48);
  font-weight: 700;
}

.gb-button.is-primary i { color: rgba(4, 18, 26, 0.72); }
.gb-button.is-danger {
  border-color: rgba(255, 92, 108, 0.58);
  color: #ff9aa5;
  background: linear-gradient(135deg, rgba(82, 29, 45, 0.72), rgba(24, 14, 27, 0.82));
}

.gb-button:disabled {
  color: #4d5f6b;
  border-color: #1b2a34;
  background: rgba(8, 14, 20, 0.86);
  box-shadow: none;
  cursor: not-allowed;
}

.gb-ship {
  display: flex;
  align-items: center;
  gap: clamp(12px, 3vw, 22px);
  flex-wrap: wrap;
}

.gb-ship svg { flex: 0 0 auto; width: clamp(150px, 36vw, 200px); height: auto; }
.gb-ship-readout { display: grid; gap: 7px; min-width: 150px; flex: 1 1 180px; }

.gb-readout-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  font-size: 12px;
}

.gb-readout-row span { color: var(--gb-ghost); }
.gb-readout-row b { font-family: var(--gb-mono); font-weight: 700; }
.gb-readout-row b.is-amber { color: var(--gb-amber); }
.gb-readout-row b.is-danger { color: var(--gb-danger); }

.gb-goods { display: grid; gap: 10px; }

.gb-good {
  display: grid;
  gap: 10px;
  border: 1px solid var(--gb-glass-border);
  border-radius: var(--gb-radius-panel);
  background: var(--gb-glass-soft);
  box-shadow: var(--gb-glow);
  backdrop-filter: blur(15px) saturate(120%);
  padding: clamp(12px, 2.2vw, 16px);
}

.gb-good.is-locked { opacity: 0.55; }
.gb-good header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }

.gb-good h3 {
  margin: 0;
  font-family: var(--gb-display);
  font-size: clamp(16px, 2.8vw, 19px);
  font-weight: 700;
}

.gb-cost {
  flex: 0 0 auto;
  color: var(--gb-amber);
  font-family: var(--gb-mono);
  font-size: clamp(13px, 2.4vw, 15px);
  font-weight: 700;
}

.gb-cost.is-short { color: var(--gb-danger); }

.gb-tag {
  justify-self: start;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: rgba(105, 230, 232, 0.06);
  padding: 3px 8px;
  font-family: var(--gb-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
}

.gb-delta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  border-top: 1px solid rgba(158, 221, 236, 0.14);
  padding-top: 10px;
  font-size: 12px;
}

.gb-delta span { color: var(--gb-ghost); }
.gb-delta b { color: var(--gb-cyan); font-family: var(--gb-mono); font-weight: 700; }
.gb-delta b.is-amber { color: var(--gb-amber); }
.gb-delta b.is-danger { color: var(--gb-danger); }

.gb-verdict {
  display: flex;
  align-items: baseline;
  gap: clamp(10px, 2.4vw, 18px);
  flex-wrap: wrap;
}

.gb-verdict h2 {
  margin: 0;
  font-family: var(--gb-display);
  font-size: clamp(34px, 8.6vw, 68px);
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 0.96;
  text-transform: uppercase;
}

.gb-verdict.is-win h2 { color: var(--gb-amber); text-shadow: 0 0 26px rgba(255, 184, 74, 0.45); }
.gb-verdict.is-loss h2 { color: var(--gb-danger); text-shadow: 0 0 26px rgba(255, 92, 108, 0.4); }

.gb-gained { display: flex; flex-wrap: wrap; gap: 8px; }

.gb-chip {
  border: 1px solid currentColor;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  padding: 5px 10px;
  font-family: var(--gb-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.gb-kills { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }

.gb-kills li {
  display: flex;
  align-items: center;
  gap: 9px;
  font-family: var(--gb-mono);
  font-size: 12px;
}

.gb-kills li::before {
  content: '';
  width: 5px;
  height: 5px;
  background: var(--gb-danger);
  transform: rotate(45deg);
}

.gb-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 184, 74, 0.48);
  border-radius: var(--gb-radius-control);
  background: linear-gradient(120deg, rgba(255, 184, 74, 0.16), rgba(115, 80, 145, 0.12));
  box-shadow: 0 10px 28px rgba(0, 3, 12, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  padding: 11px 14px;
  color: var(--gb-amber);
  font-size: 12px;
}

.gb-banner::before {
  content: '';
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gb-amber);
  box-shadow: 0 0 10px var(--gb-amber);
  animation: gb-pulse 1.1s ease-in-out infinite;
}

@keyframes gb-pulse { 50% { opacity: 0.25; } }

@media (max-width: 640px) {
  .gb-screen {
    gap: 10px;
    padding: max(12px, env(safe-area-inset-top)) 12px max(14px, env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }
  .gb-ship { justify-content: center; }

  .gb-shop > header {
    position: sticky;
    z-index: 4;
    top: -12px;
    padding: 12px 2px 9px;
    background: linear-gradient(180deg, rgba(4, 7, 12, 0.98) 72%, rgba(4, 7, 12, 0));
    backdrop-filter: blur(10px);
  }

  .gb-shop .gb-heading { font-size: 24px; }

  .gb-shop > .gb-note {
    font-size: 11px;
    line-height: 1.5;
  }

  .gb-good {
    gap: 8px;
    padding: 13px;
    border-radius: 19px;
  }

  .gb-good.is-locked { opacity: 0.72; }

  .gb-good h3 { font-size: 17px; }
  .gb-cost { font-size: 12px; }
  .gb-good .gb-note { font-size: 11px; line-height: 1.45; }

  .gb-delta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
    padding-top: 9px;
    font-size: 11px;
  }

  .gb-delta > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .gb-delta b {
    display: block;
    overflow-wrap: anywhere;
  }

  .gb-good .gb-button {
    min-height: 44px;
    padding: 9px 14px;
  }

  .gb-shop > .gb-actions {
    position: sticky;
    z-index: 4;
    bottom: calc(-1 * max(14px, env(safe-area-inset-bottom)));
    padding: 9px 0 max(14px, env(safe-area-inset-bottom));
    background: linear-gradient(0deg, rgba(4, 7, 12, 0.98) 72%, rgba(4, 7, 12, 0));
  }
}

@media (prefers-reduced-motion: reduce) {
  .gb-screen::before,
  .gb-screen::after,
  .gb-banner::before {
    animation: none;
  }
}

`

export function ensureScreenStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}
