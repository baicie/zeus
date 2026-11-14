import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import path from 'node:path'

import {
  type Browser,
  type Page,
  chromium,
  expect,
  firefox,
  webkit,
} from '@playwright/test'
import { createServer } from 'vite'

import { SESSION_COOKIE } from '../../examples/admin/server/auth'
import { startAdminServer } from '../../examples/admin/server/index'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.join(root, 'examples/admin/dist')
const output = path.join(root, 'temp/admin/report.json')
const selectedBrowsers = Object.entries({ chromium, firefox, webkit }).filter(
  ([name]) =>
    !process.env.ADMIN_BROWSERS ||
    process.env.ADMIN_BROWSERS.split(',').includes(name),
)
const results: Array<{
  browser: string
  status: string
  error?: string
  pageErrors?: string[]
  failedResponses?: string[]
  bodyText?: string
  gridHtml?: string
  /** User-resource traffic, kept because the save race only shows on CI. */
  userRequests?: string[]
  devtools?: 'passed' | 'failed'
}> = []
const sessions = new Map<string, { cookie: string }>()
const ADMIN_PASSWORD = 'admin-browser-password-123'
const VIEWER_PASSWORD = 'viewer-browser-password-123'

await fs.mkdir(path.dirname(output), { recursive: true })
await fs.rm(output, { force: true })
const databaseFile = path.join(root, 'temp/admin/browser.sqlite')
await fs.rm(databaseFile, { force: true })
for (const name of selectedBrowsers.map(([name]) => name)) {
  for (const suffix of ['', '-wal', '-shm']) {
    await fs.rm(`${databaseFile}.${name}${suffix}`, { force: true })
  }
}
/*
 * Before anything builds or launches: prove the dialog Admin installs is the
 * build this repository vendored. The browser assertions below are only
 * meaningful on that build, and a re-install can quietly swap it back.
 */
execFileSync('pnpm', ['check:vendored-dialog'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
execFileSync('pnpm', ['-F', '@zeus-js/example-admin', 'check'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
execFileSync('pnpm', ['-F', '@zeus-js/example-admin', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

const browserNames = selectedBrowsers.map(([name]) => name)
const servers = new Map<string, Awaited<ReturnType<typeof startAdminServer>>>()
for (const name of browserNames) {
  servers.set(
    name,
    await startAdminServer({
      port: 0,
      databaseFile: `${databaseFile}.${name}`,
      staticDir: dist,
      adminPassword: ADMIN_PASSWORD,
      viewerPassword: VIEWER_PASSWORD,
      seedDemoUsers: true,
      bootstrap: true,
    }),
  )
}
const origins = new Map(
  [...servers].map(([name, server]) => [name, server.origin]),
)

for (const [name, engine] of selectedBrowsers) {
  const origin = origins.get(name)!
  let browser: Browser | undefined
  let page: Page | undefined
  const errors: string[] = []
  const failedResponses: string[] = []
  const userRequests: string[] = []
  try {
    browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' ? { channel: 'chromium' } : {}),
    })
    // The gate asserts English copy, so the page must ask for English. Without
    // this the console follows `navigator.languages`, and a machine whose
    // browser language is Chinese renders 登录 where the gate expects
    // "Sign in" — the gate would fail on the developer's laptop while passing
    // on an English CI runner, which is the worst kind of difference.
    page = await browser.newPage({
      viewport: { width: 1365, height: 900 },
      locale: 'en-US',
    })
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => {
      if (response.status() >= 400)
        failedResponses.push(`${response.status()} ${response.url()}`)
    })

    /*
     * Records every request and response that touches `/api/users/`.
     *
     * A save that reports "Saved" while the detail still shows the old email
     * has exactly two possible explanations — the PATCH never landed, or it
     * landed and something wrote the old value back — and the difference is
     * invisible in a DOM snapshot. The gate fails on CI's timing and not on a
     * laptop's, so a failure has to carry its own evidence; guessing at it from
     * here costs another ten-minute round trip.
     */
    page.on('request', request => {
      const url = request.url()
      if (!url.includes('/api/users/')) return
      userRequests.push(
        `-> ${request.method()} ${url.replace(origin, '')} ${request.postData() ?? ''}`,
      )
    })
    page.on('response', async response => {
      const url = response.url()
      if (!url.includes('/api/users/')) return
      let body = ''
      try {
        body = (await response.text()).replace(/\s+/g, ' ').slice(0, 160)
      } catch {
        body = '<unreadable>'
      }
      userRequests.push(
        `<- ${response.status()} ${response.request().method()} ${url.replace(origin, '')} ${body}`,
      )
    })

    await page.goto(`${origin}/admin/users`)
    await page.getByLabel('Email').fill('ada@example.test')
    await page.getByLabel('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByTestId('login-card')).toHaveCount(0)
    await expect(page.getByTestId('users-page')).toBeVisible()
    await expect(page.getByTestId('admin-layout')).toBeVisible()
    // Wait for the browser to expose the HttpOnly session cookie. `cookies()`
    // without a URL filter is intentional: WebKit on Linux can fail to match a
    // host-only cookie through the URL filter even though the cookie is
    // present and authenticated.
    await expect
      .poll(
        async () =>
          (await page!.context().cookies()).some(
            cookie => cookie.name === SESSION_COOKIE,
          ),
        { message: `${name} login session cookie`, timeout: 5_000 },
      )
      .toBe(true)
    const loginCookies = await page.context().cookies()
    const loginSession = loginCookies.find(
      cookie => cookie.name === SESSION_COOKIE,
    )
    expect(
      loginSession,
      `${name} login session cookie must be readable`,
    ).toBeDefined()
    sessions.set(name, {
      cookie: `${loginSession!.name}=${loginSession!.value}`,
    })
    const grid = page.getByTestId('user-grid')
    const row = (key: string) =>
      grid.locator(`[data-slot="data-grid-row"][data-row-key="${key}"]`)
    await expect(row('ada')).toBeVisible()
    const zoomEvidence = await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
      const layout = document.querySelector<HTMLElement>(
        '[data-testid="admin-layout"]',
      )
      const search = document.querySelector<HTMLElement>('#user-search input')
      const rect = search?.getBoundingClientRect()
      return {
        noDocumentOverflow:
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
        layoutVisible: Boolean(layout && layout.getBoundingClientRect().width),
        searchVisible: Boolean(
          rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right <= document.documentElement.clientWidth + 1,
        ),
      }
    })
    expect(zoomEvidence).toEqual({
      noDocumentOverflow: true,
      layoutVisible: true,
      searchVisible: true,
    })
    await page.evaluate(() => {
      document.documentElement.style.zoom = ''
    })
    await page.getByTestId('admin-layout').evaluate(element => {
      element.setAttribute('data-smoke', 'persistent-layout')
    })
    await page.screenshot({
      path: path.join(root, `temp/admin/admin-${name}.png`),
      fullPage: true,
    })
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).adminSmokeDocument =
        'same-document'
    })

    await page.getByTestId('page-next').click()
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 2 of 3')
    await expect(row('margaret')).toBeVisible()
    await row('margaret').click()
    await expect(row('margaret')).toHaveAttribute('aria-selected', 'true')
    const searchInput = page.locator('#user-search input')
    // The published data-grid beta.33 schedules a requestAnimationFrame
    // active-cell focus restore. Drain already queued frames before Playwright
    // fill selects the input and inserts text; otherwise WebKit can deliver
    // insertText to the grid cell that regained focus. The data-grid source
    // fix is tracked separately; this drain is deterministic, not a sleep.
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await searchInput.fill('Radia')
    await expect(searchInput).toHaveValue('Radia')
    await expect(row('radia')).toBeVisible()
    await expect(row('margaret')).toHaveCount(0)
    await expect(row('guido')).toHaveCount(0)
    await expect(row('ada')).toHaveCount(0)
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 1 of 1')
    await page.locator('#user-search input').fill('')
    await page.getByTestId('user-status').selectOption('suspended')
    await expect(row('guido')).toBeVisible()
    await expect(row('ada')).toHaveCount(0)
    await page.getByTestId('user-status').selectOption('all')
    await expect(row('ada')).toBeVisible()
    await row('ada').click()
    await expect(page.getByTestId('selection-status')).toContainText(
      'Ada Lovelace',
    )
    // A fresh query becomes stale after 500ms without changing its rows.
    // Holding the pointer across that notification must keep the same DOM
    // row so WebKit can dispatch the click to the original target.
    await page.getByTestId('user-status').selectOption('active')
    await expect(row('ada')).toBeVisible()
    await row('ada').evaluate(element => {
      element.setAttribute('data-stale-check', 'same-row')
    })
    await row('ada').click({ delay: 600 })
    await expect(row('ada')).toHaveAttribute('data-stale-check', 'same-row')
    await expect(row('ada')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('selection-status')).toContainText(
      'Ada Lovelace',
    )
    await page.getByTestId('open-selected-user').click()
    await expect(page).toHaveURL(`${origin}/admin/users/ada`)
    await expect(page.getByTestId('detail-id')).toHaveText('ada')
    await expect(page.getByTestId('user-detail')).toContainText(
      'ada@example.test',
    )
    await page.getByTestId('edit-user').click()
    await expect(page.getByTestId('user-dialog')).toBeVisible()
    /*
     * Typing must not replace the field.
     *
     * The form seeds each input from a `ref` that reads `draft()`. A `ref`
     * callback is a mount hook, so reading a signal there must not make the
     * enclosing `<Show>` region depend on it. When it did, every keystroke
     * rebuilt the dialog: the new input carried no `dataset` marker, was
     * reseeded from the draft the render opened with, and the user's text was
     * gone — the submit then found nothing changed and sent `PATCH {}`.
     *
     * Count node replacements directly, so the check names the mechanism
     * instead of only noticing the symptom on whichever engine loses the race.
     */
    await page.getByTestId('user-form').evaluate(form => {
      const input = form.querySelector('#user-email')!
      ;(window as unknown as Record<string, number>).adminEmailRebuilds = 0
      new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node === input) continue
            if ((node as Element).id === 'user-email') {
              ;(window as unknown as Record<string, number>)
                .adminEmailRebuilds++ as unknown as number
            }
          }
        }
      }).observe(form, { childList: true, subtree: true })
    })
    // Type rather than fill: `fill` dispatches one input event, which a single
    // render can absorb. Real typing is one input event per character, and the
    // rebuild race needs more than one.
    await page.getByTestId('user-form').locator('#user-email').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('ada.updated@example.test', { delay: 20 })
    await expect(
      page.getByTestId('user-form').locator('#user-email'),
    ).toHaveValue('ada.updated@example.test')
    expect(
      await page.evaluate(
        () =>
          (window as unknown as Record<string, number>).adminEmailRebuilds ?? 0,
      ),
      'typing must not rebuild the email field',
    ).toBe(0)
    await page
      .getByTestId('user-form')
      .getByRole('button', { name: 'Save', exact: true })
      .click()
    await expect(page.getByTestId('save-status')).toHaveText('Saved')
    await expect(page.getByTestId('user-dialog')).toHaveCount(0)
    /*
     * The saved email must reach the detail view. On CI this has failed twice
     * in a row on chromium only, always with "Saved" already on screen and the
     * old address still rendered, and never on a local machine in 40 attempts
     * including an 8x CPU throttle. Rather than sleep and hope, attach what the
     * network actually did at the moment of failure: whether the PATCH landed
     * and what it returned separates "the server did not save" from "the client
     * rendered a stale value", which are different bugs.
     */
    try {
      await expect(page.getByTestId('user-detail')).toContainText(
        'ada.updated@example.test',
        { timeout: 5_000 },
      )
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n\nuser requests:\n${userRequests.join('\n')}`,
      )
    }
    await expect(page.getByTestId('admin-layout')).toHaveAttribute(
      'data-smoke',
      'persistent-layout',
    )
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).adminSmokeDocument,
      ),
    ).toBe('same-document')

    // Router internals live in a collapsed panel; open it like a user would.
    await page.getByTestId('diagnostics-toggle').click()
    await page.getByTestId('history-back').click()
    await expect(page).toHaveURL(`${origin}/admin/users`)
    await expect(page.getByTestId('users-page')).toBeVisible()
    await expect(page.getByTestId('user-grid')).toBeVisible()
    await page.getByTestId('preload-ada').click()
    await expect(page.getByTestId('preload-status')).toHaveText('ready')
    await expect(page).toHaveURL(`${origin}/admin/users`)
    await page.getByTestId('history-forward').click()
    await expect(page.getByTestId('detail-id')).toHaveText('ada')

    await page.goto(`${origin}/admin/users/grace`)
    await expect(page.getByTestId('detail-id')).toHaveText('grace')
    await expect(page.getByTestId('user-detail')).toContainText(
      'grace@example.test',
    )
    await page.reload()
    await expect(page.getByTestId('detail-id')).toHaveText('grace')

    for (const [route, status] of [['/admin/users/missing', '404']]) {
      await page.goto(`${origin}${route}`)
      await expect(page.getByTestId('route-error')).toBeVisible()
      await expect(page.getByTestId('error-status')).toHaveText(status)
    }
    await page.goto(`${origin}/admin/reports`)
    await expect(page.getByTestId('reports-page')).toBeVisible()
    await expect(page.getByTestId('reports-user-count')).toHaveText('8')
    await expect(page.getByTestId('reports-team-count')).toHaveText('5')
    await page.goto(`${origin}/admin/audit`)
    await expect(page.getByTestId('audit-page')).toBeVisible()
    await expect(page.getByTestId('audit-table')).toContainText('login')
    /*
     * Component gallery. The point is not that elements exist: every example
     * has to react. Dialogs open and confirm, validation rejects a bad email,
     * tabs and accordions switch, and the switch flips its own state.
     */
    await page.goto(`${origin}/admin/components`)
    await expect(page.getByTestId('components-page')).toBeVisible()
    for (const section of [
      'actions',
      'forms',
      'data',
      'navigation',
      'states',
    ]) {
      await expect(page.getByTestId(`gallery-${section}`)).toBeVisible()
    }
    /*
     * Dialog. The real element stays mounted while closed and hides only its
     * content, so "closed" is a state, not a removal — the pre-R6-C assertion
     * expected the host to disappear, which was true of the `<Show>` imitation
     * and is not true of the component.
     *
     * Focus trapping and Escape are the component's job, so they are asserted
     * here rather than taken on faith: a modal that lets Tab escape is a bug
     * the page-owner cannot see.
     */
    const dialogPage = page
    const focusInsideDialog = (): Promise<boolean> =>
      dialogPage.evaluate(`(() => {
        const content = document.querySelector('[data-testid="gallery-dialog-content"]')
        return Boolean(content && content.contains(document.activeElement))
      })()`)

    /*
     * Fail at the assertion that names the real cause.
     *
     * The installed `@zeus-web/dialog` records its mode under a symbol
     * (`@zeus-web/dialog/state`). A build without the fix has no such symbol,
     * so this check distinguishes "the reader's interaction is broken" from
     * "the version this repository installs predates the fix" — and the second
     * one is the only reason this gate can be red on this branch.
     */
    await page.getByTestId('gallery-open-dialog').click()
    const carriesFix = await page.evaluate(`(() => {
      const root = document.querySelector('[data-testid="gallery-dialog"]')
      if (!root) return false
      return Object.getOwnPropertySymbols(root).some(
        (symbol) => symbol.toString().includes('@zeus-web/dialog/state'),
      )
    })()`)
    expect(
      carriesFix,
      '@zeus-web/dialog in examples/admin must contain the state fix; run `pnpm admin:link-dialog` locally, or install a published version that carries it',
    ).toBe(true)

    await expect(page.getByTestId('gallery-dialog-content')).toBeVisible()
    await expect(page.getByTestId('gallery-dialog')).toHaveAttribute(
      'data-state',
      'open',
    )
    // The component moves focus into the panel when it opens; the trap and
    // Escape both build on that, so it is asserted before them.
    await expect
      .poll(focusInsideDialog, {
        message: 'opening the dialog moves focus into it',
      })
      .toBe(true)
    /*
     * Tab around the content. This is the assertion that matters for a modal,
     * and it runs on every engine — there is no exemption.
     *
     * The real component's trap works from a `document` listener. A
     * panel-scoped listener cannot hold here: on WebKit a Tab from the panel
     * (which carries `tabindex="-1"`) is delivered to the next element in the
     * document, so the panel never sees the key that let focus escape. That
     * was a real defect, it is fixed in `fix/dialog-state-and-focus`
     * (zeus-ui), and this repository consumes the build that contains it —
     * `examples/admin/package.json` points `@zeus-web/dialog` at that build.
     *
     * If this fails, the fix has not reached the version Admin installs. The
     * answer is to align the version, never to exempt an engine: a trap that
     * holds on two of three is broken for a third of readers.
     */
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab')
    }
    const trapped = await page.evaluate(`(() => {
      const content = document.querySelector('[data-testid="gallery-dialog-content"]')
      return Boolean(content && content.contains(document.activeElement))
    })()`)
    await expect(trapped, 'Tab stays trapped inside the open dialog').toBe(true)

    /*
     * Escape closes the dialog, and it does so from wherever focus is: the
     * handler is on `document`, so it does not depend on the panel holding
     * focus. Both halves are asserted because the old failure mode was
     * specifically "Escape works only while focus is still inside".
     */
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('gallery-dialog')).toHaveAttribute(
      'data-state',
      'closed',
    )
    await expect(page.getByTestId('gallery-dialog-content')).toBeHidden()

    /*
     * And it opens again. A dialog a person can close exactly once is the
     * defect the review recorded as "cannot be reopened"; the component's
     * state now lives in a signal rather than being re-derived from a
     * reflected attribute the component itself wrote.
     */
    await page.getByTestId('gallery-open-dialog').click()
    await expect(page.getByTestId('gallery-dialog')).toHaveAttribute(
      'data-state',
      'open',
    )
    await expect(page.getByTestId('gallery-dialog-content')).toBeVisible()

    /*
     * Focus returns to the trigger on close. Without this, closing a modal
     * drops the reader at the top of the document and the next Tab starts the
     * page over.
     */
    await page.keyboard.press('Escape')
    const dialogPageForFocus = page
    await expect
      .poll(
        () =>
          dialogPageForFocus.evaluate(`(() => {
            const trigger = document.querySelector('[data-testid="gallery-open-dialog"]')
            return Boolean(trigger && trigger.contains(document.activeElement))
          })()`),
        { message: 'closing the dialog returns focus to its trigger' },
      )
      .toBe(true)

    /*
     * The confirm control lives inside the dialog, so the dialog has to be
     * open for it to be reachable. That is the ordinary path a person takes
     * and it also proves the third open after two closes works.
     */
    await page.getByTestId('gallery-open-dialog').click()
    await expect(page.getByTestId('gallery-dialog-content')).toBeVisible()
    // Evidence for the gallery itself: the open dialog on every engine, so a
    // reviewer can see the real component rather than a claim that it rendered.
    await page.screenshot({
      path: path.join(root, `temp/admin/gallery-${name}.png`),
      fullPage: true,
    })
    await page.getByTestId('gallery-confirm-dialog').click()
    await expect(page.getByTestId('gallery-toast')).toContainText('Confirmed.')
    await expect(page.getByTestId('gallery-dialog')).toHaveAttribute(
      'data-state',
      'closed',
    )
    /*
     * `zw-input` is a wrapper: the editable control is the `<input>` it renders
     * inside its light DOM. Typing goes through that control, which is also how
     * a person uses it — and it means the assertion exercises the component's
     * own change plumbing, not a test hook.
     */
    const galleryName = page.locator('[data-testid="gallery-name"] input')
    const galleryEmail = page.locator('[data-testid="gallery-email"] input')
    await galleryName.fill('Ada Lovelace')
    await galleryEmail.fill('not-an-email')
    await page.getByTestId('gallery-submit').click()
    await expect(page.getByTestId('gallery-email-error')).toBeVisible()
    await galleryEmail.fill('ada@example.test')
    await page.getByTestId('gallery-submit').click()
    await expect(page.getByTestId('gallery-form-ok')).toBeVisible()
    // The name reaches the page through the component's own `value-change`;
    // showing it proves the event crossed the element boundary, not just that
    // the field accepts typing.
    await expect(page.getByTestId('gallery-form-ok')).toContainText(
      'Ada Lovelace',
    )
    /*
     * The rest of the gallery, asserted against what the real components
     * render. Their state hook is `data-state` / `data-value`, not the ARIA
     * attributes the hand-written imitations used, and a `zw-switch` is
     * activated through its own control — clicking the host element does
     * nothing, which is correct HTML and was the first thing this gate got
     * wrong.
     */
    await page.getByTestId('gallery-tab-two').click()
    await expect(page.getByTestId('gallery-tab-two')).toHaveAttribute(
      'data-state',
      'active',
    )
    await expect(page.getByTestId('gallery-tab-panel-two')).toHaveText(
      'The second panel.',
    )
    await page.getByTestId('gallery-tab-two').focus()
    await page.keyboard.press('ArrowRight')
    await expect(
      page.getByTestId('gallery-tab-three'),
      'tabs respond to the arrow keys',
    ).toHaveAttribute('data-state', 'active')

    await page.getByTestId('gallery-accordion-b').click()
    await expect(page.getByTestId('gallery-accordion-b')).toHaveAttribute(
      'data-state',
      'open',
    )
    // The accordion reflects the open item on its own `value` attribute.
    await expect(page.getByTestId('gallery-accordion')).toHaveAttribute(
      'value',
      'b',
    )

    // The switch: click its control, not the host.
    const switchBefore = await page
      .getByTestId('gallery-switch')
      .getAttribute('data-state')
    await page.locator('[data-testid="gallery-switch"] input').click({
      force: true,
    })
    await expect(page.getByTestId('gallery-switch')).not.toHaveAttribute(
      'data-state',
      switchBefore ?? 'checked',
    )

    await expect(page.getByTestId('gallery-progress')).toHaveAttribute(
      'data-state',
      /.*/,
    )
    await expect(page.getByTestId('gallery-empty')).toBeVisible()
    await expect(page.getByTestId('gallery-error')).toBeVisible()
    await expect(page.getByTestId('gallery-success')).toBeVisible()

    await page.goto(`${origin}/admin/roles`)
    await expect(page.getByTestId('roles-page')).toBeVisible()
    // Member counts come from the directory, not from literals: the seeded
    // admin has one administrator (the signed-in user) and the rest are
    // viewers. The matrix answers capabilities; the cards answer membership.
    await expect(page.getByTestId('role-admin-count')).toContainText('1 member')
    await expect(page.getByTestId('role-matrix')).toContainText(
      'Create and edit members',
    )
    // Each cell carries its answer as an accessible name ("Allowed" /
    // "Not allowed"), so the matrix is readable without seeing the icon.
    // Both roles delete members? No: admin may, viewer may not. The row has
    // one cell per role, so there is exactly one "Allowed" and one "Not
    // allowed" in this row — the assertion proves the matrix is not uniform.
    await expect(
      page
        .getByTestId('capability-users.delete')
        .getByLabel('Allowed', { exact: true }),
    ).toHaveCount(1)
    await expect(
      page.getByTestId('capability-users.delete').getByLabel('Not allowed', {
        exact: true,
      }),
    ).toHaveCount(1)
    // Assigning a role goes through the real PATCH and is reflected in the
    // counts without a reload.
    await page.getByTestId('role-assignee').selectOption('grace')
    await page.getByTestId('role-target').selectOption('admin')
    await page.getByTestId('role-assign').click()
    await expect(page.getByTestId('role-assign-status')).toContainText(
      'Grace Hopper is now Administrator',
    )
    await expect(page.getByTestId('role-admin-count')).toContainText(
      '2 members',
    )
    // Put it back so later assertions see the seeded distribution.
    await page.getByTestId('role-target').selectOption('viewer')
    await page.getByTestId('role-assign').click()
    await expect(page.getByTestId('role-admin-count')).toContainText('1 member')
    await page.goto(`${origin}/admin/settings`)
    await expect(page.getByTestId('settings-page')).toBeVisible()
    await page.getByLabel('Workspace name').fill('Operations Console')
    await page.getByLabel('Theme').selectOption('dark')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByTestId('settings-status')).toHaveText(
      'Settings saved',
    )
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.getByLabel('Workspace name')).toHaveValue(
      'Operations Console',
    )

    /*
     * Language: switching relabels the console live, and the choice survives a
     * reload. Both halves matter and they can fail separately — a switch that
     * re-renders nothing leaves the page half-translated, and a switch that is
     * not stored reverts the moment the page loads again. The personal
     * preference is per account in `localStorage`, so the reload is the real
     * test of it.
     */
    /*
     * The language <select> lists both languages by their own names, so the
     * page text always contains 简体中文 — searching the whole page for CJK
     * characters measures the option labels, not the interface. The heading is
     * the thing that actually relabels.
     */
    const heading = page.locator(
      '[data-testid="settings-page"] .settings-title',
    )
    const headingBefore = (await heading.innerText()).trim()
    await page.getByTestId('personal-locale').selectOption('zh-CN')
    await expect
      .poll(async () => (await heading.innerText()).trim(), {
        message: 'switching to zh-CN relabels the page heading',
        timeout: 10_000,
      })
      .not.toBe(headingBefore)
    expect(
      /[\u4e00-\u9fff]/.test((await heading.innerText()).trim()),
      'the relabelled heading is Chinese',
    ).toBe(true)

    await page.reload()
    await expect(page.getByTestId('settings-page')).toBeVisible()
    expect(
      /[\u4e00-\u9fff]/.test(
        (
          await page
            .locator('[data-testid="settings-page"] .settings-title')
            .innerText()
        ).trim(),
      ),
      'the language choice must survive a reload',
    ).toBe(true)

    // Put the console back to English for the assertions that follow, which
    // read English copy.
    await page.getByTestId('personal-locale').selectOption('en')
    await expect(page.getByTestId('personal-locale')).toHaveValue('en')

    // The gate asserts English copy, so the browser must ask for English:
    // without this the console follows `navigator.languages`, and a runner
    // with a Chinese locale would see 登录 where the gate expects "Sign in".
    const viewerContext = await browser.newContext({ locale: 'en-US' })
    const viewerPage = await viewerContext.newPage()
    await viewerPage.goto(`${origin}/admin/reports`)
    await viewerPage.getByLabel('Email').fill('grace@example.test')
    await viewerPage.getByLabel('Password').fill(VIEWER_PASSWORD)
    await viewerPage
      .getByRole('button', { name: 'Sign in', exact: true })
      .click()
    await expect(viewerPage.getByTestId('login-card')).toHaveCount(0)
    await viewerPage.goto(`${origin}/admin/reports`)
    await expect(viewerPage.getByTestId('route-error')).toBeVisible()
    await expect(viewerPage.getByTestId('error-status')).toHaveText('403')
    await viewerPage.goto(`${origin}/admin/audit`)
    await expect(viewerPage.getByTestId('route-error')).toBeVisible()
    await viewerContext.close()

    const apiResponse = await fetch(`${origin}/api/users`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unauthorized@example.test' }),
    })
    expect(apiResponse.status).toBe(401)
    const cookies = await page.context().cookies()
    const session = cookies.find(cookie => cookie.name === SESSION_COOKIE)
    if (session)
      sessions.set(name, { cookie: `${session.name}=${session.value}` })
    const captured = sessions.get(name)
    expect(
      captured,
      `${name} production session must be captured`,
    ).toBeDefined()
    const sessionProbe = await fetch(`${origin}/api/auth/session`, {
      headers: { cookie: captured!.cookie },
    })
    expect(sessionProbe.status).toBe(200)

    expect(errors).toEqual([])
    results.push({ browser: name, status: 'passed' })
    console.log(
      `[admin] ${name}: query, filtering, pagination, selection, UI components, navigation and permissions passed`,
    )
  } catch (error) {
    const gridLocator = page?.getByTestId('user-grid')
    const gridHtml =
      gridLocator && (await gridLocator.count()) > 0
        ? (await gridLocator.evaluate(element => element.innerHTML)).slice(
            0,
            4000,
          )
        : ''
    results.push({
      browser: name,
      status: 'failed',
      error: String(error),
      pageErrors: errors,
      failedResponses,
      bodyText: page
        ? (await page.locator('body').innerText()).slice(0, 2000)
        : '',
      gridHtml,
      userRequests,
    })
  } finally {
    await browser?.close()
  }
}

for (const name of browserNames) {
  const origin = origins.get(name)!
  const devPort = await findFreePort()
  process.env.ZEUS_ADMIN_API_ORIGIN = origin
  const devServer = await createServer({
    root: path.join(root, 'examples/admin'),
    server: {
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
    },
  })
  try {
    await devServer.listen()
    const devOrigin = `http://127.0.0.1:${devPort}`

    const browserEntries = selectedBrowsers.filter(
      ([candidate]) => candidate === name,
    )
    for (const [devName, engine] of browserEntries) {
      let browser: Browser | undefined
      let context: Awaited<ReturnType<Browser['newContext']>> | undefined
      let page: Page | undefined
      try {
        browser = await engine.launch({
          headless: true,
          ...(name === 'chromium' ? { channel: 'chromium' } : {}),
        })
        context = await browser.newContext({
          viewport: { width: 1365, height: 900 },
          locale: 'en-US',
        })
        const session = sessions.get(devName)
        expect(
          session,
          `${devName} production session must be captured`,
        ).toBeDefined()
        await context.addCookies([
          {
            name: 'zeus_admin_session',
            value: session!.cookie.split('=').slice(1).join('='),
            domain: '127.0.0.1',
            path: '/',
            httpOnly: true,
            sameSite: 'Lax',
          },
        ])
        page = await context.newPage()
        const response = await page.goto(`${devOrigin}/admin/users?devtools=1`)
        console.log(
          `[admin] ${devName} dev navigation: ${response?.status()} ${page.url()} session=${session ? 'yes' : 'no'}`,
        )
        await expect(page.getByTestId('users-page')).toBeVisible()
        await expect(page.locator('#admin-devtools')).toBeVisible()
        const initial = await page.evaluate(() => {
          const panel = (
            window as unknown as {
              adminDevtools: {
                snapshot(): {
                  owners: unknown[]
                  bindings: unknown[]
                  timeline: Array<{ id: number }>
                }
              }
            }
          ).adminDevtools
          return panel.snapshot()
        })
        expect(initial.owners.length).toBeGreaterThan(0)
        expect(initial.bindings.length).toBeGreaterThan(0)
        expect(initial.timeline.length).toBeGreaterThan(0)
        expect(initial.timeline.length).toBeLessThanOrEqual(500)
        const initialTimelineId =
          initial.timeline[initial.timeline.length - 1]?.id ?? 0

        await page.getByTestId('page-next').click()
        await expect(page.getByTestId('page-indicator')).toHaveText(
          'Page 2 of 3',
        )
        expect(
          await page.evaluate(() => {
            const panel = (
              window as unknown as {
                adminDevtools: {
                  snapshot(): { timeline: Array<{ id: number }> }
                }
              }
            ).adminDevtools
            const timeline = panel.snapshot().timeline
            return timeline[timeline.length - 1]?.id ?? 0
          }),
        ).toBeGreaterThan(initialTimelineId)
        await page.locator('[data-zeus-devtools-refresh]').click()
        await expect(
          page.locator('#admin-devtools [data-zeus-devtools-summary]'),
        ).toContainText(/bindings/)
        await page.evaluate(() => {
          ;(
            window as unknown as {
              adminDevtools: { disconnect(): void }
            }
          ).adminDevtools.disconnect()
        })
        await expect(page.locator('#admin-devtools')).toHaveCount(0)
        const result = results.find(result => result.browser === devName)!
        result.devtools = 'passed'
        console.log(
          `[admin] ${devName}: Native DevTools graph, timeline, refresh and cleanup passed`,
        )
      } catch (error) {
        const result = results.find(result => result.browser === devName)!
        result.status = 'failed'
        result.devtools = 'failed'
        result.error = `DevTools: ${error instanceof Error ? error.message : String(error)} (url: ${page?.url() ?? 'none'})`
      } finally {
        await context?.close()
        await browser?.close()
      }
    }
  } finally {
    try {
      await fs.writeFile(
        output,
        JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root })
              .toString()
              .trim(),
            results,
          },
          null,
          2,
        ) + '\n',
      )
    } finally {
      const httpServer = devServer.httpServer
      if (httpServer && 'closeAllConnections' in httpServer) {
        httpServer.closeAllConnections()
      }
      await devServer.close()
      await servers.get(name)?.close()
    }
  }
}

if (
  results.length !== selectedBrowsers.length ||
  results.some(result => result.status !== 'passed')
) {
  throw new Error(
    `Admin browser verification failed: ${JSON.stringify(results)}`,
  )
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (!address || typeof address === 'string') {
        probe.close()
        reject(new Error('Unable to allocate a local port.'))
        return
      }
      const port = address.port
      probe.close(error => (error ? reject(error) : resolve(port)))
    })
  })
}
