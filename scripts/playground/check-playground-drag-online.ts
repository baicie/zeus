/**
 * Verifies the split divider actually tracks the pointer in production.
 *
 * The earlier gate checked storage-write counts and "value increased", both of
 * which a broken clamp still satisfies. This asserts the thing a user sees:
 * dragging left moves the divider left, dragging right moves it right, and the
 * painted position stays close to the cursor.
 */
import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'https://playground.moonbyte.top:8443/'
const browser = await chromium.launch({
  headless: true,
  ...(url.includes('moonbyte') ? { channel: 'chromium' } : {}),
})
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()
await page.addInitScript(() => localStorage.clear())
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForFunction(
  () =>
    (
      window as unknown as {
        __zeusPlayground?: { getState(): { previewReady: boolean } }
      }
    ).__zeusPlayground?.getState().previewReady === true,
  null,
  { timeout: 90_000 },
)

const failures: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` :: ${detail}`}`)
  if (!ok) failures.push(name)
}

const splitX = () =>
  page.evaluate(() =>
    Math.round(document.querySelector('.pg-split')!.getBoundingClientRect().x),
  )

const box = await page.locator('.pg-split').boundingBox()
if (!box) throw new Error('split divider is not visible')
const startX = box.x + box.width / 2
const y = box.y + box.height / 2
const before = await splitX()
if (before !== Math.round(box.x)) {
  check('divider starts where box reports', false, `${before} vs ${box.x}`)
}

// Drag left, sampling how far the painted divider lags behind the cursor.
await page.mouse.move(startX, y)
await page.mouse.down()
let worstLag = 0
for (let i = 1; i <= 10; i += 1) {
  const target = startX - i * 12
  await page.mouse.move(target, y)
  await page.waitForTimeout(40)
  const actual = await splitX()
  worstLag = Math.max(worstLag, Math.abs(actual - target))
}
const afterLeft = await splitX()
await page.mouse.move(startX + 60, y, { steps: 8 })
await page.waitForTimeout(80)
const afterRight = await splitX()
await page.mouse.up()
await page.waitForTimeout(150)

check(
  'drag left moves the divider left',
  afterLeft < before - 60,
  `${before} -> ${afterLeft}`,
)
check(
  'drag right moves it back right',
  afterRight > afterLeft + 20,
  `${afterLeft} -> ${afterRight}`,
)
check(
  'divider tracks the cursor while dragging',
  worstLag <= 16,
  `worst lag ${worstLag}px`,
)

const stored = await page.evaluate(() => {
  const raw = localStorage.getItem('zeus-playground.settings.v2')
  return raw
    ? (JSON.parse(raw) as { splitPercent?: number }).splitPercent
    : undefined
})
check('split persisted on release', typeof stored === 'number', String(stored))

await browser.close()
console.log(
  failures.length
    ? `FAILURES: ${failures.join(', ')}`
    : 'all drag checks passed',
)
if (failures.length) process.exitCode = 1
