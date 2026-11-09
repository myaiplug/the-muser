import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../../audio/engine'
import { PADS } from '../../audio/instruments'
import { keySampler } from '../../audio/keys'
import {
  assignLibrarySound, assignUserSound, deleteUserSound, filterSounds, importUserSound, LIB_BASE, LIB_TYPES,
  librarySoundBuffer, listUserSounds, loadCatalog, MAX_USER_SOUNDS, soundUrl, userSoundBuffer, type LibSound, type UserSound,
} from '../../audio/library'
import { padBank } from '../../audio/samples'
import { ACCEPT, extFamily } from '../../audio/upload'
import * as soundfont from '../../audio/soundfont'

type Props = {
  pad: number
  setPad: (i: number) => void
  onAssigned: (pad: number) => void
  onKeys: () => void
}

const TYPE_LABEL: Record<string, string> = { kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'Hat', 'open-hat': 'Open hat', perc: 'Perc', '808': '808', cymbal: 'Cymbal', tom: 'Tom' }
const titleCase = (g: string) => g.split('-').map((w) => (w.length <= 2 && w !== 'lo' ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ').replace('R B', 'R&B')

/** CC0 drum library and the user's uploads. Preview with an <audio> element, load onto any pad. */
export function SoundBrowser({ pad, setPad, onAssigned, onKeys }: Props) {
  const [all, setAll] = useState<LibSound[]>([])
  const [err, setErr] = useState('')
  const [src, setSrc] = useState<'library' | 'mine'>('library')
  const [type, setType] = useState('')
  const [genre, setGenre] = useState('')
  const [q, setQ] = useState('')
  const [mine, setMine] = useState<UserSound[]>([])
  const [playing, setPlaying] = useState('')
  const [loading, setLoading] = useState('')
  const [upErr, setUpErr] = useState('')
  const [upBusy, setUpBusy] = useState(false)
  const el = useRef<HTMLAudioElement | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState('')
  const [only808, setOnly808] = useState(false)
  const [myQuery, setMyQuery] = useState('')
  const visibleMine = mine.filter((u) => (!only808 || /808/i.test(u.name)) && u.name.toLowerCase().includes(myQuery.toLowerCase())).sort((a, b) => Number(/808/i.test(b.name)) - Number(/808/i.test(a.name)))

  useEffect(() => { loadCatalog().then(setAll).catch(() => setErr('The sound library could not load. Check your connection and reopen this tab.')) }, [])
  useEffect(() => { void listUserSounds().then(setMine) }, [])
  useEffect(() => () => { el.current?.pause() }, [])

  const genres = useMemo(() => [...new Set(all.flatMap((s) => s.genres))].sort(), [all])
  const list = useMemo(() => filterSounds(all, { type, genre, q }), [all, type, genre, q])

  const preview = (id: string, url: string) => {
    audio.unlock()
    if (!el.current) {
      const a = new Audio()
      a.setAttribute('playsinline', '')
      a.preload = 'auto'
      a.onended = () => setPlaying('')
      el.current = a
    }
    const a = el.current
    if (playing === id) { a.pause(); setPlaying(''); return }
    a.src = url
    a.currentTime = 0
    setPlaying(id)
    void a.play().catch(() => setPlaying((p) => (p === id ? '' : p)))
  }
  const previewUser = (u: UserSound) => {
    // user sounds live as decoded planes: audition through Web Audio
    audio.unlock()
    const ctx = audio.ensure()
    const s = ctx.createBufferSource()
    s.buffer = userSoundBuffer(u)
    s.connect(audio.instBus)
    s.start()
  }

  const load = async (s: LibSound) => {
    audio.unlock()
    setLoading(s.id)
    try {
      await assignLibrarySound(pad, s)
      onAssigned(pad)
    } catch { setErr(`Could not load ${s.title}.`) } finally { setLoading('') }
  }
  const toKeys = async (s: LibSound) => {
    audio.unlock()
    const buffer = await librarySoundBuffer(s)
    if (soundfont.hasFont()) soundfont.unloadFont()
    keySampler.library = buffer
    keySampler.libraryName = s.title
    onKeys()
  }
  const upload = async (files: File[]) => {
    audio.unlock()
    const candidates = files.filter((f) => extFamily(f.name) !== null)
      .sort((a, b) => Number(/808/i.test(b.name)) - Number(/808/i.test(a.name)))
    if (!candidates.length) { setUpErr('No supported audio files selected. Use Load soundfont for .sf2.'); return }
    setUpErr(''); setUpBusy(true); setSrc('mine')
    let imported = 0, failed = 0
    const errors: string[] = []
    const count = Math.max(0, Math.min(candidates.length, MAX_USER_SOUNDS - mine.length))
    try {
      for (const f of candidates.slice(0, count)) {
        setProgress(`Importing ${imported + failed + 1}/${count}: ${f.name}`)
        try { await importUserSound(f); imported++ }
        catch (e) { failed++; if (errors.length < 3) errors.push(`${f.name}: ${(e as Error).message}`) }
      }
      setMine(await listUserSounds())
      setProgress(`Imported ${imported}; failed ${failed}; skipped ${files.length - count}. Files stay in this browser.`)
      if (errors.length) setUpErr(errors.join(' · '))
    } finally { setUpBusy(false) }
  }

  return (
    <div className="nd-browser" data-testid="sound-browser">
      <div className="nd-br-top">
        <div className="nd-seg" role="tablist" aria-label="Sound source">
          <button role="tab" aria-selected={src === 'library'} className={src === 'library' ? 'on' : ''} onClick={() => setSrc('library')} data-testid="src-library">Library <sup>{all.length}</sup></button>
          <button role="tab" aria-selected={src === 'mine'} className={src === 'mine' ? 'on' : ''} onClick={() => setSrc('mine')} data-testid="src-mine">My uploads <sup>{mine.length}</sup></button>
        </div>
        <label className="nd-target">
          <span>Load into</span>
          <select value={pad} onChange={(e) => setPad(+e.target.value)} data-testid="target-pad">
            {PADS.map((p, i) => <option key={i} value={i}>Pad {i + 1}: {padBank.get(i)?.name ?? p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="nd-upload">
        <button className="nd-btn pri" onClick={() => file.current?.click()} disabled={upBusy} data-testid="mine-upload-btn">Import files</button>
        <button className="nd-btn" onClick={() => folder.current?.click()} disabled={upBusy}>Import folder</button>
        <input ref={file} type="file" accept={ACCEPT} multiple hidden data-testid="mine-upload" onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <input ref={folder} type="file" multiple hidden {...{ webkitdirectory: '', directory: '' }} onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <p className="nd-muted">Choose F:\sound kits or G:\sounds\Ganked_Dank_Sounds on your PC. Folder import works in supporting browsers; otherwise select multiple files. Audio is validated locally, never uploaded. Up to 512 sounds / 256 MB decoded audio; 30 seconds per sound. 808 names appear first.</p>
      </div>
      {progress && <p role="status">{progress}</p>}
      {upErr && <p className="nd-err" role="alert" data-testid="upload-error">{upErr}</p>}
      {src === 'library' ? (
        <>
          <div className="nd-chips" role="group" aria-label="Type">
            <button className={`nd-chip ${type === '' ? 'on' : ''}`} onClick={() => setType('')}>All</button>
            {LIB_TYPES.map((t) => <button key={t} className={`nd-chip ${type === t ? 'on' : ''}`} onClick={() => setType(type === t ? '' : t)} data-testid={`type-${t}`}>{TYPE_LABEL[t]}</button>)}
          </div>
          <div className="nd-br-filters">
            <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre" data-testid="genre">
              <option value="">Any genre</option>
              {genres.map((g) => <option key={g} value={g}>{titleCase(g)}</option>)}
            </select>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search kick, rimshot, dusty" aria-label="Search sounds" data-testid="lib-search" />
          </div>
          {err && <p className="nd-err" role="alert">{err}</p>}
          <ul className="nd-list" data-testid="lib-list">
            {list.slice(0, 160).map((s) => (
              <li key={s.id} className={`nd-row ${playing === s.id ? 'playing' : ''}`}>
                <button className="nd-icon play" aria-label={`Preview ${s.title}`} onClick={() => preview(s.id, soundUrl(s))} data-testid="lib-preview">{playing === s.id ? '■' : '▶'}</button>
                <span className="nd-row-t">
                  <b>{s.title}</b>
                  <i>{TYPE_LABEL[s.type] ?? s.type} · {(s.duration_ms / 1000).toFixed(2)}s · {s.license === 'CC0-1.0' ? 'CC0' : s.license}</i>
                </span>
                <button className="nd-btn small" onClick={() => void toKeys(s)} aria-label={`Play ${s.title} on the keys`}>Keys</button>
                <button className="nd-btn small pri" onClick={() => void load(s)} disabled={loading === s.id} data-testid="lib-load">{loading === s.id ? '...' : `Pad ${pad + 1}`}</button>
              </li>
            ))}
            {!list.length && all.length > 0 && <li className="nd-muted">No sounds match. Clear a filter.</li>}
          </ul>
          <p className="nd-foot">{list.length} of {all.length} sounds. All are CC0 (public domain): free in commercial beats and apps, no credit required. <a href={`${LIB_BASE}ATTRIBUTIONS.md`} target="_blank" rel="noreferrer">Sources and credits</a></p>
        </>
      ) : (
        <>
          <div className="nd-br-filters">
            <input type="search" aria-label="Search my sounds" placeholder="Search your kits…" value={myQuery} onChange={(e) => setMyQuery(e.target.value)} />
            <label><input type="checkbox" checked={only808} onChange={(e) => setOnly808(e.target.checked)} />808 names only</label>
          </div>
          <ul className="nd-list">
            {visibleMine.map((u) => (
              <li key={u.id} className="nd-row">
                <button className="nd-icon play" aria-label={`Preview ${u.name}`} onClick={() => previewUser(u)}>▶</button>
                <span className="nd-row-t"><b>{u.name}</b><i>{u.duration.toFixed(2)}s · your upload</i></span>
                <button className="nd-icon" aria-label={`Delete ${u.name}`} onClick={() => { void deleteUserSound(u.id); setMine((m) => m.filter((x) => x.id !== u.id)) }}>✕</button>
                <button className="nd-btn small" aria-label={`Play ${u.name} on keys`} onClick={() => {
                  audio.unlock()
                  if (soundfont.hasFont()) soundfont.unloadFont()
                  keySampler.library = userSoundBuffer(u); keySampler.libraryName = u.name; onKeys()
                }}>Keys</button>
                <button className="nd-btn small pri" onClick={() => { audio.unlock(); assignUserSound(pad, u); onAssigned(pad) }} data-testid="mine-load">Pad {pad + 1}</button>
              </li>
            ))}
            {!visibleMine.length && <li className="nd-muted">{mine.length ? 'No sounds match your filters.' : 'Nothing imported yet.'}</li>}
          </ul>
        </>
      )}
    </div>
  )
}
