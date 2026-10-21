import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import {
  type Browser,
  type Page,
  chromium,
  expect,
  firefox,
  webkit,
} from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.join(root, 'examples/admin/dist')
const output = path.join(root, 'temp/admin/report.json')
const results: Array<{
  browser: string
  status: string
  error?: string
  pageErrors?: string[]
  failedResponses?: string[]
  bodyText?: string
  gridHtml?: string
}> = []

await fs.mkdir(path.dirname(output), { recursive: true })
await fs.rm(output, { force: true })
execFileSync('pnpm', ['-F', '@zeus-js/example-admin', 'check'], {
  cwd: root,
  stdio: 'inherit',
})
execFileSync('pnpm', ['-F', '@zeus-js/example-admin', 'build'], {
  cwd: root,
  stdio: 'inherit',
})

const server = http.createServer((request, response) => {
  void serve(request, response).catch(error => {
    response.writeHead(500)
    response.end(String(error))
  })
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('No server port')
const origin = `http://127.0.0.1:${address.port}`

try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
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
      await expect(page.getByTestId('users-page')).toBeVisible()
      await expect(page.getByTestId('admin-layout')).toBeVisible()
      const grid = page.getByTestId('user-grid')
      const row = (key: string) =>
        grid.locator(`[data-slot="data-grid-row"][data-row-key="${key}"]`)
      await expect(row('ada')).toBeVisible()
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
          () =>
            (window as unknown as Record<string, unknown>).adminSmokeDocument,
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
      await page.reload()
      await expect(page.getByTestId('detail-id')).toHaveText('grace')

      for (const [route, status] of [
        ['/admin/users/error', '500'],
        ['/admin/users/missing', '404'],
        ['/admin/reports', '403'],
      ]) {
        await page.goto(`${origin}${route}`)
        await expect(page.getByTestId('route-error')).toBeVisible()
        await expect(page.getByTestId('error-status')).toHaveText(status)
      }
      await page.getByTestId('role-select').selectOption('admin')
      await expect(page.getByTestId('reports-page')).toBeVisible()
      await expect(page.getByTestId('reports-user-count')).toHaveText('8')
      await expect(page.getByTestId('reports-team-count')).toHaveText('5')
      await page.getByTestId('role-select').selectOption('viewer')
      await expect(page.getByTestId('error-status')).toHaveText('403')

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
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
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
}
if (
  results.length !== 3 ||
  results.some(result => result.status !== 'passed')
) {
  throw new Error(
    `Admin browser verification failed: ${JSON.stringify(results)}`,
  )
}

async function serve(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const pathname = decodeURIComponent(
    new URL(request.url ?? '/', origin).pathname,
  )
  const file = path.resolve(dist, `.${pathname}`)
  if (file !== dist && !file.startsWith(dist + path.sep)) {
    response.writeHead(403)
    response.end()
    return
  }
  const extension = path.extname(file)
  const contentTypes: Record<string, string> = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
  }
  try {
    const content = await fs.readFile(
      extension ? file : path.join(dist, 'index.html'),
    )
    response.writeHead(200, {
      'Content-Type':
        contentTypes[extension || '.html'] ?? 'application/octet-stream',
    })
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end()
  }
}
