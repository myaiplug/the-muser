import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'

async function setup() {
  const events = [], store = new Map()
  const context = vm.createContext({
    navigator: {}, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    window: { dispatchEvent: (event) => events.push(event) },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail } },
  })
  const source = await readFile(new URL('../src/midi.ts', import.meta.url), 'utf8')
  const mod = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { context })
  await mod.link(() => {}); await mod.evaluate()
  return { ...mod.namespace, events, store }
}
const plain = (value) => JSON.parse(JSON.stringify(value))

test('generic routing retains 16 pads, keys override and auto channel/view behavior', async () => {
  const { routeNote } = await setup()
  for (let note = 36; note < 52; note++) assert.deepEqual(plain(routeNote(note, 0, 'pads', 'keys')), { kind: 'pad', index: note - 36 })
  assert.equal(routeNote(36, 0, 'auto', 'keys').kind, 'key')
  assert.equal(routeNote(36, 9, 'auto', 'keys').kind, 'pad')
  assert.equal(routeNote(51, 9, 'keys', 'pads').kind, 'key')
  assert.equal(routeNote(52, 9, 'pads', 'pads').kind, 'key')
})
test('MPK banks A/B go to first eight pads in hardware order, independent of view', async () => {
  const { routeNote, isMpkInput } = await setup()
  assert.ok(isMpkInput('Akai MPK mini mk3'))
  for (let note = 36; note < 52; note++) {
    assert.deepEqual(plain(routeNote(note, 9, 'auto', 'keys', 'MPK mini')), { kind: 'pad', index: (note - 36) % 8 })
    assert.deepEqual(plain(routeNote(note, 9, 'mpk', 'keys')), { kind: 'pad', index: (note - 36) % 8 })
  }
  assert.equal(routeNote(60, 0, 'auto', 'pads', 'MPK mini').kind, 'key')
  assert.equal(routeNote(36, 0, 'auto', 'keys', 'MPK mini').kind, 'key') // octave-transposed keyboard
  assert.equal(routeNote(36, 0, 'mpk', 'keys', '', 36, -1).index, 0) // customized shared channel
  for (let note = 60; note < 76; note++) assert.equal(routeNote(note, 9, 'mpk', 'keys', '', 60).index, (note - 60) % 8)
})
test('both eight-knob factory presets dispatch, unknown CC remains visible', async () => {
  const { midi, knobIndex, events } = await setup()
  midi.defaultKnobs = Array.from({ length: 8 }, (_, n) => `knob-${n}`)
  for (let n = 0; n < 8; n++) {
    assert.equal(knobIndex(70 + n), n); assert.equal(knobIndex(1 + n), n)
    midi.inject([0xb0, 70 + n, 64]); assert.equal(events.at(-1).detail.target.id, `knob-${n}`)
    midi.inject([0xb0, 1 + n, 127]); assert.equal(events.at(-1).detail.value, 1)
  }
  const count = events.length
  midi.inject([0xb3, 99, 45]); assert.equal(events.length, count); assert.equal(midi.lastCC, 'ch 4 CC 99: 45')
})
test('learn any note/CC to pad/knob, persist, replace and clear; custom wins defaults', async () => {
  const { midi, events, store } = await setup()
  midi.defaultKnobs = ['cutoff']
  midi.startLearn({ kind: 'pad', index: 7 }); midi.inject([0xb2, 70, 127])
  midi.inject([0xb2, 70, 64]); assert.equal(events.at(-1).detail.target.index, 7)
  midi.startLearn({ kind: 'knob', id: 'cutoff' }); midi.inject([0x90, 80, 100])
  const count = events.length
  midi.inject([0xb0, 70, 100]); assert.equal(events.length, count) // learned destination is reserved
  midi.inject([0x90, 80, 64]); assert.equal(events.at(-1).detail.target.id, 'cutoff')
  assert.equal(JSON.parse(store.get('nodaw-midi-mappings-v1')).length, 2)
  midi.startLearn({ kind: 'knob', id: 'cutoff' }); midi.inject([0xb0, 22, 50])
  assert.equal(midi.getMappings().length, 2)
  midi.clearTarget({ kind: 'knob', id: 'cutoff' }); assert.equal(midi.getMappings().length, 1)
  midi.cancelLearn(); assert.equal(midi.isLearning(), false)
})
test('note-off cannot complete learn; octave buttons can learn an actual emitted CC', async () => {
  const { midi, events } = await setup()
  midi.startLearn({ kind: 'octave', direction: -1 })
  midi.inject([0x80, 60, 0]); assert.ok(midi.isLearning())
  midi.inject([0xb0, 100, 127]); assert.equal(midi.isLearning(), false)
  midi.inject([0xb0, 100, 127]); assert.equal(events.at(-1).detail.target.direction, -1)
})
