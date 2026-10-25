// UI smoke test + screenshots for the all-in-one Studio (Easy and Advanced modes, demo mode).
// Usage: npm i -D playwright-core (in any folder), start the studio with --demo, then:
//   CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" SHOTS=./screenshots node studio/tools/ui_smoke_v2.mjs
import { chromium } from 'playwright-core'
const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:8765'
const OUT = process.env.SHOTS || 'screenshots'
const P = process.env.SHOT_PREFIX || '2-'
const log = (...a) => console.log('*', ...a)
const errors = []
const fail = (m) => { throw new Error(m) }

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true })
const page = await ctx.newPage()
await page.addInitScript(() => { if (!sessionStorage.getItem('v2init')) { localStorage.removeItem('muser.mode'); sessionStorage.setItem('v2init', '1') } })
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
const shot = async (name, o = {}) => {
  // sticky top bar renders mid-page in full-page captures unless we capture from the top
  if (o.fullPage) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150) }
  return page.screenshot({ path: `${OUT}/${P}${name}.png`, ...o })
}
const toastOk = (re, timeout = 90000) => page.waitForSelector(`.toast.ok:has-text("${re}")`, { timeout })

// ---- Easy is the default
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.easy .vibe')
if (!(await page.locator('.mode-toggle button.on').innerText()).match(/easy/i)) fail('Easy is not the default')
await page.waitForTimeout(500)
await shot('01-easy-home')
log('easy home, vibes:', await page.locator('.vibe').count())

await page.getByRole('button', { name: /More vibes/ }).click()
const allVibes = await page.locator('.vibe').count()
log('all vibes:', allVibes)
if (allVibes < 20) fail('More vibes did not expand')
await page.getByRole('button', { name: /Show favorites/ }).click()
await page.locator('.vibe', { hasText: 'Lo-Fi' }).first().click()
await page.fill('input[aria-label="Describe the vibe"]', 'rainy night, warm and dusty')
await shot('02-easy-vibe-picked')

// ---- Make It
await page.getByRole('button', { name: 'Make It' }).click()
await page.waitForSelector('.easy .player', { timeout: 120000 })
await page.waitForSelector('.ver', { timeout: 60000 })
await page.waitForFunction(() => !document.querySelector('.easy-busy'), null, { timeout: 120000 })
log('made a track; versions:', await page.locator('.ver').count())
await page.locator('.easy-step').nth(1).scrollIntoViewIfNeeded()
await page.waitForTimeout(600)
await shot('03-easy-made-track', { fullPage: true })

// ---- slider re-render + undo
const before = await page.locator('.ver').count()
const energy = page.locator('input[aria-label="Energy"]')
await energy.focus()
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
await page.waitForFunction((n) => document.querySelectorAll('.ver').length > n, before, { timeout: 90000 })
await page.waitForFunction(() => !document.querySelector('.easy-busy'), null, { timeout: 90000 })
log('slider re-render versions:', await page.locator('.ver').count())
await page.getByRole('button', { name: 'Undo step' }).click()
const onIdx = await page.locator('.ver.on').innerText()
log('after undo, current version:', onIdx)

// ---- one-click tools
await page.getByRole('button', { name: 'Clean up noise' }).click()
await page.waitForFunction(() => !document.querySelector('.easy-busy'), null, { timeout: 120000 })
await page.getByRole('button', { name: 'Turn into MIDI' }).click()
await page.waitForFunction(() => !document.querySelector('.easy-busy'), null, { timeout: 120000 })
log('tools ran; versions:', await page.locator('.ver').count())

// ---- Finish for Spotify
await page.locator('.finish-card', { hasText: 'Spotify' }).click()
await page.waitForSelector('.meter-read .badge:has-text("Measured")', { timeout: 120000 })
const meas = await page.locator('.meter-read .badge').innerText()
log('finish:', meas)
const lufs = Number(meas.match(/(-?\d+\.\d) LUFS/)[1])
if (Math.abs(lufs + 14) > 1) fail('Spotify finish off target: ' + meas)
await page.getByRole('button', { name: 'Export WAV + MP3' }).click()
await page.waitForSelector('.easy .dl:has-text("WAV")', { timeout: 90000 })
log('exports:', (await page.locator('.easy .dl').allInnerTexts()).join(' | '))
await page.locator('.easy-step').nth(2).scrollIntoViewIfNeeded()
await shot('04-easy-finish-export')
await shot('05-easy-full', { fullPage: true })

// ---- Advanced mode with the made track
await page.getByRole('button', { name: 'Switch to Advanced' }).click()
await page.waitForSelector('.panel.pro')
if ((await page.evaluate(() => localStorage.getItem('muser.mode'))) !== 'advanced') fail('mode not remembered')
// split so the chain editor has stems
const splitBtn = page.getByRole('button', { name: /Split 4 stems/ })
await splitBtn.click()
await page.waitForTimeout(300)
await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /Split 4 stems/.test(b.textContent) && !b.disabled), null, { timeout: 90000 })
log('split done; lanes:', (await page.locator('.lane-name').allInnerTexts()).join(', '))
await page.waitForFunction(() => document.querySelectorAll('.pro-stem').length >= 5, null, { timeout: 30000 })
// add a compressor on the first stem and tweak it
await page.locator('.pro-stem').first().click()
await page.selectOption('select[aria-label="Plugin to add"]', 'compressor')
await page.locator('.chain-add button', { hasText: 'Add' }).click()
await page.waitForSelector('.fx')
log('fx params exposed:', await page.locator('.fx-param').count())
await page.locator('.panel.pro').scrollIntoViewIfNeeded()
await page.locator('.panel.pro').screenshot({ path: `${OUT}/${P}06-advanced-chain-editor.png` })
await page.getByRole('button', { name: 'Render pro mix' }).click()
await toastOk('Rendered')
log('advanced render ok')
await shot('07-advanced-full', { fullPage: true })

// ---- presets
await page.locator('.panel.pro .tabs button', { hasText: 'Presets' }).click()
await page.waitForSelector('.preset-row')
await page.fill('input[aria-label="Search presets"]', 'vocal')
await page.waitForTimeout(500)
log('preset search "vocal":', await page.locator('.preset-row').count())
await page.fill('input[aria-label="Search presets"]', '')
await page.waitForTimeout(400)
await page.locator('.preset-row .star').first().click()
await page.locator('.preset-row button', { hasText: 'Preview' }).first().click()
await page.waitForSelector('.preview-bar audio', { timeout: 60000 })
await page.locator('.panel.pro').screenshot({ path: `${OUT}/${P}08-advanced-presets.png` })
log('preset preview ok; total presets label:', await page.locator('.preset-cats button').first().innerText())

// ---- generation params, separation, mastering, A/B
for (const [tab, n] of [['Generate', '09-advanced-generate'], ['Separate', '10-advanced-separate'], ['Master', '11-advanced-master'], ['A/B', '12-advanced-ab']]) {
  await page.locator('.panel.pro .tabs button', { hasText: tab }).click()
  await page.waitForTimeout(500)
  await page.locator('.panel.pro').screenshot({ path: `${OUT}/${P}${n}.png` })
}
await page.locator('.panel.pro .tabs button', { hasText: 'Master' }).click()
await page.locator('.panel.pro select').first().selectOption('club')
await page.locator('.panel.pro button.btn.gold', { hasText: 'Master' }).click()
await page.waitForSelector('.report', { timeout: 90000 })
log('advanced master report:', (await page.locator('.report').innerText()).replace(/\s+/g, ' ').slice(0, 160))

// ---- engines drawer
await page.locator('button.leds').click()
await page.waitForSelector('.eng-row', { timeout: 30000 })
await page.waitForTimeout(400)
await shot('13-engines-drawer')
log('engines listed:', await page.locator('.eng-row').count())
await page.getByRole('button', { name: /Show heavy GPU models/ }).click()
await page.waitForTimeout(300)
log('engines incl heavy:', await page.locator('.eng-row').count())
await page.locator('.drawer').screenshot({ path: `${OUT}/${P}14-engines-all.png` })
const fit = page.locator('.fit-card')
if (await fit.count()) {
  await fit.first().scrollIntoViewIfNeeded()
  await fit.first().screenshot({ path: `${OUT}/${P}16-engines-8gb-fit.png` })
  log('fit list:', (await fit.first().innerText()).replace(/\s+/g, ' ').slice(0, 400))
}
const heavy = page.locator('.eng-row', { hasText: 'YuE' })
if (await heavy.count()) {
  await heavy.first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.locator('.drawer').screenshot({ path: `${OUT}/${P}17-engines-not-recommended.png` })
  log('yue row:', (await heavy.first().innerText()).replace(/\s+/g, ' ').slice(0, 240))
}
await page.locator('.overlay').click({ position: { x: 5, y: 5 } })

// ---- mobile Easy
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await m.addInitScript(() => localStorage.setItem('muser.mode', 'easy'))
await m.goto(BASE, { waitUntil: 'networkidle' })
await m.waitForSelector('.easy .vibe')
await m.waitForTimeout(800)
await m.screenshot({ path: `${OUT}/${P}15-easy-mobile.png`, fullPage: true })
await m.close()

await browser.close()
const real = errors.filter((e) => !/favicon/.test(e))
log('console errors:', real.length ? real : 'none')
if (real.length) process.exitCode = 1
