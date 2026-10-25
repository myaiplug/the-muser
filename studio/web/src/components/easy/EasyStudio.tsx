import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, waitJob } from '../../api'
import type { FinishTarget, MacroKey, Preset, Slider, Track } from '../../types'
import { Player } from '../Player'

type Version = { track: Track; label: string; macros: Record<MacroKey, number> }
export type EasySession = { genreId: string | null; vibe: string; macros: Record<MacroKey, number>; versions: string[]; idx: number; labels: string[] }

const NEUTRAL: Record<MacroKey, number> = { energy: 50, vocals: 50, bass: 50, brightness: 50, space: 50 }
const ENDS: Record<MacroKey, [string, string]> = {
  energy: ['Calm', 'Hype'],
  vocals: ['Back', 'Front'],
  bass: ['Light', 'Heavy'],
  brightness: ['Warm', 'Airy'],
  space: ['Dry', 'Wide'],
}
const HUES: Record<string, [string, string]> = {
  sun: ['#ffb547', '#ff6a3d'], cloud: ['#9fb7ff', '#5b6cff'], film: ['#c9a96e', '#5a4632'], rocket: ['#3ef0ff', '#7a5cff'],
  mic: ['#e3b95c', '#8f6a26'], disco: ['#ff4fd8', '#7a5cff'], sax: ['#d4a373', '#6b3e26'], moon: ['#8f9bff', '#2b2f5c'],
  star: ['#ff8fd1', '#ff4f8b'], rose: ['#ff5e7e', '#7a1f3d'], guitar: ['#ff7043', '#6d2a12'], sunset: ['#ff4fd8', '#ffb547'],
  fire: ['#ff4d5e', '#7a1020'], skull: ['#b0b0b8', '#33333a'], palm: ['#4dffc3', '#2a7a8f'], hat: ['#e8c07a', '#7a5a2a'],
  wave: ['#3ef0ff', '#0d5a7a'], speaker: ['#7aff4d', '#1f5a2a'], church: ['#ffe08a', '#a8792a'], leaf: ['#9be37a', '#3d6b2a'],
  horns: ['#ff4d5e', '#222'], car: ['#c77dff', '#3a1f5c'], maracas: ['#ffd23f', '#e85d04'], bolt: ['#e0e0ff', '#4b4bff'],
}

type Props = {
  toast: (text: string, kind?: 'info' | 'error' | 'ok') => void
  onTrack: (t: Track) => void
  initial: EasySession | null
  onSession: (s: EasySession) => void
  onOpenAdvanced: (t?: Track) => void
}

export function EasyStudio({ toast, onTrack, initial, onSession, onOpenAdvanced }: Props) {
  const [vibes, setVibes] = useState<Preset[]>([])
  const [sliders, setSliders] = useState<Slider[]>([])
  const [targets, setTargets] = useState<Record<string, FinishTarget>>({})
  const [showAll, setShowAll] = useState(false)
  const [genreId, setGenreId] = useState<string | null>(initial?.genreId ?? null)
  const [vibe, setVibe] = useState(initial?.vibe ?? '')
  const [macros, setMacros] = useState<Record<MacroKey, number>>(initial?.macros ?? NEUTRAL)
  const [versions, setVersions] = useState<Version[]>([])
  const [idx, setIdx] = useState(-1)
  const [busy, setBusy] = useState('')
  const [files, setFiles] = useState<Record<string, string> | null>(null)
  const [midi, setMidi] = useState<string | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const refUpload = useRef<HTMLInputElement>(null)
  const renderTimer = useRef<number | undefined>(undefined)
  const macrosRef = useRef(macros)
  macrosRef.current = macros

  const cur = idx >= 0 ? versions[idx] : null
  const track = cur?.track ?? null

  useEffect(() => {
    api.vibes().then((v) => {
      setVibes(v.vibes)
      setSliders(v.sliders)
      setTargets(v.finish)
    }).catch(() => toast('Could not load the vibe library. Is the Studio running?', 'error'))
  }, [toast])
  useEffect(() => {
    api.presets({ category: 'genre' }).then((r) => setAll(r.presets)).catch(() => undefined)
  }, [])
  const [all, setAll] = useState<Preset[]>([])

  // restore the last session's versions
  useEffect(() => {
    if (!initial?.versions?.length) return
    Promise.all(initial.versions.map((id) => api.track(id).catch(() => null))).then((ts) => {
      const vs: Version[] = []
      ts.forEach((t, i) => t && vs.push({ track: t, label: initial.labels?.[i] ?? 'Restored', macros: initial.macros }))
      if (vs.length) {
        setVersions(vs)
        setIdx(Math.min(initial.idx, vs.length - 1))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // autosave
  useEffect(() => {
    onSession({ genreId, vibe, macros, versions: versions.map((v) => v.track.id), idx, labels: versions.map((v) => v.label) })
  }, [genreId, vibe, macros, versions, idx, onSession])

  const push = useCallback((t: Track, label: string, m: Record<MacroKey, number>) => {
    setVersions((vs) => [...vs.slice(0, idx + 1), { track: t, label, macros: m }].slice(-40))
    setIdx((i) => Math.min(i + 1, 39))
    setFiles(null)
    onTrack(t)
  }, [idx, onTrack])

  const run = async <T,>(label: string, start: () => Promise<{ job_id: string }>): Promise<T | null> => {
    setBusy(label)
    try {
      const { job_id } = await start()
      return await waitJob<T>(job_id, (m) => setBusy(m))
    } catch (e) {
      toast((e as Error).message, 'error')
      return null
    } finally {
      setBusy('')
    }
  }

  const make = async () => {
    if (!genreId && !vibe.trim()) {
      toast('Pick a vibe tile or describe the vibe first.', 'info')
      return
    }
    const g = all.find((p) => p.id === genreId) ?? vibes.find((p) => p.id === genreId)
    const m = (g?.macros as Record<MacroKey, number>) ?? macros
    const res = await run<{ track: Track; genre_id: string; macros: Record<MacroKey, number> }>('Writing your track...', () =>
      api.easyMake({ genre_id: genreId, vibe }))
    if (res) {
      setGenreId(res.genre_id)
      setMacros(res.macros ?? m)
      push(res.track, 'Made it', res.macros ?? m)
      toast('Your track is ready. Shape it with the sliders, then finish it.', 'ok')
    }
  }

  const rerender = (m: Record<MacroKey, number>) => {
    if (!track) return
    window.clearTimeout(renderTimer.current)
    renderTimer.current = window.setTimeout(async () => {
      const res = await run<{ track: Track }>('Updating the mix...', () => api.easyRender({ track_id: track.id, genre_id: genreId, ...m }))
      if (res) push(res.track, 'Shaped', m)
    }, 350)
  }

  const finish = async (target: string) => {
    if (!track) return
    const res = await run<{ track: Track; report: { lufs: number; true_peak_db: number } }>(`Finishing for ${targets[target]?.label}...`, () =>
      api.finish({ track_id: track.id, target }))
    if (res) {
      push(res.track, `Finished for ${targets[target]?.label}`, macros)
      toast(`Finished: ${res.report.lufs.toFixed(1)} LUFS, ${res.report.true_peak_db.toFixed(1)} dBTP.`, 'ok')
    }
  }

  const doExport = async () => {
    if (!track) return
    const finished = !!track.meta?.finished
    const res = await run<{ files: Record<string, string> }>('Exporting...', () =>
      api.export({ track_id: track.id, formats: ['wav', 'mp3'], include_stems: false, normalize: !finished }))
    if (res) {
      setFiles(res.files)
      toast(finished ? 'Exported at your finished loudness.' : 'Exported. Tip: finish for a platform first for the best loudness.', 'ok')
    }
  }

  const tool = async (name: string, label: string, extra: Record<string, unknown> = {}) => {
    if (!track) return
    const res = await run<{ track?: Track; midi_url?: string; note?: string; notes?: number; engine?: string }>(label, () =>
      api.tool(name, { track_id: track.id, ...extra }))
    if (!res) return
    if (res.midi_url) {
      setMidi(res.midi_url)
      toast(`MIDI ready (${res.notes ?? 0} notes).`, 'ok')
    }
    if (res.track) {
      push(res.track, label.replace('...', ''), macros)
      toast(res.note || 'Done. Undo brings back the previous version.', 'ok')
    }
  }

  const onUpload = async (f: File) => {
    setBusy(`Importing ${f.name}...`)
    try {
      const { track: t } = await api.upload(f)
      push(t, 'Imported', NEUTRAL)
      setMacros(NEUTRAL)
      toast(`Imported ${f.name}. The sliders shape the full mix; split stems for finer control.`, 'ok')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy('')
    }
  }

  const onReference = async (f: File) => {
    if (!track) return
    setBusy('Importing reference...')
    try {
      const { track: ref } = await api.upload(f)
      await tool('match', 'Matching your reference...', { reference_track_id: ref.id })
    } catch (e) {
      toast((e as Error).message, 'error')
      setBusy('')
    }
  }

  const tiles = useMemo(() => (showAll ? all : vibes), [showAll, all, vibes])
  const report = track?.meta?.master as { lufs: number; true_peak_db: number; target: { key: string }; within_tolerance?: boolean } | undefined
  const analysis = (track?.meta?.analysis ?? null) as { lufs: number | null; true_peak_db: number } | null

  return (
    <div className="easy">
      <section className="easy-hero">
        <div className="easy-kicker">Easy mode</div>
        <h1>Make a song in three steps.</h1>
        <p className="muted">Pick a vibe, press Make It, then shape and finish. Every step can be undone.</p>
      </section>

      {/* Step 1 */}
      <section className="panel easy-step">
        <div className="step-head"><span className="step-n">1</span><h2>Pick a vibe</h2>
          <button className="link" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show favorites' : `More vibes (${all.length || 24})`}</button>
        </div>
        <div className="vibe-grid">
          {tiles.map((p) => {
            const [a, b] = HUES[p.icon ?? ''] ?? ['#e3b95c', '#8f6a26']
            return (
              <button key={p.id} className={`vibe ${genreId === p.id ? 'on' : ''}`} onClick={() => { setGenreId(p.id); if (p.macros) setMacros(p.macros) }} aria-pressed={genreId === p.id}>
                <span className="vibe-orb" style={{ background: `radial-gradient(circle at 30% 30%, ${a}, ${b} 70%)` }} />
                <span className="vibe-name">{p.name}</span>
                <span className="vibe-desc">{p.description}</span>
              </button>
            )
          })}
        </div>
        <div className="describe">
          <input
            aria-label="Describe the vibe"
            placeholder="Or describe it: rainy night drive, soft piano, slow and warm"
            value={vibe}
            maxLength={300}
            onChange={(e) => setVibe(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && void make()}
          />
          <button className="btn gold make" disabled={!!busy} onClick={() => void make()}>{busy && !track ? 'Making...' : 'Make It'}</button>
        </div>
        <div className="easy-alt">
          <span className="muted">Already have a song?</span>
          <button className="btn ghost small" disabled={!!busy} onClick={() => upload.current?.click()}>Use my own audio</button>
          <input ref={upload} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = '' }} />
        </div>
      </section>

      {busy && <div className="easy-busy"><span className="spinner" /> {busy}</div>}

      {/* Step 2 */}
      <section className={`panel easy-step ${track ? '' : 'locked'}`}>
        <div className="step-head"><span className="step-n">2</span><h2>Shape it</h2>
          <div className="undo-row">
            <button className="btn ghost small" disabled={idx <= 0 || !!busy} onClick={() => setIdx((i) => i - 1)} aria-label="Undo step">Undo</button>
            <button className="btn ghost small" disabled={idx >= versions.length - 1 || !!busy} onClick={() => setIdx((i) => i + 1)} aria-label="Redo step">Redo</button>
            <button className="btn ghost small" disabled={!track || !!busy} onClick={() => { setMacros(NEUTRAL); rerender(NEUTRAL) }}>Reset sliders</button>
          </div>
        </div>
        {track ? (
          <>
            <Player url={track.url} title={track.title} sub={cur?.label} />
            <div className="version-strip">
              {versions.map((v, i) => (
                <button key={v.track.id + i} className={`ver ${i === idx ? 'on' : ''}`} onClick={() => setIdx(i)} disabled={!!busy}>{i + 1}. {v.label}</button>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Your track appears here after Make It.</p>
        )}
        <div className="macro-grid">
          {sliders.map((s) => (
            <label key={s.key} className="macro">
              <span className="macro-top"><strong>{s.label}</strong><em>{Math.round(macros[s.key])}</em></span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                aria-label={s.label}
                value={macros[s.key]}
                disabled={!track || !!busy}
                onChange={(e) => setMacros((m) => ({ ...m, [s.key]: Number(e.target.value) }))}
                onPointerUp={() => rerender(macrosRef.current)}
                onKeyUp={() => rerender(macrosRef.current)}
                style={{ ['--fill' as string]: `${macros[s.key]}%` }}
              />
              <span className="macro-ends"><span>{ENDS[s.key][0]}</span><span>{ENDS[s.key][1]}</span></span>
              <span className="macro-help">{s.help}</span>
            </label>
          ))}
        </div>
        <div className="tools-row">
          <span className="muted">One-click tools</span>
          <button className="chip-btn" disabled={!track || !!busy} onClick={() => void tool('split', 'Splitting stems...', { mode: '4stem' })}>Split stems</button>
          <button className="chip-btn" disabled={!track || !!busy} onClick={() => void tool('remove_vocals', 'Removing vocals...')}>Remove vocals</button>
          <button className="chip-btn" disabled={!track || !!busy} onClick={() => void tool('denoise', 'Cleaning up noise...')}>Clean up noise</button>
          <button className="chip-btn" disabled={!track || !!busy} onClick={() => refUpload.current?.click()}>Match my reference</button>
          <button className="chip-btn" disabled={!track || !!busy} onClick={() => void tool('midi', 'Turning into MIDI...')}>Turn into MIDI</button>
          <input ref={refUpload} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onReference(f); e.target.value = '' }} />
          {midi && <a className="dl" href={midi} download>Download MIDI</a>}
        </div>
      </section>

      {/* Step 3 */}
      <section className={`panel easy-step ${track ? '' : 'locked'}`}>
        <div className="step-head"><span className="step-n">3</span><h2>Finish and export</h2></div>
        <div className="finish-grid">
          {Object.entries(targets).map(([k, t]) => (
            <button key={k} className={`finish-card ${report?.target?.key === k ? 'on' : ''}`} disabled={!track || !!busy} onClick={() => void finish(k)}>
              <span className="finish-name">{t.label}</span>
              <span className="finish-spec">{t.lufs} LUFS · {t.true_peak_db} dBTP</span>
              <span className="finish-note">{t.note}</span>
            </button>
          ))}
        </div>
        <div className="finish-foot">
          <div className="meter-read">
            {report ? (
              <span className={`badge ${report.within_tolerance === false ? 'warn' : 'ok'}`}>Measured {report.lufs.toFixed(1)} LUFS · {report.true_peak_db.toFixed(1)} dBTP</span>
            ) : analysis ? (
              <span className="badge">Now {analysis.lufs?.toFixed(1) ?? '-'} LUFS · {analysis.true_peak_db.toFixed(1)} dBTP</span>
            ) : <span className="muted">Finish sets loudness and peaks for the platform. No clipping, guaranteed.</span>}
          </div>
          <button className="btn gold" disabled={!track || !!busy} onClick={() => void doExport()}>Export WAV + MP3</button>
        </div>
        {files && (
          <div className="downloads">
            {Object.entries(files).map(([k, url]) => (
              <a key={k} className="dl" href={url} download>Download {k.replace('_', ' ').toUpperCase()}</a>
            ))}
          </div>
        )}
      </section>

      <p className="easy-foot muted">
        Want every knob? <button className="link" onClick={() => onOpenAdvanced(cur?.track)}>Switch to Advanced</button> for per-stem chains, model settings and 100+ presets.
      </p>
    </div>
  )
}
