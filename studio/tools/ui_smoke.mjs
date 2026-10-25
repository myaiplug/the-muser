// Optional: headless UI smoke test + screenshots.
// Usage: npm i -D playwright-core  (in any folder), start the studio with --demo, then:
//   CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" SHOTS=./screenshots node studio/tools/ui_smoke.mjs
// UI smoke test + screenshots for The Muser Studio (demo mode).
import { chromium } from 'playwright-core'
const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:8765'
const OUT = process.env.SHOTS || 'screenshots'
const log = (...a) => console.log('•', ...a)
const errors = []

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
// this script drives the Advanced layout; Easy mode has its own script (ui_smoke_v2.mjs)
await page.addInitScript(() => localStorage.setItem('muser.mode', 'advanced'))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.topbar')
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/01-studio-home.png` })
log('home loaded')

// prompt submit -> streamed demo reply + track
await page.fill('textarea[aria-label="Prompt"]', 'lo-fi hip hop beat in F minor with jazzy keys, 16 seconds')
await page.click('button.send')
await page.waitForSelector('.track-card', { timeout: 30000 })
await page.waitForSelector('.lane', { timeout: 20000 })
const botText = await page.locator('.msg.bot').last().innerText()
if (!/Demo mode|Rendered/.test(await page.locator('.chat').innerText())) throw new Error('no demo reply')
log('prompt handled; last bot msg:', botText.slice(0, 80))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/02-prompt-to-track.png` })

// split into stems
await page.getByRole('button', { name: /Split 4 stems/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.lane').length === 4, null, { timeout: 60000 })
const names = await page.locator('.lane-name').allInnerTexts()
log('stems:', names.join(', '))
if (names.join(',').toLowerCase() !== 'drums,bass,chords,lead') throw new Error('unexpected stems ' + names)

// play transport
await page.getByRole('button', { name: 'Play', exact: true }).click()
await page.waitForTimeout(1500)
const lcd = await page.locator('.lcd').first().innerText()
log('transport LCD after 1.5s:', lcd)
if (lcd === '00:00.00') throw new Error('transport did not advance')

// knob drag on drums Low EQ
const knob = page.locator('.lane').first().locator('[role=slider][aria-label="Low"]')
const before = await knob.getAttribute('aria-valuenow')
const box = await knob.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 8 })
await page.mouse.up()
const afterDrag = await knob.getAttribute('aria-valuenow')
log('knob drag Low:', before, '->', afterDrag)
if (Number(afterDrag) <= Number(before)) throw new Error('knob drag failed')

// wheel on Verb knob of bass
const verb = page.locator('.lane').nth(1).locator('[role=slider][aria-label="Verb"]')
const vb = await verb.boundingBox()
await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2)
for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100)
await page.waitForTimeout(500)
const verbVal = await verb.getAttribute('aria-valuenow')
log('wheel Verb ->', verbVal)
if (!(Number(verbVal) > 0)) throw new Error('wheel failed')

// mute chords
await page.locator('.lane').nth(2).locator('button.mute').click()
const muted = await page.locator('.lane').nth(2).evaluate((el) => el.classList.contains('is-silent'))
log('chords muted:', muted)

// undo x3 -> mute, verb, low should revert in order
const undo = page.getByRole('button', { name: 'Undo', exact: true })
await undo.click()
const unmuted = !(await page.locator('.lane').nth(2).evaluate((el) => el.classList.contains('is-silent')))
await undo.click()
const verbUndo = await verb.getAttribute('aria-valuenow')
await undo.click()
const lowUndo = await knob.getAttribute('aria-valuenow')
log('undo: unmuted', unmuted, 'verb', verbUndo, 'low', lowUndo)
if (!unmuted || Number(verbUndo) !== 0 || Number(lowUndo) !== Number(before)) throw new Error('undo failed')
// redo x3 via keyboard
await page.locator('body').click({ position: { x: 5, y: 990 } })
await page.keyboard.press('Control+Shift+Z')
await page.keyboard.press('Control+y')
await page.keyboard.press('Control+Shift+Z')
const lowRedo = await knob.getAttribute('aria-valuenow')
const reMuted = await page.locator('.lane').nth(2).evaluate((el) => el.classList.contains('is-silent'))
log('redo: low', lowRedo, 'muted again', reMuted)
if (Number(lowRedo) !== Number(afterDrag) || !reMuted) throw new Error('redo failed')
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/03-stem-mixer.png` })

// pads + sequencer
await page.locator('.pad').nth(0).dispatchEvent('pointerdown')
await page.keyboard.press('2')
const hit = await page.locator('.pad.hit').count()
log('pads lit after hit:', hit)
await page.getByRole('button', { name: /Play pattern/ }).click()
await page.waitForTimeout(900)
const now = await page.locator('.step.now').count()
log('sequencer playhead steps:', now)
if (!now) throw new Error('sequencer not running')
await page.locator('.deck').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${OUT}/04-pads-sequencer.png`, fullPage: true })
await page.getByRole('button', { name: /Stop/ }).first().click()

// keys
await page.getByRole('tab', { name: 'Keys' }).click()
await page.keyboard.down('a')
await page.keyboard.down('d')
await page.keyboard.down('g')
await page.waitForTimeout(150)
const held = await page.locator('.pkey.held').count()
log('piano keys held:', held)
if (held !== 3) throw new Error('keys failed')
await page.locator('.deck').screenshot({ path: `${OUT}/05-keys-synth.png` })
await page.keyboard.up('a'); await page.keyboard.up('d'); await page.keyboard.up('g')

// render mix on server (repo effects + mixer via ffmpeg)
await page.getByRole('button', { name: 'Render mix' }).click()
await page.waitForSelector('.toast.ok:has-text("Mixdown rendered")', { timeout: 60000 })
log('server mixdown rendered')

// export dialog
await page.getByRole('button', { name: 'Export', exact: true }).click()
await page.locator('.modal button.btn.gold').click()
await page.waitForSelector('.dl', { timeout: 60000 })
const dls = await page.locator('.dl').allInnerTexts()
log('export links:', dls.join(' | '))
await page.locator('.modal').screenshot({ path: `${OUT}/06-export.png` })
await page.keyboard.press('Escape')
await page.locator('.overlay').click({ position: { x: 5, y: 5 } })

// system drawer
await page.locator('button.leds').click()
await page.waitForSelector('.drawer')
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/07-system-status.png` })
await page.locator('.overlay').click({ position: { x: 5, y: 5 } })

// history popover
await page.locator('.hist-count').click()
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/08-history.png`, clip: { x: 300, y: 0, width: 1000, height: 400 } })

// full page
await page.screenshot({ path: `${OUT}/09-full-page.png`, fullPage: true })

// responsive: tablet + phone
for (const [name, w, h] of [['10-tablet', 900, 1200], ['11-mobile', 390, 844]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: name.includes('mobile'), hasTouch: true })
  await p.addInitScript(() => localStorage.setItem('muser.mode', 'advanced'))
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.locator('.lib-item').first().click()
  await p.waitForSelector('.lane')
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  await p.close()
}

await browser.close()
const real = errors.filter((e) => !/favicon/.test(e))
log('console errors:', real.length ? real : 'none')
if (real.length) process.exitCode = 1
