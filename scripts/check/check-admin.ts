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
  try {
    browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' ? { channel: 'chromium' } : {}),
    })
    page = await browser.newPage({
      viewport: { width: 1365, height: 900 },
    })
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => {
      if (response.status() >= 400)
        failedResponses.push(`${response.status()} ${response.url()}`)
    })

    await page.goto(`${origin}/admin/users`)
    await page.getByLabel('邮箱').fill('ada@example.test')
    await page.getByLabel('密码').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
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
    await expect(page.getByTestId('page-indicator')).toHaveText('第 2 / 3 页')
    await expect(row('margaret')).toBeVisible()
    await row('margaret').click()
    await expect(row('margaret')).toHaveAttribute('aria-selected', 'true')
    const searchInput = page.locator('#user-search input')
    await searchInput.fill('Radia')
    await expect(searchInput).toHaveValue('Radia')
    await expect(row('radia')).toBeVisible()
    await expect(row('margaret')).toHaveCount(0)
    await expect(row('guido')).toHaveCount(0)
    await expect(row('ada')).toHaveCount(0)
    await expect(page.getByTestId('page-indicator')).toHaveText('第 1 / 1 页')
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
    await page
      .getByTestId('user-form')
      .locator('input')
      .fill('ada.updated@example.test')
    await page
      .getByTestId('user-form')
      .getByRole('button', { name: '保存' })
      .click()
    await expect(page.getByTestId('save-status')).toHaveText('已保存')
    await expect(page.getByTestId('user-dialog')).toHaveCount(0)
    await expect(page.getByTestId('user-detail')).toContainText(
      'ada.updated@example.test',
    )
    await expect(page.getByTestId('admin-layout')).toHaveAttribute(
      'data-smoke',
      'persistent-layout',
    )
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).adminSmokeDocument,
      ),
    ).toBe('same-document')

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
    await page.goto(`${origin}/admin/roles`)
    await expect(page.getByTestId('roles-page')).toBeVisible()
    await expect(page.getByTestId('role-admin')).toContainText('用户 CRUD')
    await page.goto(`${origin}/admin/settings`)
    await expect(page.getByTestId('settings-page')).toBeVisible()
    await page.getByLabel('工作空间名称').fill('Operations Console')
    await page.getByLabel('主题').selectOption('dark')
    await page.getByRole('button', { name: '保存设置' }).click()
    await expect(page.getByTestId('settings-status')).toHaveText('设置已保存')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.getByLabel('工作空间名称')).toHaveValue(
      'Operations Console',
    )

    const viewerContext = await browser.newContext()
    const viewerPage = await viewerContext.newPage()
    await viewerPage.goto(`${origin}/admin/reports`)
    await viewerPage.getByLabel('邮箱').fill('grace@example.test')
    await viewerPage.getByLabel('密码').fill(VIEWER_PASSWORD)
    await viewerPage.getByRole('button', { name: '登录', exact: true }).click()
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
          '第 2 / 3 页',
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
