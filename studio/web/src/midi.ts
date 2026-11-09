/**
 * Web MIDI for NoDAW Studio PRO.
 *
 * - Works without a learn step: notes that are not learned are sent out as `midi-note` events and the
 *   Deck routes them by the chosen layout (Auto: channel 10 or notes 36-51 to pads, everything else to
 *   keys; Pads: 36-51 to pads 1-16; Keys: every note to the keys).
 * - Learn: right-click (long-press) a pad, key or knob, then move the hardware control.
 *   Learned mappings win over the default layout and persist in localStorage.
 * - Web MIDI exists in Chrome, Edge and Opera on desktop and Android. Safari on iPhone and iPad has
 *   no Web MIDI at all, so phones use touch.
 */
export type MidiRouting = 'auto' | 'pads' | 'keys' | 'mpk'
export type MidiStatus = 'unsupported' | 'idle' | 'pending' | 'ready' | 'denied'

/** MPK banks A/B share eight destinations. Alternate banks can set their first note explicitly. */
export const isMpkInput = (name: string) => /mpk/i.test(name)
export function mpkPadIndex(note: number, firstNote = 36): number | null {
  return note >= firstNote && note < firstNote + 16 ? (note - firstNote) % 8 : null
}
export function knobIndex(cc: number): number | null {
  return cc >= 70 && cc <= 77 ? cc - 70 : cc >= 1 && cc <= 8 ? cc - 1 : null
}
export function routeNote(note: number, channel: number, routing: MidiRouting, view: 'pads' | 'keys' | 'other', inputName = '', firstNote = 36, padChannel = 9): { kind: 'pad'; index: number } | { kind: 'key'; note: number } {
  if (routing === 'mpk' || (routing === 'auto' && isMpkInput(inputName))) {
    const index = padChannel === -1 || channel === padChannel ? mpkPadIndex(note, firstNote) : null
    return index !== null ? { kind: 'pad', index } : { kind: 'key', note }
  }
  const padRange = note >= 36 && note <= 51
  const toPads = routing === 'pads' ? padRange : routing === 'keys' ? false : padRange && (channel === 9 || view !== 'keys')
  return toPads ? { kind: 'pad', index: note - 36 } : { kind: 'key', note }
}

export type MidiTarget =
  | { kind: 'pad'; index: number }
  | { kind: 'key'; note: number }
  | { kind: 'knob'; id: string }
  | { kind: 'octave'; direction: -1 | 1 }

export type MidiMapping = {
  type: 'note' | 'cc'
  channel: number
  number: number
  target: MidiTarget
}


class MidiLearn {
  private access: MIDIAccess | null = null
  private mappings: MidiMapping[] = []
  private learning: MidiTarget | null = null
  private listeners = new Set<(mappings: MidiMapping[]) => void>()
  private onLearn: ((target: MidiTarget, mapping: MidiMapping) => void) | null = null
  private storageKey = 'nodaw-midi-mappings-v1'
  status: MidiStatus = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'idle' : 'unsupported'
  routing: MidiRouting = (localStorage.getItem('nodaw-midi-routing') as MidiRouting) || 'auto'
  inputs: string[] = []
  lastNote = ''
  lastCC = ''
  revision = 0
  padBase = Number(localStorage.getItem('nodaw-midi-pad-base') ?? 36)
  padChannel = Number(localStorage.getItem('nodaw-midi-pad-channel') ?? 9)
  knobs = new Map<string, string>()
  defaultKnobs: string[] = []

  registerKnob(id: string, label: string) {
    this.knobs.set(id, label); this.emit()
    return () => { this.knobs.delete(id); this.emit() }
  }
  setDefaultKnobs(ids: string[]) {
    if (ids.join('|') === this.defaultKnobs.join('|')) return
    this.defaultKnobs = ids; this.emit()
  }
  setPadChannel(channel: number) {
    this.padChannel = channel
    try { localStorage.setItem('nodaw-midi-pad-channel', String(channel)) } catch { /* ignore */ }
    this.emit()
  }
  setPadBase(note: number) {
    this.padBase = Number.isFinite(note) ? Math.max(0, Math.min(112, Math.round(note))) : 36
    try { localStorage.setItem('nodaw-midi-pad-base', String(this.padBase)) } catch { /* ignore */ }
    this.emit()
  }
  clearTarget(target: MidiTarget) {
    this.mappings = this.mappings.filter((m) => JSON.stringify(m.target) !== JSON.stringify(target))
    this.save(); this.emit()
  }

  constructor() {
    this.load()
    // Only connect silently when permission was already granted; otherwise wait for the Connect button.
    try {
      void navigator.permissions?.query({ name: 'midi' as PermissionName }).then((p) => { if (p.state === 'granted') void this.connect() }).catch(() => undefined)
    } catch { /* no permissions API */ }
  }

  get supported() { return this.status !== 'unsupported' }

  setRouting(r: MidiRouting) {
    this.routing = r
    try { localStorage.setItem('nodaw-midi-routing', r) } catch { /* ignore */ }
    this.emit()
  }

  /** Ask for Web MIDI access (call from a click). */
  async connect(): Promise<MidiStatus> {
    if (!navigator.requestMIDIAccess) { this.status = 'unsupported'; this.emit(); return this.status }
    if (this.status === 'ready') return this.status
    this.status = 'pending'
    this.emit()
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
      const bind = () => {
        this.inputs = []
        this.access?.inputs.forEach((input) => {
          input.onmidimessage = (e) => this.handleMessage(e, input.name || '')
          this.inputs.push(input.name || 'MIDI input')
        })
        this.emit()
      }
      bind()
      this.access.onstatechange = bind
      this.status = 'ready'
    } catch {
      this.status = 'denied'
    }
    this.emit()
    return this.status
  }

  private handleMessage(e: MIDIMessageEvent, inputName = '') {
    if (!e.data || e.data.length < 2) return
    const [status, data1, data2 = 0] = e.data
    const type = status & 0xf0
    const channel = status & 0x0f
    const isNote = type === 0x90 || type === 0x80
    const isCC = type === 0xb0
    if (!isNote && !isCC) return

    if (isCC) this.lastCC = `ch ${channel + 1} CC ${data1}: ${data2}`
    else if (type === 0x90 && data2 > 0) this.lastNote = `ch ${channel + 1} note ${data1}`
    this.emit()

    if (this.learning && (!isNote || (type === 0x90 && data2 > 0))) {
      const mapping: MidiMapping = {
        type: isNote ? 'note' : 'cc',
        channel,
        number: data1,
        target: this.learning,
      }
      this.mappings = this.mappings.filter(
        (m) => !(m.type === mapping.type && m.channel === mapping.channel && m.number === mapping.number)
      )
      this.mappings = this.mappings.filter((m) => JSON.stringify(m.target) !== JSON.stringify(mapping.target))
      this.mappings.push(mapping)
      this.save()
      const target = this.learning
      this.learning = null
      this.onLearn?.(target, mapping)
      this.emit()
      return
    }

    // Dispatch to mapped targets
    const value = isNote ? (type === 0x90 ? data2 / 127 : 0) : data2 / 127
    let mapped = false
    for (const m of this.mappings) {
      if (m.type === (isNote ? 'note' : 'cc') && m.channel === channel && m.number === data1) {
        this.dispatch(m.target, value)
        mapped = true
      }
    }
    if (!mapped && isNote) {
      // default layout, no learn step needed; the Deck routes it (see routeNote)
      window.dispatchEvent(new CustomEvent('midi-note', { detail: { note: data1, value, channel, inputName } }))
    }
    if (!mapped && isCC) {
      const index = knobIndex(data1)
      const id = index === null ? undefined : this.defaultKnobs[index]
      // A learned destination is reserved for its custom source, too.
      if (id && !this.mappings.some((m) => m.target.kind === 'knob' && m.target.id === id)) this.dispatch({ kind: 'knob', id }, value)
    }
  }

  /** Feed a raw message (tests and virtual keyboards). */
  inject(bytes: number[]) {
    this.handleMessage({ data: new Uint8Array(bytes) } as unknown as MIDIMessageEvent)
  }

  private dispatch(target: MidiTarget, value: number) {
    // Emit custom event so components can react without tight coupling
    window.dispatchEvent(new CustomEvent('midi-control', { detail: { target, value } }))
  }

  startLearn(target: MidiTarget, onDone?: (target: MidiTarget, mapping: MidiMapping) => void) {
    this.learning = target
    this.onLearn = onDone || null
    this.emit()
  }

  cancelLearn() {
    this.learning = null
    this.onLearn = null
    this.emit()
  }

  getMappings() {
    return [...this.mappings]
  }

  clearAll() {
    this.mappings = []
    this.save()
    this.emit()
  }

  subscribe(fn: (mappings: MidiMapping[]) => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.revision++
    this.listeners.forEach((fn) => fn(this.mappings))
  }

  isLearning() { return this.learning !== null }

  private save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.mappings))
    } catch {
      /* ignore */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (raw) this.mappings = JSON.parse(raw)
    } catch {
      this.mappings = []
    }
  }
}

export const midi = new MidiLearn()
