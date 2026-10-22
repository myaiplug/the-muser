import { useCallback } from 'react'
import { audio } from '../audio/engine'
import type { History } from '../state/history'
import { DEFAULT_STEM, type Project, type StemParams, type Track } from '../types'
import { Knob } from './Knob'
import { Meter } from './Meter'
import { Waveform } from './Waveform'

export type Channel = { id: string; name: string; color: string; url: string }

type Props = {
  track: Track | null
  channels: Channel[]
  buffersVersion: number
  history: History<Project>
  busy: string
  onSplit: (mode: '4stem' | '2stem') => void
  onRender: () => void
  onExport: () => void
}

const db = (v: number) => (v <= -59.9 ? '-inf' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)
const pct = (v: number) => `${Math.round(v * 100)}%`
const panFmt = (v: number) => (Math.abs(v) < 0.02 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)

const METHOD_LABEL: Record<string, string> = {
  'demo-synth': 'DEMO STEMS',
  'band-split': 'BAND SPLIT (fallback)',
  'demucs-4stem': 'DEMUCS 4-STEM',
  'demucs-2stem': 'DEMUCS 2-STEM',
}

export function Mixer({ track, channels, buffersVersion, history, busy, onSplit, onRender, onExport }: Props) {
  const mixer = history.state.mixer
  const anySolo = channels.some((c) => mixer[c.id]?.solo)

  const setParam = useCallback(
    (id: string, key: keyof StemParams, v: number | boolean) =>
      (s: Project): Project => ({
        ...s,
        mixer: { ...s.mixer, [id]: { ...(s.mixer[id] ?? DEFAULT_STEM), [key]: v } },
      }),
    [],
  )

  const knob = (ch: Channel, key: keyof StemParams, label: string, min: number, max: number, def: number, fmt: (v: number) => string, bipolar = false) => {
    const p = mixer[ch.id] ?? DEFAULT_STEM
    return (
      <Knob
        key={key}
        label={label}
        value={p[key] as number}
        min={min}
        max={max}
        defaultValue={def}
        bipolar={bipolar}
        size={46}
        color={ch.color}
        format={fmt}
        onBegin={() => history.begin(`${ch.name} ${label}`)}
        onChange={(v) => history.preview(setParam(ch.id, key, v))}
        onEnd={() => history.end()}
        onCommit={(v) => history.commit(`${ch.name} ${label}`, setParam(ch.id, key, v))}
      />
    )
  }

  if (!track) {
    return (
      <section className="panel mixer empty">
        <div className="panel-head">
          <h2>Stem Mixer</h2>
        </div>
        <div className="empty-state">
          <div className="empty-orb" />
          <p>Describe a track in the composer, or pick one from the library.</p>
          <p className="muted">Then split it into stems and sculpt each one.</p>
        </div>
      </section>
    )
  }

  const hasStems = track.stems.length > 0
  return (
    <section className="panel mixer">
      <div className="panel-head">
        <div className="mixer-title">
          <h2>{track.title}</h2>
          <div className="chips">
            <span className={`chip src-${track.source}`}>{track.source}</span>
            {track.key && <span className="chip">{track.key}</span>}
            {track.bpm ? <span className="chip">{track.bpm} BPM</span> : null}
            <span className="chip">{track.duration_s.toFixed(1)}s</span>
            {track.stem_method && <span className="chip gold">{METHOD_LABEL[track.stem_method] ?? track.stem_method}</span>}
          </div>
        </div>
        <div className="mixer-actions">
          <button className="btn" disabled={!!busy} onClick={() => onSplit('4stem')} title="Drums / bass / other / vocals (Demucs htdemucs)">
            <span className="ico">⫶</span> Split 4 stems
          </button>
          <button className="btn" disabled={!!busy} onClick={() => onSplit('2stem')} title="Vocals / accompaniment (Demucs --two-stems)">
            Vocals / Inst
          </button>
          <button className="btn gold" disabled={!!busy || !hasStems} onClick={onRender} title="Render the mix server-side with the repo's effect + mix tools">
            Render mix
          </button>
          <button className="btn" disabled={!!busy} onClick={onExport}>
            Export
          </button>
        </div>
      </div>
      {track.notes && <div className="note">{track.notes}</div>}
      {busy && (
        <div className="busy">
          <span className="spinner" /> {busy}
        </div>
      )}
      <div className="lanes" data-version={buffersVersion}>
        {channels.map((ch, i) => {
          const p = mixer[ch.id] ?? DEFAULT_STEM
          const audible = !p.mute && (!anySolo || p.solo)
          return (
            <div className={`lane ${audible ? '' : 'is-silent'}`} key={ch.id} style={{ ['--lane' as string]: ch.color, animationDelay: `${i * 60}ms` }}>
              <div className="lane-head">
                <div className="lane-name">
                  <span className="lane-dot" />
                  <span>{ch.name}</span>
                </div>
                <div className="ms">
                  <button
                    className={`led-btn mute ${p.mute ? 'on' : ''}`}
                    onClick={() => history.commit(`${p.mute ? 'Unmute' : 'Mute'} ${ch.name}`, setParam(ch.id, 'mute', !p.mute))}
                    aria-pressed={p.mute}
                  >
                    M
                  </button>
                  <button
                    className={`led-btn solo ${p.solo ? 'on' : ''}`}
                    onClick={() => history.commit(`${p.solo ? 'Unsolo' : 'Solo'} ${ch.name}`, setParam(ch.id, 'solo', !p.solo))}
                    aria-pressed={p.solo}
                  >
                    S
                  </button>
                </div>
                <Meter getAnalyser={() => audio.analyser(ch.id)} segments={12} horizontal />
              </div>
              <div className="lane-knobs">
                {knob(ch, 'gain_db', 'Vol', -60, 12, 0, db)}
                {knob(ch, 'pan', 'Pan', -1, 1, 0, panFmt, true)}
                {knob(ch, 'eq_low_db', 'Low', -18, 18, 0, db, true)}
                {knob(ch, 'eq_mid_db', 'Mid', -18, 18, 0, db, true)}
                {knob(ch, 'eq_high_db', 'High', -18, 18, 0, db, true)}
                {knob(ch, 'comp', 'Comp', 0, 1, 0, pct)}
                {knob(ch, 'reverb', 'Verb', 0, 1, 0, pct)}
                {knob(ch, 'room', 'Room', 0, 1, 0.5, pct)}
              </div>
              <div className="lane-wave">
                <Waveform buffer={audio.buffer(ch.id)} color={ch.color} dim={!audible} onSeek={(t) => audio.seek(t)} />
              </div>
            </div>
          )
        })}
      </div>
      {!hasStems && (
        <div className="hint-row">Playing the full mix. Split the track to get one lane per sound.</div>
      )}
    </section>
  )
}
