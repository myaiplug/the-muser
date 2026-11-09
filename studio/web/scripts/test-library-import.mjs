import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'

async function library(existing = [], failSave = false) {
  let writes = 0
  const context = vm.createContext({ console, Float32Array, Date, Math })
  const samples = new vm.SyntheticModule(['dbTx', 'padBank'], function () {
    this.setExport('padBank', {})
    this.setExport('dbTx', async (_store, _mode, fn) => fn({
      getAll: () => existing,
      put: (sound) => { if (failSave) throw new Error('quota'); writes++; existing.push(sound) },
    }))
  }, { context })
  const upload = new vm.SyntheticModule(['validateAudioFile'], function () {
    this.setExport('validateAudioFile', async (f) => ({ name: f.name, buffer: { duration: 1, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => new Float32Array(8) } }))
  }, { context })
  const engine = new vm.SyntheticModule(['audio'], function () { this.setExport('audio', {}) }, { context })
  const wav = new vm.SyntheticModule(['planesToBuffer'], function () { this.setExport('planesToBuffer', () => {}) }, { context })
  const source = await readFile(new URL('../src/audio/library.ts', import.meta.url), 'utf8')
  const mod = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, {
    context, initializeImportMeta(meta) { meta.env = { BASE_URL: '/' } },
  })
  await mod.link((name) => ({ './engine': engine, './samples': samples, './upload': upload, './wav': wav })[name]); await mod.evaluate()
  return { ...mod.namespace, writes: () => writes }
}

test('kit imports retain validated audio planes in IndexedDB', async () => {
  const lib = await library()
  assert.equal(lib.MAX_USER_SOUNDS, 512)
  const { sound } = await lib.importUserSound({ name: '808 sub.wav' })
  assert.equal(sound.name, '808 sub.wav'); assert.equal(sound.planes.length, 1)
  assert.equal((await lib.listUserSounds()).length, 1); assert.equal(lib.writes(), 1)
})
test('sound count cap refuses new imports without silently deleting existing kits', async () => {
  const lib = await library(Array.from({ length: 512 }, (_, created) => ({ created, planes: [] })))
  await assert.rejects(lib.importUserSound({ name: 'new.wav' }), /full/)
  assert.equal(lib.writes(), 0); assert.equal((await lib.listUserSounds()).length, 512)
})
test('decoded byte cap and storage quota failures are visible rather than pretending success', async () => {
  const full = await library([{ created: 1, planes: [{ byteLength: 256 * 1024 * 1024 }] }])
  await assert.rejects(full.importUserSound({ name: 'new.wav' }), /full/)
  const quota = await library([], true)
  await assert.rejects(quota.importUserSound({ name: 'new.wav' }), /storage is full or unavailable/)
})
