import { useSyncExternalStore } from 'react'
import { midi, type MidiTarget } from '../midi'

/** Touch-friendly alternative to context-menu MIDI learn. */
export function MidiProgrammer() {
  useSyncExternalStore((fn) => midi.subscribe(fn), () => midi.revision)
  const rows: { label: string; target: MidiTarget }[] = [
    ...Array.from({ length: 16 }, (_, index) => ({ label: `Pad ${index + 1}`, target: { kind: 'pad' as const, index } })),
    ...[...midi.knobs].map(([id, label]) => ({ label: `${label} (${id})`, target: { kind: 'knob' as const, id } })),
    { label: 'Octave −', target: { kind: 'octave', direction: -1 } },
    { label: 'Octave +', target: { kind: 'octave', direction: 1 } },
  ]
  return <details className="nd-programmer">
    <summary>MIDI Programmer — pads & knobs</summary>
    <p>Learn, then hit a note or turn a CC. Custom assignments override defaults. Switch views to program their knobs.</p>
    <p>MPK Mini banks A/B → pads 1–8. Hardware order: bottom 1–4, top 5–8. Knobs CC 70–77 or 1–8 follow the current view.</p>
    <label>MPK pad channel <select value={midi.padChannel} onChange={(e) => midi.setPadChannel(+e.target.value)}>
      <option value={-1}>Any (shared notes)</option>
      {Array.from({ length: 16 }, (_, n) => <option key={n} value={n}>Channel {n + 1}</option>)}
    </select></label>
    <p>Factory pads often use channel 10. On the Pads view, pad-bank notes still hit pads 1–8 on any channel. On the Keys view, only this channel is treated as pads so an octave-shifted keyboard stays keys. Choose Any if your pads share a channel with the keys.</p>
    <label>MPK first pad note <input type="number" min={0} max={112} value={midi.padBase} onChange={(e) => midi.setPadBase(+e.target.value)} /></label>
    <p>Use the first note of your alternate contiguous pad bank here. Default 36; next bank shares the same eight pads.</p>
    <p>MPK Octave buttons normally transpose the keyboard locally, not send MIDI. Other devices can learn Octave below.</p>
    {midi.isLearning() && <button className="nd-btn" onClick={() => midi.cancelLearn()}>Waiting for MIDI… Cancel</button>}
    <ul>{rows.map(({ label, target }) => {
      const mapping = midi.getMappings().find((m) => JSON.stringify(m.target) === JSON.stringify(target))
      const index = target.kind === 'knob' ? midi.defaultKnobs.indexOf(target.id) : -1
      return <li key={JSON.stringify(target)}>
        <span>{label}<small>{mapping ? `${mapping.type} ${mapping.number} · ch ${mapping.channel + 1}` : index >= 0 ? `Default knob ${index + 1} · CC ${70 + index} / ${1 + index}` : 'Default / unassigned'}</small></span>
        <button className="nd-btn small" disabled={!midi.supported} onClick={() => midi.startLearn(target)}>Learn {label.split(' (')[0]}</button>
        <button className="nd-btn small" disabled={!mapping} onClick={() => midi.clearTarget(target)}>Clear</button>
      </li>
    })}</ul>
  </details>
}
