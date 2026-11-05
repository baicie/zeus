/**
 * Independent deployment acceptance. The RC readiness validators only check
 * that an evidence document contains HTTPS URLs; this command performs real
 * HTTP and browser checks against each deployed product and binds the result
 * to the source commits. It never publishes, tags or deploys anything.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  type Browser,
  type BrowserType,
  chromium,
  firefox,
  webkit,
} from '@playwright/test'

export const DEPLOYMENT_MANIFEST_SCHEMA = 'zeus.deployment-manifest/v1'
export const DEPLOYMENT_ACCEPTANCE_SCHEMA = 'zeus.deployment-acceptance/v1'

export const DEPLOYMENT_PRODUCTS = [
  'webc-studio',
  'native-lab',
  'admin',
  'ai-workbench',
] as const

export type DeploymentProduct = (typeof DEPLOYMENT_PRODUCTS)[number]
export type DeploymentMode = 'online' | 'local'
export type DeploymentProductStatus =
  | 'ONLINE_PASS'
  | 'LOCAL_VALIDATED'
  | 'NOT_RUN'
  | 'FAIL'
export type DeploymentDecision =
  | 'ONLINE_ACCEPTED'
  | 'LOCAL_VALIDATED'
  | 'NOT_ACCEPTED'
  | 'NOT_RUN'

export interface DeploymentProductEntry {
  readonly product: DeploymentProduct
  readonly url: string
  readonly commit: string
  readonly repository: string
}

export interface DeploymentManifest {
  readonly schema: typeof DEPLOYMENT_MANIFEST_SCHEMA
  readonly coreCommit: string
  readonly uiCommit: string
  readonly products: readonly DeploymentProductEntry[]
}

export interface DeploymentProductResult {
  readonly product: DeploymentProduct
  readonly url: string
  readonly commit: string
  readonly repository: string
  readonly status: DeploymentProductStatus
  readonly httpStatus?: number
  readonly browser?: string
  readonly evidence: readonly string[]
  readonly error?: string
}

export interface DeploymentAcceptanceReport {
  readonly schema: typeof DEPLOYMENT_ACCEPTANCE_SCHEMA
  readonly mode: DeploymentMode
  readonly coreCommit: string
  readonly uiCommit: string
  readonly checkedAt: string
  readonly decision: DeploymentDecision
  readonly products: readonly DeploymentProductResult[]
  readonly blockers: readonly string[]
}

export interface DeploymentAcceptanceOptions {
  readonly manifestFile: string
  readonly mode: DeploymentMode
  readonly coreCommit: string
  readonly uiCommit: string
  readonly engines: readonly string[]
  readonly checkedAt?: string
}

const ENGINE_TYPES: Record<string, BrowserType> = {
  chromium,
  firefox,
  webkit,
}

export function validateDeploymentManifest(
  value: unknown,
  coreCommit: string,
  uiCommit: string,
  mode: DeploymentMode,
): { manifest?: DeploymentManifest; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(value)) return { errors: ['manifest must be an object'] }

  if (value.schema !== DEPLOYMENT_MANIFEST_SCHEMA) {
    errors.push(`schema must be ${DEPLOYMENT_MANIFEST_SCHEMA}`)
  }
  if (!isCommit(value.coreCommit)) {
    errors.push('coreCommit must be a full 40-character commit')
  } else if (value.coreCommit !== coreCommit) {
    errors.push(`coreCommit ${value.coreCommit} does not match ${coreCommit}`)
  }
  if (!isCommit(value.uiCommit)) {
    errors.push('uiCommit must be a full 40-character commit')
  } else if (value.uiCommit !== uiCommit) {
    errors.push(`uiCommit ${value.uiCommit} does not match ${uiCommit}`)
  }
  if (!Array.isArray(value.products)) {
    errors.push('products must be an array')
    return { errors }
  }

  const products: DeploymentProductEntry[] = []
  const seen = new Set<string>()
  for (const [index, entry] of value.products.entries()) {
    if (!isRecord(entry)) {
      errors.push(`products[${index}] must be an object`)
      continue
    }
    const product = entry.product
    if (
      typeof product !== 'string' ||
      !DEPLOYMENT_PRODUCTS.includes(product as DeploymentProduct)
    ) {
      errors.push(`products[${index}].product is not a required product`)
      continue
    }
    if (seen.has(product)) {
      errors.push(`products contains duplicate ${product}`)
      continue
    }
    seen.add(product)
    const productId = product as DeploymentProduct

    if (
      typeof entry.url !== 'string' ||
      !isAllowedDeploymentUrl(entry.url, mode)
    ) {
      errors.push(
        `products[${index}].url must be an ${
          mode === 'online' ? 'HTTPS' : 'HTTPS or loopback HTTP'
        } URL without credentials`,
      )
    }
    if (typeof entry.repository !== 'string' || !entry.repository.trim()) {
      errors.push(`products[${index}].repository must be a non-empty string`)
    }
    if (!isCommit(entry.commit)) {
      errors.push(`products[${index}].commit must be a full commit`)
    } else if (
      entry.commit !== expectedCommitFor(productId, coreCommit, uiCommit)
    ) {
      errors.push(
        `products[${index}].commit ${entry.commit} does not match the ${productId === 'ai-workbench' ? 'UI' : 'Core'} source`,
      )
    }

    if (
      typeof entry.url === 'string' &&
      isAllowedDeploymentUrl(entry.url, mode) &&
      typeof entry.repository === 'string' &&
      isCommit(entry.commit)
    ) {
      products.push({
        product: productId,
        url: entry.url,
        commit: entry.commit,
        repository: entry.repository,
      })
    }
  }

  for (const product of DEPLOYMENT_PRODUCTS) {
    if (!seen.has(product)) errors.push(`products is missing ${product}`)
  }
  if (value.products.length !== DEPLOYMENT_PRODUCTS.length) {
    errors.push(
      `products must contain exactly ${DEPLOYMENT_PRODUCTS.length} entries`,
    )
  }

  return errors.length === 0
    ? {
        manifest: {
          schema: DEPLOYMENT_MANIFEST_SCHEMA,
          coreCommit,
          uiCommit,
          products,
        },
        errors,
      }
    : { errors }
}

export function isAllowedDeploymentUrl(
  value: string,
  mode: DeploymentMode,
): boolean {
  try {
    const url = new URL(value)
    if (url.username.length > 0 || url.password.length > 0) return false
    if (url.protocol === 'https:') {
      if (url.hostname.length === 0) return false
      return mode === 'online' ? !isPrivateHost(url.hostname) : true
    }
    if (mode === 'online' || url.protocol !== 'http:') return false
    return isLoopbackHost(url.hostname)
  } catch {
    return false
  }
}

export function decideAcceptance(
  mode: DeploymentMode,
  results: readonly DeploymentProductResult[],
): DeploymentDecision {
  const passed =
    results.length === DEPLOYMENT_PRODUCTS.length &&
    results.every(
      result => result.status !== 'FAIL' && result.status !== 'NOT_RUN',
    )
  if (!passed) return 'NOT_ACCEPTED'
  return mode === 'online' ? 'ONLINE_ACCEPTED' : 'LOCAL_VALIDATED'
}

export async function runDeploymentAcceptance(
  options: DeploymentAcceptanceOptions,
): Promise<DeploymentAcceptanceReport> {
  const checkedAt = options.checkedAt ?? new Date().toISOString()
  const raw = readManifest(options.manifestFile)
  if (!raw) {
    return {
      schema: DEPLOYMENT_ACCEPTANCE_SCHEMA,
      mode: options.mode,
      coreCommit: options.coreCommit,
      uiCommit: options.uiCommit,
      checkedAt,
      decision: 'NOT_RUN',
      products: [],
      blockers: [`deployment manifest missing: ${options.manifestFile}`],
    }
  }

  const validation = validateDeploymentManifest(
    raw,
    options.coreCommit,
    options.uiCommit,
    options.mode,
  )
  if (!validation.manifest) {
    return {
      schema: DEPLOYMENT_ACCEPTANCE_SCHEMA,
      mode: options.mode,
      coreCommit: options.coreCommit,
      uiCommit: options.uiCommit,
      checkedAt,
      decision: 'NOT_ACCEPTED',
      products: [],
      blockers: validation.errors,
    }
  }

  const results: DeploymentProductResult[] = []
  for (const entry of validation.manifest.products) {
    results.push(
      await checkProduct(entry, options.mode, options.engines, checkedAt),
    )
  }

  const decision = decideAcceptance(options.mode, results)
  const blockers = results
    .filter(result => result.status === 'FAIL' || result.status === 'NOT_RUN')
    .map(result => `${result.product}: ${result.error ?? result.status}`)

  return {
    schema: DEPLOYMENT_ACCEPTANCE_SCHEMA,
    mode: options.mode,
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
    checkedAt,
    decision,
    products: results,
    blockers,
  }
}

async function checkProduct(
  entry: DeploymentProductEntry,
  mode: DeploymentMode,
  engines: readonly string[],
  checkedAt: string,
): Promise<DeploymentProductResult> {
  const evidence: string[] = []
  try {
    const response = await fetchWithTimeout(entry.url)
    const finalUrl = new URL(response.url)
    if (mode === 'online' && finalUrl.protocol !== 'https:') {
      throw new Error(
        `deployment redirected to ${finalUrl.protocol}//${finalUrl.host}`,
      )
    }
    const body = await response.text()
    const contentType = response.headers.get('content-type') ?? ''
    evidence.push(
      `HTTP ${response.status} ${contentType || '<no content-type>'}`,
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${entry.url}`)
    }
    if (!contentType.includes('text/html')) {
      throw new Error(`expected text/html, received ${contentType || '<none>'}`)
    }
    if (!/id=("|')(app|root)\1/.test(body)) {
      throw new Error('response is missing an application mount point')
    }
    if (mode === 'online') {
      const hsts = response.headers.get('strict-transport-security')
      const nosniff = response.headers.get('x-content-type-options')
      if (!hsts) throw new Error('missing Strict-Transport-Security header')
      if (nosniff !== 'nosniff') throw new Error('missing nosniff header')
      evidence.push('HSTS + nosniff present')
    }
    if (entry.product === 'webc-studio') {
      const sandboxUrl = new URL('/sandbox.html', entry.url).href
      const sandbox = await fetchWithTimeout(sandboxUrl)
      const sandboxHtml = await sandbox.text()
      if (!sandbox.ok)
        throw new Error(`sandbox.html returned ${sandbox.status}`)
      if (
        !sandboxHtml.includes("default-src 'none'") ||
        !sandboxHtml.includes("script-src 'self' blob:")
      ) {
        throw new Error('sandbox.html is missing its restrictive CSP')
      }
      evidence.push('sandbox CSP default-src none + script-src self/blob')
    }

    const browsers: string[] = []
    for (const engineName of engines.length > 0 ? engines : ['chromium']) {
      const engine = ENGINE_TYPES[engineName]
      if (!engine) throw new Error(`unknown browser engine: ${engineName}`)
      const browser = await launchEngine(engine, engineName)
      try {
        const page = await browser.newPage({
          viewport: { width: 1365, height: 900 },
        })
        const pageErrors: string[] = []
        const failedResponses: string[] = []
        page.on('pageerror', error => pageErrors.push(error.message))
        page.on('response', response => {
          const status = response.status()
          const url = response.url()
          // The Admin shell probes /api/auth/session before login; a 401 is
          // the expected signed-out state, not a broken deployment.
          const expectedAdminProbe =
            entry.product === 'admin' &&
            status === 401 &&
            url.includes('/api/auth/session')
          if (
            status >= 400 &&
            !url.endsWith('/favicon.ico') &&
            !expectedAdminProbe
          ) {
            failedResponses.push(`${status} ${url}`)
          }
        })
        await page.goto(entry.url, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        })
        const landed = new URL(page.url())
        if (mode === 'online' && landed.protocol !== 'https:') {
          throw new Error(
            `browser landed on ${landed.protocol}//${landed.host} instead of HTTPS`,
          )
        }
        await runProductSmoke(page, entry.product, mode)
        if (pageErrors.length > 0) {
          throw new Error(`page errors: ${pageErrors.join('; ')}`)
        }
        if (failedResponses.length > 0) {
          throw new Error(`failed responses: ${failedResponses.join('; ')}`)
        }
        browsers.push(engineName)
      } finally {
        await browser.close()
      }
    }
    evidence.push(`${browsers.join(', ')} browser smoke passed`)
    return {
      product: entry.product,
      url: entry.url,
      commit: entry.commit,
      repository: entry.repository,
      status: mode === 'online' ? 'ONLINE_PASS' : 'LOCAL_VALIDATED',
      httpStatus: response.status,
      browser: browsers.join(','),
      evidence,
    }
  } catch (error) {
    return {
      product: entry.product,
      url: entry.url,
      commit: entry.commit,
      repository: entry.repository,
      status: 'FAIL',
      evidence,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runProductSmoke(
  page: import('@playwright/test').Page,
  product: DeploymentProduct,
  mode: DeploymentMode,
): Promise<void> {
  if (product === 'webc-studio') {
    const compile = page.getByTestId('compile')
    await compile.waitFor({ state: 'visible', timeout: 60_000 })
    await compile.click()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="webc-manifest"]')
          ?.textContent?.includes('z-counter') === true,
      undefined,
      { timeout: 60_000 },
    )
    return
  }

  if (product === 'native-lab') {
    const compile = page.getByTestId('compile')
    await compile.waitFor({ state: 'visible', timeout: 60_000 })
    await compile.click()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="preview-status"]')
          ?.textContent?.includes('预览就绪') === true,
      undefined,
      { timeout: 60_000 },
    )
    return
  }

  if (product === 'admin') {
    const email = process.env.ZEUS_ADMIN_EMAIL?.trim() || 'ada@example.test'
    const password = process.env.ZEUS_ADMIN_PASSWORD?.trim()
    if (!password) {
      throw new Error(
        'ZEUS_ADMIN_PASSWORD is required to verify the deployed Admin login',
      )
    }
    // The Admin shell is mounted on /admin/users; the deep link also proves
    // the production server serves the SPA entry for protected routes.
    await page.goto(new URL('/admin/users', page.url()).href, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码').fill(password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page
      .getByTestId('users-page')
      .waitFor({ state: 'visible', timeout: 30_000 })
    const visibleCookies = await page.evaluate(() => document.cookie)
    if (visibleCookies.includes('session')) {
      throw new Error('the session cookie must be HttpOnly')
    }
    return
  }

  const composer = page.locator('zw-ai-composer textarea')
  await composer.waitFor({ state: 'visible', timeout: 45_000 })
  const message = `Deployment acceptance ${mode} ${Date.now()}`
  await composer.fill(message)
  await page.locator('zw-ai-composer button[aria-label="Send"]').click()
  await page
    .locator('zw-ai-message-timeline')
    .getByText(message, { exact: false })
    .waitFor({ state: 'visible', timeout: 45_000 })
}

async function launchEngine(
  engine: BrowserType,
  name: string,
): Promise<Browser> {
  if (name === 'chromium') {
    try {
      return await engine.launch({ headless: true, channel: 'chromium' })
    } catch {
      return engine.launch({ headless: true })
    }
  }
  return engine.launch({ headless: true })
}

function expectedCommitFor(
  product: DeploymentProduct,
  coreCommit: string,
  uiCommit: string,
): string {
  return product === 'ai-workbench' ? uiCommit : coreCommit
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'zeus-deployment-acceptance/1' },
    signal: AbortSignal.timeout(20_000),
  })
}

function readManifest(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value)
}

function isLoopbackHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)
}

function isPrivateHost(hostname: string): boolean {
  if (isLoopbackHost(hostname) || hostname.endsWith('.local')) return true
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!match) return false
  const [first, second] = [Number(match[1]), Number(match[2])]
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function main(): void {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string', default: 'temp/release/deployment.json' },
      mode: { type: 'string', default: 'online' },
      browsers: { type: 'string', default: 'chromium' },
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      output: {
        type: 'string',
        default: 'temp/release/deployment-acceptance.json',
      },
    },
  })

  const mode = values.mode === 'local' ? 'local' : 'online'
  const coreCommit =
    values['core-commit'] ?? git(process.cwd(), ['rev-parse', 'HEAD'])
  const uiCommit = values['ui-commit'] ?? process.env.ZEUS_UI_COMMIT ?? ''
  const engines = (values.browsers ?? 'chromium')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  void runDeploymentAcceptance({
    manifestFile: path.resolve(values.manifest ?? ''),
    mode,
    coreCommit,
    uiCommit,
    engines,
  }).then(report => {
    const output = path.resolve(values.output ?? '')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`${report.decision}: ${path.relative(process.cwd(), output)}`)
    for (const result of report.products) {
      console.log(`- ${result.product}: ${result.status} ${result.url}`)
      for (const line of result.evidence) console.log(`  ${line}`)
      if (result.error) console.log(`  error: ${result.error}`)
    }
    for (const blocker of report.blockers) console.log(`- ${blocker}`)
    if (
      report.decision !== 'ONLINE_ACCEPTED' &&
      report.decision !== 'LOCAL_VALIDATED'
    ) {
      process.exitCode = 1
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
