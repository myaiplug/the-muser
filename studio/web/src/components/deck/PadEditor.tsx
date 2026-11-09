import { useRef, useState, useSyncExternalStore } from 'react'
import { BASE_PAD_NAMES } from '../../audio/instruments'
import { importUserSound, assignUserSound } from '../../audio/library'
import type { FxSlot } from '../../audio/padfx'
import { padBank } from '../../audio/samples'
import { ACCEPT } from '../../audio/upload'
import { FxRack } from './FxRack'
import { Slider } from './Slider'

type Props = {
  pad: number
  onAudition: () => void
  onBrowse: () => void
}

/** Sound and FX for one pad. Changes apply to this pad only and autosave with the kit. */
export function PadEditor({ pad, onAudition, onBrowse }: Props) {
  useSyncExternalStore(padBank.subscribe, padBank.version)
  const s = padBank.get(pad)
  const st = padBank.settings(pad)
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const src = s?.source?.kind === 'library' ? `Library, ${s.source.license === 'CC0-1.0' ? 'CC0' : s.source.license}` : s?.source?.kind === 'upload' ? 'Your upload' : s ? 'Sampler chop' : 'Built-in synth'

  const upload = async (f: File | undefined) => {
    if (!f) return
    setErr(''); setBusy(true)
    try {
      const { sound } = await importUserSound(f)
      assignUserSound(pad, sound)
      onAudition()
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  const fx = st.fx
  const setFx = (next: FxSlot[]) => padBank.setFx(pad, next)

  return (
    <div className="nd-editor" data-testid="pad-editor">
      <div className="nd-ed-head">
        <div className="nd-ed-title">
          <b>Pad {pad + 1}</b>
          <span data-testid="pad-sound-name">{s?.name ?? BASE_PAD_NAMES[pad]}</span>
          <em className={`nd-src ${s ? 'has' : ''}`}>{src}</em>
        </div>
        <button className="nd-btn pri" onClick={onAudition} data-testid="pad-audition">Play</button>
      </div>

      <div className="nd-ed-actions">
        <button className="nd-btn" onClick={onBrowse} data-testid="pad-change">Change sound</button>
        <button className="nd-btn" onClick={() => file.current?.click()} disabled={busy} data-testid="pad-upload-btn">{busy ? 'Checking file' : 'Upload sound'}</button>
        <input ref={file} type="file" accept={ACCEPT} hidden data-testid="pad-upload" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
        <button className="nd-btn ghost" onClick={() => padBank.set(pad, null)} disabled={!s} data-testid="pad-use-synth">Use synth hit</button>
        <button className="nd-btn ghost" onClick={() => padBank.resetPad(pad)} data-testid="pad-reset">Reset pad</button>
      </div>
      {err && <p className="nd-err" role="alert" data-testid="upload-error">{err}</p>}

      <div className="nd-ed-sound">
        <Slider label="Level" value={st.gain} min={0} max={2} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => padBank.setSettings(pad, { gain: v })} testId="pad-level" />
        <Slider label="Pitch" value={st.pitch} min={-24} max={24} step={1} format={(v) => `${v > 0 ? '+' : ''}${v} st`} onChange={(v) => padBank.setSettings(pad, { pitch: v })} testId="pad-pitch" />
      </div>

      <FxRack
        fx={fx}
        title="Pad FX"
        midiPrefix={`pad-${pad}`}
        emptyHint="No effects on this pad yet. Add a filter, EQ, compressor, saturation, bitcrush, delay, reverb, width or pan. They only change this pad."
        onStruct={(next) => setFx(next)}
        onParam={(next, phase) => { if (phase !== 'begin' && phase !== 'end') setFx(next) }}
      />
    </div>
  )
}
