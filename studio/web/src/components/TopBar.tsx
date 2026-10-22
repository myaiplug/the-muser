import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/engine'
import type { History } from '../state/history'
import type { Project, Status } from '../types'
import { Knob } from './Knob'
import { Meter } from './Meter'

type Props = {
  status: Status | null
  history: History<Project>
  onOpenSystem: () => void
}

const LED_KEYS: [string, string][] = [
  ['ollama', 'LLM'],
  ['gpu', 'GPU'],
  ['acestep', 'ACE'],
  ['demucs', 'STEMS'],
  ['ffmpeg', 'FX'],
]

function Lcd() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const t = audio.currentTime()
      const m = Math.floor(t / 60)
      const s = Math.floor(t % 60)
      const ms = Math.floor((t % 1) * 100)
      if (ref.current) ref.current.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <span ref={ref} className="lcd">00:00.00</span>
}

export function TopBar({ status, history, onOpenSystem }: Props) {
  const [, force] = useState(0)
  useEffect(() => audio.subscribe(() => force((x) => x + 1)), [])
  const [showHist, setShowHist] = useState(false)

  return (
    <header className="topbar">
      <div className="brand">
        <svg className="logo" viewBox="0 0 40 40" aria-hidden>
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f7dc8b" />
              <stop offset="1" stopColor="#a8792a" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="36" height="36" rx="9" fill="#0c0c10" stroke="url(#lg)" strokeWidth="1.5" />
          <path d="M9 27 V13 L20 27 V13 M24 20 q2 -7 4 0 t4 0" fill="none" stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="brand-text">
          <span className="brand-co">NoDAW LABS</span>
          <span className="brand-name">THE MUSER <em>STUDIO</em></span>
        </div>
      </div>

      <div className="transport">
        <button className="tbtn" onClick={() => audio.stop()} title="Stop (return to start)" aria-label="Stop">■</button>
        <button
          className={`tbtn play ${audio.playing ? 'on' : ''}`}
          onClick={() => (audio.playing ? audio.pause() : audio.play())}
          title="Play / pause (Space)"
          aria-label={audio.playing ? 'Pause' : 'Play'}
        >
          {audio.playing ? '❚❚' : '▶'}
        </button>
        <button className={`tbtn ${audio.loop ? 'on' : ''}`} onClick={() => audio.setLoop(!audio.loop)} title="Loop" aria-label="Loop">⟲</button>
        <Lcd />
        <div className="hist">
          <button className="tbtn" disabled={!history.canUndo} onClick={history.undo} title={`Undo ${history.undoLabel} (Ctrl+Z)`} aria-label="Undo">↶</button>
          <button className="tbtn" disabled={!history.canRedo} onClick={history.redo} title={`Redo ${history.redoLabel} (Ctrl+Shift+Z)`} aria-label="Redo">↷</button>
          <button className="hist-count" onClick={() => setShowHist((v) => !v)} title="Edit history">
            {history.depth} <small>edits</small>
          </button>
          {showHist && (
            <div className="hist-pop" onMouseLeave={() => setShowHist(false)}>
              <div className="hist-pop-title">History</div>
              {history.entries.length === 0 && <div className="muted">No edits yet</div>}
              {[...history.entries].reverse().slice(0, 14).map((e, i) => (
                <div key={i} className={i === 0 ? 'cur' : ''}>{e}</div>
              ))}
              {history.redoLabel && <div className="muted">Redo: {history.redoLabel}</div>}
            </div>
          )}
        </div>
      </div>

      <div className="master">
        <Knob
          label="Master"
          value={history.state.master.gain_db}
          min={-24}
          max={12}
          defaultValue={0}
          size={44}
          bipolar
          format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
          onBegin={() => history.begin('Master gain')}
          onChange={(v) => history.preview((s) => ({ ...s, master: { ...s.master, gain_db: v } }))}
          onEnd={history.end}
          onCommit={(v) => history.commit('Master gain', (s) => ({ ...s, master: { ...s.master, gain_db: v } }))}
        />
        <Meter getAnalyser={() => audio.masterAnalyser} segments={16} />
      </div>

      <button className="leds" onClick={onOpenSystem} title="System status">
        {LED_KEYS.map(([k, label]) => {
          const it = status?.items[k]
          const cls = !status ? 'off' : it?.available ? 'ok' : k === 'ollama' || k === 'ffmpeg' ? 'bad' : 'warn'
          return (
            <span key={k} className={`sys-led ${cls}`}>
              <i />
              {label}
            </span>
          )
        })}
      </button>
    </header>
  )
}
