import { useState } from 'react'
import { newSlot, SLOT_DEFS, SLOT_ORDER, type FxSlot, type SlotType } from '../../audio/padfx'
import { Knob } from '../Knob'

export type FxRackProps = {
  fx: FxSlot[]
  title: string
  emptyHint: string
  midiPrefix: string
  testPrefix?: string
  onStruct: (next: FxSlot[], label: string) => void
  onParam: (next: FxSlot[], phase: 'begin' | 'change' | 'end' | 'commit', label: string) => void
}

/** Shared insert-FX rack: add, bypass, reorder, remove, and rotary knobs for each slot. */
export function FxRack({ fx, title, emptyHint, midiPrefix, testPrefix = 'fx', onStruct, onParam }: FxRackProps) {
  const [adding, setAdding] = useState(false)
  const patch = (id: string, p: Partial<FxSlot>) => fx.map((x) => (x.id === id ? { ...x, ...p } : x))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= fx.length) return
    const next = fx.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    const name = SLOT_DEFS[fx[i].type].label
    onStruct(next, d < 0 ? `Move ${name} up` : `Move ${name} down`)
  }
  const add = (t: SlotType) => { onStruct([...fx, newSlot(t)], `Add ${SLOT_DEFS[t].label}`); setAdding(false) }

  return (
    <div className="nd-fx" data-testid={`${testPrefix}-rack`}>
      <div className="nd-fx-head">
        <b>{title}</b>
        <span>{fx.length ? `${fx.filter((x) => x.on).length} of ${fx.length} on` : 'Dry'}</span>
        <button className="nd-btn small" onClick={() => setAdding((v) => !v)} aria-expanded={adding} data-testid={`${testPrefix}-add`}>{adding ? 'Close' : 'Add effect'}</button>
      </div>
      {adding && (
        <div className="nd-fx-menu" role="menu">
          {SLOT_ORDER.map((t) => <button key={t} role="menuitem" className="nd-chip" onClick={() => add(t)} data-testid={`${testPrefix}-add-${t}`}>{SLOT_DEFS[t].label}</button>)}
        </div>
      )}
      {fx.length === 0 && !adding && <p className="nd-muted">{emptyHint}</p>}
      <ol className="nd-fx-list">
        {fx.map((x, i) => (
          <li key={x.id} className={`nd-slot ${x.on ? '' : 'off'}`} data-testid={`${testPrefix}-slot-${x.type}`}>
            <div className="nd-slot-head">
              <button className={`nd-led ${x.on ? 'on' : ''}`} aria-pressed={x.on} aria-label={`${SLOT_DEFS[x.type].label} on`} onClick={() => onStruct(patch(x.id, { on: !x.on }), `${SLOT_DEFS[x.type].label} ${x.on ? 'off' : 'on'}`)} data-testid={`${testPrefix}-toggle`} />
              <b>{SLOT_DEFS[x.type].label}</b>
              <span className="nd-slot-tools">
                <button className="nd-icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} data-testid={`${testPrefix}-up`}>▲</button>
                <button className="nd-icon" aria-label="Move down" disabled={i === fx.length - 1} onClick={() => move(i, 1)} data-testid={`${testPrefix}-down`}>▼</button>
                <button className="nd-icon" aria-label="Remove" onClick={() => onStruct(fx.filter((y) => y.id !== x.id), `Remove ${SLOT_DEFS[x.type].label}`)} data-testid={`${testPrefix}-remove`}>✕</button>
              </span>
            </div>
            <div className="nd-slot-knobs">
              {SLOT_DEFS[x.type].params.map((d) => {
                const label = `${SLOT_DEFS[x.type].label} ${d.label}`
                return (
                  <Knob
                    key={d.key}
                    midiId={`${midiPrefix}-${x.id}-${d.key}`}
                    label={d.label}
                    value={x.p[d.key] ?? d.def}
                    min={d.min}
                    max={d.max}
                    step={d.step}
                    defaultValue={d.def}
                    size={48}
                    bipolar={d.min < 0 && d.max > 0}
                    log={d.log}
                    format={d.fmt}
                    testId={`${testPrefix}-${x.type}-${d.key}`}
                    onBegin={() => onParam(fx, 'begin', label)}
                    onChange={(v) => onParam(patch(x.id, { p: { ...x.p, [d.key]: v } }), 'change', label)}
                    onEnd={() => onParam(fx, 'end', label)}
                    onCommit={(v) => onParam(patch(x.id, { p: { ...x.p, [d.key]: v } }), 'commit', label)}
                  />
                )
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
