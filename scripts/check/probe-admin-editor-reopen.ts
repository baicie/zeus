/**
 * Deterministic probe for the "empty PATCH" report.
 *
 * Runs the path a user actually takes — open editor, type, Cancel, reopen,
 * Save — and records, at each step, what the DOM holds and what `dataset`
 * says. It exists to check one specific claim before anyone changes framework
 * semantics: that `seedValue`'s `dataset.seeded` guard survives a `Show`
 * remount because the framework reuses the same DOM node.
 *
 * Read-only: it starts a server, drives a browser, and writes nothing into the
 * repository. `pnpm check:admin` is the gate; this is the investigation.
 *
 *   pnpm exec tsx scripts/check/probe-admin-editor-reopen.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'

import { startAdminServer } from '../../examples/admin/server/index'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.join(root, 'examples/admin/dist')
const databaseFile = path.join(root, 'temp/probe-admin/editor.sqlite')
const ADMIN_PASSWORD = 'admin-browser-password-123'

await fs.mkdir(path.dirname(databaseFile), { recursive: true })
await fs.rm(databaseFile, { force: true })
for (const suffix of ['', '-wal', '-shm']) {
  await fs.rm(`${databaseFile}${suffix}`, { force: true })
}

const server = await startAdminServer({
  port: 0,
  databaseFile,
  staticDir: dist,
  adminPassword: ADMIN_PASSWORD,
  viewerPassword: ADMIN_PASSWORD,
  seedDemoUsers: true,
  bootstrap: true,
})
const origin = server.origin
const requests: string[] = []

const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const page = await browser.newPage({
  viewport: { width: 1365, height: 900 },
  locale: 'en-US',
})

// The CI failure only appears under machine-level slowness. Throttling the CPU
// inside this one page widens the same window without needing a slow runner.
const THROTTLE = Number(process.env.PROBE_CPU_THROTTLE ?? '1')
if (THROTTLE > 1) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  console.log(`  cpu throttle x${THROTTLE}`)
}
page.on('request', request => {
  if (request.url().includes('/api/users/')) {
    requests.push(
      `-> ${request.method()} ${request.url().replace(origin, '')} ${request.postData() ?? ''}`,
    )
  }
})

async function probe(label: string): Promise<void> {
  const state = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#user-email')
    if (!input) return { present: false }
    return {
      present: true,
      value: input.value,
      seeded: input.dataset.seeded ?? null,
      // `dataset`/expando properties are cleared by the framework's own
      // attribute patching, so identity is tracked through a WeakSet held on
      // the window: membership survives property writes.
      marked:
        (
          window as unknown as { __probeStart?: WeakSet<Element> }
        ).__probeStart?.has(input) ?? false,
      seen: (window as unknown as { __probeSeen: number }).__probeSeen,
    }
  })
  console.log(`  ${label}: ${JSON.stringify(state)}`)
}

try {
  await page.goto(`${origin}/admin/users`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill('ada@example.test')
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByTestId('users-page').waitFor()

  // The CI path is one SPA session: list -> row -> open -> edit -> save.
  // A `page.goto` to the detail route resets state and hides the bug, so the
  // probe reproduces the gate's navigation exactly.
  const grid = page.getByTestId('user-grid')
  const row = (key: string) =>
    grid.locator(`[data-slot="data-grid-row"][data-row-key="${key}"]`)
  await row('ada').click({ delay: 600 })
  await page.getByTestId('open-selected-user').click()
  await page.getByTestId('detail-id').waitFor()
  await page.getByTestId('edit-user').click()
  await page.getByTestId('user-dialog').waitFor()

  // Track the element object so a re-created node is distinguishable from a
  // reused one. A WeakSet survives the framework rewriting attributes.
  await page.evaluate(() => {
    const tracked = new WeakSet<Element>()
    const input = document.querySelector('#user-email')
    if (input) tracked.add(input)
    ;(window as unknown as { __probeStart?: WeakSet<Element> }).__probeStart =
      tracked
    // Count every node that ever exists at `#user-email`, so a rebuild is
    // visible even when the replacement is instantaneous.
    ;(window as unknown as { __probeSeen: number }).__probeSeen = 1
    const observer = new MutationObserver(() => {
      const now = document.querySelector('#user-email')
      if (!now) return
      const w = window as unknown as {
        __probeStart?: WeakSet<Element>
        __probeSeen: number
      }
      if (w.__probeStart && !w.__probeStart.has(now)) w.__probeSeen += 1
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    })
  })

  console.log('\n[1] after opening the editor')
  await probe('email field')

  // Typing one character at a time, checking identity after each, shows
  // whether the field survives the keystrokes or is re-created mid-edit.
  const input = page.locator('#user-email')
  await input.click()
  await input.press('End')
  for (const chunk of ['r', 'e', 'o']) {
    await input.press(chunk)
    await probe(`after keypress "${chunk}"`)
  }
  // Typing one character at a time is what a slow machine does; the value must
  // survive every keystroke, not just the last one.
  console.log(`  value after incremental typing: ${await input.inputValue()}`)
  await input.fill('reopen.probe@example.test')
  console.log('\n[2] after typing')
  await probe('email field')

  await page
    .getByTestId('user-form')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await page.getByTestId('user-dialog').waitFor({ state: 'detached' })
  console.log('\n[3] after Cancel — dialog detached')

  await page.getByTestId('edit-user').click()
  await page.getByTestId('user-dialog').waitFor()
  console.log('\n[4] after reopening the editor')
  await probe('email field')

  await page.locator('#user-email').fill('reopen.probe@example.test')
  console.log('\n[5] after retyping the new address')
  await probe('email field')

  await page
    .getByTestId('user-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await page.waitForTimeout(1500)

  console.log('\n[6] requests to /api/users/:')
  for (const entry of requests) console.log(`  ${entry}`)

  const detail = await page.getByTestId('user-detail').textContent()
  console.log(
    `\n[7] detail text: ${(detail ?? '').replace(/\s+/g, ' ').trim()}`,
  )
} finally {
  await browser.close()
  await server.close()
}
