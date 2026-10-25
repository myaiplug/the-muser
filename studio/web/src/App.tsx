import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, waitJob } from './api'
import { audio } from './audio/engine'
import { Composer } from './components/Composer'
import { Deck } from './components/Deck'
import { ExportDialog, SystemDrawer, Toasts, type Toast } from './components/Dialogs'
import { Library } from './components/Library'
import { Mixer, type Channel } from './components/Mixer'
import { TopBar } from './components/TopBar'
import { EasyStudio, type EasySession } from './components/easy/EasyStudio'
import { ProPanel } from './components/pro/ProPanel'
import { useHistory } from './state/history'
import { DEFAULT_STEM, type Mode, type Project, type Status, type Track } from './types'

const INITIAL: Project = {
  mixer: {},
  master: { gain_db: 0, normalize: true },
  synth: { wave: 'sawtooth', cutoff: 0.65, reso: 0.15, attack: 0.01, release: 0.4, detune: 8, volume: 0.7, octave: 0 },
  pads: { volume: 0.8, pitch: 0, tone: 0.5 },
  pattern: (() => {
    const p = Array.from({ length: 16 }, () => Array(16).fill(false) as boolean[])
    ;[0, 6, 10].forEach((s) => (p[0][s] = true))
    ;[4, 12].forEach((s) => (p[1][s] = true))
    for (let s = 0; s < 16; s += 2) p[4][s] = true
    return p
  })(),
  bpm: 92,
}

const isTyping = () => {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
}

export default function App() {
  const history = useHistory<Project>(INITIAL)
  const [status, setStatus] = useState<Status | null>(null)
  const [apiDown, setApiDown] = useState(false)
  const [tracks, setTracks] = useState<Track[]>([])
  const [current, setCurrent] = useState<Track | null>(null)
  const [buffersVersion, setBuffersVersion] = useState(0)
  const [busy, setBusy] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showSystem, setShowSystem] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const [mode, setModeState] = useState<Mode>(() => (localStorage.getItem('muser.mode') === 'advanced' ? 'advanced' : 'easy'))
  const setMode = (m: Mode) => {
    localStorage.setItem('muser.mode', m)
    setModeState(m)
  }
  const [easySession, setEasySession] = useState<EasySession | null | undefined>(undefined)
  const saveTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    api.session().then((r) => setEasySession((r.easy as EasySession) ?? null)).catch(() => setEasySession(null))
  }, [])
  const onEasySession = useCallback((s: EasySession) => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void api.saveSession({ easy: s }).catch(() => undefined), 600)
  }, [])

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200)
  }, [])

  const refreshStatus = useCallback(async (force = false) => {
    try {
      setStatus(await api.status(force))
      setApiDown(false)
    } catch {
      setApiDown(true)
    }
  }, [])
  const refreshTracks = useCallback(async () => {
    try {
      setTracks(await api.tracks())
    } catch {
      /* status banner covers this */
    }
  }, [])

  useEffect(() => {
    void refreshStatus(true)
    void refreshTracks()
    const t = window.setInterval(() => void refreshStatus(), 15000)
    return () => window.clearInterval(t)
  }, [refreshStatus, refreshTracks])

  // ---- channels for the loaded track
  const channels: Channel[] = useMemo(() => {
    if (!current) return []
    if (current.stems.length)
      return current.stems.map((s) => ({ id: s.id, name: s.name, color: s.color || '#d4af37', url: s.url }))
    return [{ id: `${current.id}:mix`, name: 'Full mix', color: '#e8c36a', url: current.url }]
  }, [current])

  const channelKey = channels.map((c) => c.id).join('|')
  useEffect(() => {
    if (!channels.length) return
    let cancelled = false
    history.reset((s) => {
      const mixer = { ...s.mixer }
      channels.forEach((c) => (mixer[c.id] ??= { ...DEFAULT_STEM }))
      return mixer === s.mixer ? s : { ...s, mixer, bpm: current?.bpm ?? s.bpm }
    })
    audio
      .load(channels.map((c) => ({ id: c.id, url: c.url })))
      .then(() => !cancelled && setBuffersVersion((v) => v + 1))
      .catch((e) => toast(`Audio load failed: ${e.message}`, 'error'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey])

  // ---- push mixer state into the audio graph (also runs on undo/redo)
  const { mixer, master } = history.state
  useEffect(() => {
    const anySolo = channels.some((c) => mixer[c.id]?.solo)
    channels.forEach((c) => audio.applyParams(c.id, mixer[c.id] ?? DEFAULT_STEM, anySolo))
  }, [mixer, channels, buffersVersion])
  useEffect(() => audio.setMasterGain(master.gain_db), [master.gain_db, buffersVersion])

  // ---- global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping()) return
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        if (isTyping()) return
        e.preventDefault()
        history.redo()
      } else if (e.code === 'Space' && !isTyping() && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault()
        if (audio.playing) audio.pause()
        else audio.play()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history])

  const loadTrack = useCallback((t: Track) => {
    audio.ensure()
    setCurrent(t)
    setTracks((xs) => (xs.some((x) => x.id === t.id) ? xs.map((x) => (x.id === t.id ? t : x)) : [t, ...xs]))
  }, [])

  const onGenerate = async (args: { prompt: string; duration_s: number; bpm: number | null; key: string }) => {
    setGenerating(true)
    setBusy('Generating...')
    try {
      const { job_id } = await api.generate(args)
      const res = await waitJob<{ track: Track; engine: string; reason?: string }>(job_id, setBusy)
      loadTrack(res.track)
      toast(res.engine === 'demo-synth' ? `Demo synth sketch ready (${res.reason})` : 'ACE-Step generation complete', 'ok')
    } catch (e) {
      toast(String((e as Error).message), 'error')
    } finally {
      setGenerating(false)
      setBusy('')
    }
  }

  const onSplit = async (mode: '4stem' | '2stem') => {
    if (!current) return
    setBusy(mode === '4stem' ? 'Splitting into stems...' : 'Separating vocals / instrumental...')
    try {
      const { job_id } = await api.split(current.id, mode)
      const res = await waitJob<{ track: Track; method: string; note: string }>(job_id, setBusy)
      loadTrack(res.track)
      toast(res.note, res.method === 'band-split' ? 'info' : 'ok')
    } catch (e) {
      toast(String((e as Error).message), 'error')
    } finally {
      setBusy('')
    }
  }

  const onRender = async () => {
    if (!current) return
    setBusy('Rendering mix on the server...')
    try {
      const stems = channels.map((c) => ({ stem_id: c.id, ...(mixer[c.id] ?? DEFAULT_STEM) }))
      const { job_id } = await api.mix({ track_id: current.id, stems, master_gain_db: master.gain_db, normalize: master.normalize })
      const res = await waitJob<{ track: Track }>(job_id, setBusy)
      setTracks((xs) => [res.track, ...xs])
      toast(`Mixdown rendered: ${res.track.title}`, 'ok')
    } catch (e) {
      toast(String((e as Error).message), 'error')
    } finally {
      setBusy('')
    }
  }

  const onExport = async (o: { formats: string[]; include_stems: boolean; normalize: boolean }) => {
    if (!current) return null
    try {
      const { job_id } = await api.export({ track_id: current.id, ...o })
      const res = await waitJob<{ files: Record<string, string> }>(job_id)
      toast('Export ready', 'ok')
      return res.files
    } catch (e) {
      toast(String((e as Error).message), 'error')
      return null
    }
  }

  return (
    <div className="app">
      <div className="bg-glow" />
      <TopBar status={status} history={history} onOpenSystem={() => setShowSystem(true)} mode={mode} onMode={setMode} />
      {apiDown && (
        <div className="banner">
          Studio API unreachable. Start it with <code>start_studio.bat</code> (Windows) or <code>python -m studio.server</code>.
        </div>
      )}
      {status?.mode === 'demo' && (
        <div className="banner subtle">
          <strong>Demo mode</strong> · No LLM or audio models are connected, so chat replies and tracks come from the built-in demo synthesizer. Nothing here is AI-generated yet.
          <button className="link" onClick={() => setShowSystem(true)}>What's missing?</button>
        </div>
      )}
      {mode === 'easy' ? (
        <main className="easy-wrap">
          {easySession !== undefined && (
            <EasyStudio
              toast={toast}
              initial={easySession}
              onSession={onEasySession}
              onTrack={(t) => setTracks((xs) => (xs.some((x) => x.id === t.id) ? xs : [t, ...xs]))}
              onOpenAdvanced={(t) => {
                if (t) loadTrack(t)
                setMode('advanced')
              }}
            />
          )}
        </main>
      ) : (
      <main className="grid">
        <div className="col-left">
          <Composer status={status} onTrack={(t) => loadTrack(t)} onGenerate={onGenerate} generating={generating} />
          <Library
            tracks={tracks}
            currentId={current?.id ?? null}
            onSelect={loadTrack}
            onDelete={async (t) => {
              await api.deleteTrack(t.id)
              if (current?.id === t.id) {
                audio.stop()
                setCurrent(null)
              }
              void refreshTracks()
            }}
            onUpload={async (f) => {
              setBusy(`Importing ${f.name}...`)
              try {
                const { track } = await api.upload(f)
                loadTrack(track)
                toast(`Imported ${f.name}`, 'ok')
              } catch (e) {
                toast(String((e as Error).message), 'error')
              } finally {
                setBusy('')
              }
            }}
          />
        </div>
        <div className="col-main">
          <Mixer
            track={current}
            channels={channels}
            buffersVersion={buffersVersion}
            history={history}
            busy={busy}
            onSplit={onSplit}
            onRender={onRender}
            onExport={() => setShowExport(true)}
          />
          <ProPanel track={current} tracks={tracks} toast={toast} onTrack={loadTrack} />
          <Deck history={history} />
        </div>
      </main>
      )}
      <footer className="foot">
        NoDAW Labs Studio front end · built on <a href="https://github.com/noah-chelednik/the-muser" target="_blank" rel="noreferrer">The Muser</a> (MIT)
      </footer>
      {showSystem && <SystemDrawer status={status} onClose={() => setShowSystem(false)} onRefresh={() => void refreshStatus(true)} toast={toast} />}
      {showExport && current && <ExportDialog track={current} onClose={() => setShowExport(false)} onExport={onExport} />}
      <Toasts toasts={toasts} />
    </div>
  )
}
