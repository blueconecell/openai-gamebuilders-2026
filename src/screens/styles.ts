const STYLE_ID = 'gb-screens-style'

/**
 * Screens ship their own scoped styles because the shared stylesheet is owned
 * by the integration session. Colours fall back to literals so a screen still
 * renders correctly when mounted outside the main shell.
 */
const CSS = `
.gb-screen {
  --gb-cyan: var(--cyan, #69e6e8);
  --gb-amber: var(--amber, #ffb84a);
  --gb-danger: var(--danger, #ff5c6c);
  --gb-ghost: var(--ghost, #93a7b3);
  --gb-line: var(--line, #263b48);
  --gb-panel: var(--panel, #0c141c);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: clamp(12px, 2.4vh, 22px);
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: clamp(14px, 3vw, 30px);
  overflow-y: auto;
  color: #e9ffff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(105, 230, 232, 0.07), transparent 62%),
    #05070a;
}

.gb-eyebrow {
  margin: 0;
  color: var(--gb-ghost);
  font-size: 10px;
  letter-spacing: 0.2em;
}

.gb-title {
  margin: 0;
  font-family: Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: clamp(26px, 6vw, 52px);
  letter-spacing: 0.03em;
  line-height: 1;
}

.gb-title span { color: var(--gb-amber); }

.gb-heading {
  margin: 0;
  font-size: clamp(15px, 2.6vw, 19px);
  letter-spacing: 0.06em;
}

.gb-note {
  margin: 0;
  color: var(--gb-ghost);
  font-size: clamp(11px, 1.9vw, 12px);
  line-height: 1.6;
}

.gb-panel {
  border: 1px solid var(--gb-line);
  background: rgba(12, 20, 28, 0.82);
  padding: clamp(12px, 2.2vw, 18px);
}

.gb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 1px;
  border: 1px solid var(--gb-line);
  background: var(--gb-line);
}

.gb-stat {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  background: var(--gb-panel);
}

.gb-stat dt {
  color: var(--gb-ghost);
  font-size: 9px;
  letter-spacing: 0.16em;
}

.gb-stat dd {
  margin: 0;
  font-size: clamp(17px, 3.4vw, 23px);
  line-height: 1;
}

.gb-stat dd.is-amber { color: var(--gb-amber); }

.gb-actions {
  display: grid;
  gap: 10px;
  margin-top: auto;
}

.gb-actions.is-split { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }

.gb-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 12px 16px;
  border: 1px solid var(--gb-line);
  color: #e9ffff;
  background: var(--gb-panel);
  font: inherit;
  font-size: clamp(12px, 2.2vw, 14px);
  letter-spacing: 0.08em;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.gb-button i {
  font-style: normal;
  color: var(--gb-ghost);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.gb-button:hover:not(:disabled) { border-color: var(--gb-cyan); }
.gb-button:focus-visible { outline: 2px solid var(--gb-cyan); outline-offset: 2px; }

.gb-button.is-primary {
  border-color: var(--gb-cyan);
  color: #04121a;
  background: var(--gb-cyan);
  font-weight: 700;
}

.gb-button.is-primary i { color: rgba(4, 18, 26, 0.72); }
.gb-button.is-danger { border-color: var(--gb-danger); color: var(--gb-danger); }

.gb-button:disabled {
  color: #4d5f6b;
  border-color: #1b2a34;
  background: #080e14;
  cursor: not-allowed;
}

.gb-ship {
  display: flex;
  align-items: center;
  gap: clamp(12px, 3vw, 22px);
  flex-wrap: wrap;
}

.gb-ship svg { flex: 0 0 auto; width: clamp(140px, 34vw, 190px); height: auto; }
.gb-ship-readout { display: grid; gap: 7px; min-width: 130px; }

.gb-readout-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  font-size: 11px;
  letter-spacing: 0.08em;
}

.gb-readout-row span { color: var(--gb-ghost); }
.gb-readout-row b { font-weight: 700; }
.gb-readout-row b.is-amber { color: var(--gb-amber); }
.gb-readout-row b.is-danger { color: var(--gb-danger); }

.gb-goods { display: grid; gap: 10px; }

.gb-good {
  display: grid;
  gap: 10px;
  border: 1px solid var(--gb-line);
  background: rgba(12, 20, 28, 0.82);
  padding: clamp(12px, 2.2vw, 16px);
}

.gb-good.is-locked { opacity: 0.55; }
.gb-good header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.gb-good h3 { margin: 0; font-size: clamp(13px, 2.4vw, 15px); letter-spacing: 0.05em; }

.gb-cost {
  flex: 0 0 auto;
  color: var(--gb-amber);
  font-size: clamp(13px, 2.4vw, 15px);
  font-weight: 700;
}

.gb-cost.is-short { color: var(--gb-danger); }

.gb-delta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  border-top: 1px dashed var(--gb-line);
  padding-top: 10px;
  font-size: 11px;
  letter-spacing: 0.06em;
}

.gb-delta span { color: var(--gb-ghost); }
.gb-delta b { color: var(--gb-cyan); font-weight: 700; }
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
  font-family: Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: clamp(30px, 8vw, 62px);
  letter-spacing: 0.04em;
  line-height: 1;
}

.gb-verdict.is-win h2 { color: var(--gb-amber); }
.gb-verdict.is-loss h2 { color: var(--gb-danger); }

.gb-kills { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }

.gb-kills li {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 11px;
  letter-spacing: 0.06em;
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
  border: 1px solid var(--gb-amber);
  background: rgba(255, 184, 74, 0.09);
  padding: 11px 14px;
  color: var(--gb-amber);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.gb-banner::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gb-amber);
  box-shadow: 0 0 10px var(--gb-amber);
  animation: gb-pulse 1.1s ease-in-out infinite;
}

@keyframes gb-pulse { 50% { opacity: 0.25; } }

@media (max-width: 640px) {
  .gb-screen { gap: 12px; }
  .gb-ship { justify-content: center; }
  .gb-ship-readout { flex: 1 1 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .gb-banner::before { animation: none; }
}
`

export function ensureScreenStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}
