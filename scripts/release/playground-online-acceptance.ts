/**
 * Playground-only online acceptance. It intentionally does not satisfy the
 * four-product Core RC gate: Admin and AI Workbench remain unaccepted.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from '@playwright/test'

import {
  BUILD_INFO_SCHEMA,
  computeArtifactDigest,
  verifyDeployedBuildInfo,
  type BuildInfoFile,
} from './build-info'
import {
  assertApprovedHttpsUrl,
  createApprovedPorts,
  createHostAddressMap,
  fetchApproved,
  startPinnedProxy,
  type ApprovedResponse,
  type ApprovedUrlPolicy,
  type PinnedProxy,
} from './online-url-policy'

export const PLAYGROUND_ACCEPTANCE_SCHEMA =
  'zeus.playground-online-acceptance/v1'
export const PLAYGROUND_PRODUCTS = ['webc-studio', 'native-lab'] as const
const ENGINES: Record<string, BrowserType> = { chromium, firefox, webkit }

export type PlaygroundAcceptanceStatus =
  | 'PLAYGROUND_ONLINE_VALIDATED'
  | 'BLOCKED_BY_SANDBOX_SECURITY'
  | 'BLOCKED_BY_DEPLOYMENT'
  | 'BLOCKED_BY_CI'
  | 'BLOCKED_BY_ENVIRONMENT'

export interface PlaygroundAcceptanceOptions {
  readonly hostUrl: string
  readonly sandboxUrl: string
  readonly coreCommit: string
  readonly uiCommit: string
  readonly engines: readonly string[]
  readonly allowedPorts: readonly string[]
  readonly hostAddresses?: Readonly<
    Record<string, readonly { address: string; family: number }[]>
  >
  readonly sourceTree?: string
  readonly imageRef?: string
  readonly imageId?: string
  readonly expectedHostDigest?: string
  readonly expectedSandboxDigest?: string
  readonly checkedAt?: string
}

export interface PlaygroundBrowserResult {
  readonly browser: string
  readonly version?: string
  readonly nativeLab: boolean
  readonly webcStudio: boolean
  readonly directSandboxOpaque: boolean
  readonly thirdPartyBlocked: boolean
  readonly errors: readonly string[]
}

export interface PlaygroundAcceptanceReport {
  readonly schema: typeof PLAYGROUND_ACCEPTANCE_SCHEMA
  readonly status: PlaygroundAcceptanceStatus
  readonly checkedAt: string
  readonly hostUrl: string
  readonly sandboxUrl: string
  readonly coreCommit: string
  readonly uiCommit: string
  readonly sourceTree?: string
  readonly imageRef?: string
  readonly imageId?: string
  readonly buildInfo: {
    readonly host?: BuildInfoEvidence
    readonly sandbox?: BuildInfoEvidence
  }
  readonly security: {
    readonly hostCsp: boolean
    readonly sandboxCspSandbox: boolean
    readonly sandboxFrameAncestors: boolean
    readonly sandboxAcao: boolean
    readonly sandboxNosniff: boolean
    readonly hstsPresent: boolean
  }
  readonly browsers: readonly PlaygroundBrowserResult[]
  readonly evidence: readonly string[]
  readonly blockers: readonly string[]
}

type MutableSecurity = {
  -readonly [Key in keyof PlaygroundAcceptanceReport['security']]: boolean
}

interface BuildInfoEvidence {
  readonly url: string
  readonly artifactDigest: string
  readonly fileCount: number
  readonly builtAt: string
  readonly redirects: readonly string[]
}

interface BuildInfoDocument {
  readonly schema: string
  readonly products: readonly string[]
  readonly coreCommit: string
  readonly uiCommit: string
  readonly sourceTree?: string
  readonly builtAt: string
  readonly artifactDigest: string
  readonly files: readonly BuildInfoFile[]
}

export async function runPlaygroundOnlineAcceptance(
  options: PlaygroundAcceptanceOptions,
): Promise<PlaygroundAcceptanceReport> {
  const checkedAt = options.checkedAt ?? new Date().toISOString()
  const evidence: string[] = []
  const blockers: string[] = []
  const security: MutableSecurity = {
    hostCsp: false,
    sandboxCspSandbox: false,
    sandboxFrameAncestors: false,
    sandboxAcao: false,
    sandboxNosniff: false,
    hstsPresent: false,
  }
  let policy: ApprovedUrlPolicy
  let host: URL
  let sandbox: URL
  try {
    policy = {
      allowedHosts: uniqueHosts(options.hostUrl, options.sandboxUrl),
      allowedPorts: options.allowedPorts,
      ...(options.hostAddresses
        ? { hostAddresses: options.hostAddresses }
        : {}),
    }
    host = assertApprovedHttpsUrl(options.hostUrl, policy)
    sandbox = assertApprovedHttpsUrl(options.sandboxUrl, policy)
    if (host.origin === sandbox.origin) {
      throw new Error('host and sandbox must use different origins')
    }
    evidence.push(`host ${host.href}`)
    evidence.push(`sandbox ${sandbox.href}`)
    evidence.push(`approved ports ${policy.allowedPorts.join(', ')}`)
    if (options.hostAddresses) {
      evidence.push(
        `operator host pins ${Object.entries(options.hostAddresses)
          .map(([name, values]) => `${name}=${values[0]?.address ?? ''}`)
          .join(', ')}`,
      )
    }
  } catch (error) {
    return blocked(
      options,
      checkedAt,
      'BLOCKED_BY_DEPLOYMENT',
      evidence,
      [messageOf(error)],
      security,
      [],
    )
  }

  let hostResponse: ApprovedResponse
  let sandboxResponse: ApprovedResponse
  let hostBuildInfo: BuildInfoEvidence | undefined
  let sandboxBuildInfo: BuildInfoEvidence | undefined
  try {
    hostResponse = await fetchApproved(host.href, policy)
    sandboxResponse = await fetchApproved(sandbox.href, policy)
    assertHostResponse(hostResponse, sandbox, security)
    assertSandboxResponse(sandboxResponse, host, sandbox, security)
    security.hstsPresent = Boolean(
      hostResponse.headers['strict-transport-security'],
    )
    evidence.push(`host HTTP ${hostResponse.status}`)
    evidence.push(`sandbox HTTP ${sandboxResponse.status}`)
    evidence.push('host CSP frame-src + sandbox headers verified')
    evidence.push(
      `HSTS ${security.hstsPresent ? 'present' : 'absent (non-standard port deployment)'}`,
    )

    hostBuildInfo = await verifyBuildInfo(
      new URL('/build-info.json', host.origin).href,
      new URL('/', host.origin).href,
      policy,
      options.coreCommit,
      options.uiCommit,
      options.expectedHostDigest,
      options.sourceTree,
      evidence,
    )
    sandboxBuildInfo = await verifyBuildInfo(
      new URL('build-info.json', new URL('.', sandbox).href).href,
      new URL('.', sandbox).href,
      policy,
      options.coreCommit,
      options.uiCommit,
      options.expectedSandboxDigest,
      options.sourceTree,
      evidence,
    )
  } catch (error) {
    return blocked(
      options,
      checkedAt,
      'BLOCKED_BY_DEPLOYMENT',
      evidence,
      [messageOf(error)],
      security,
      [],
      hostBuildInfo,
      sandboxBuildInfo,
    )
  }

  let imageId = options.imageId
  if (options.imageRef) {
    try {
      const inspected = inspectImage(options.imageRef)
      imageId = inspected.id
      if (options.imageId && options.imageId !== inspected.id) {
        throw new Error(
          `image id ${inspected.id} does not match expected ${options.imageId}`,
        )
      }
      if (inspected.coreCommit !== options.coreCommit) {
        throw new Error(
          'image core commit label does not match the expected source',
        )
      }
      if (inspected.uiCommit !== options.uiCommit) {
        throw new Error(
          'image UI commit label does not match the expected source',
        )
      }
      evidence.push(`image ${options.imageRef} ${inspected.id}`)
    } catch (error) {
      return blocked(
        options,
        checkedAt,
        'BLOCKED_BY_ENVIRONMENT',
        evidence,
        [messageOf(error)],
        security,
        [],
        hostBuildInfo,
        sandboxBuildInfo,
      )
    }
  }

  let proxy: PinnedProxy | undefined
  const browsers: PlaygroundBrowserResult[] = []
  try {
    proxy = await startPinnedProxy(policy)
    evidence.push(`pinned proxy 127.0.0.1:${proxy.port}`)
    for (const name of options.engines.length > 0
      ? options.engines
      : ['chromium', 'firefox', 'webkit']) {
      const engine = ENGINES[name]
      if (!engine) throw new Error(`unknown browser engine: ${name}`)
      let browser: Browser | undefined
      try {
        browser = await launchEngine(engine, name, proxy)
        const result = await runBrowserChecks(
          browser,
          name,
          host,
          sandbox,
          policy,
        )
        browsers.push(result)
        evidence.push(
          `${name} ${result.version ?? ''} native=${result.nativeLab} webc=${result.webcStudio} direct=${result.directSandboxOpaque} thirdParty=${result.thirdPartyBlocked}`,
        )
      } catch (error) {
        browsers.push({
          browser: name,
          nativeLab: false,
          webcStudio: false,
          directSandboxOpaque: false,
          thirdPartyBlocked: false,
          errors: [messageOf(error)],
        })
        blockers.push(`${name}: ${messageOf(error)}`)
        return blocked(
          options,
          checkedAt,
          'BLOCKED_BY_DEPLOYMENT',
          evidence,
          blockers,
          security,
          browsers,
          hostBuildInfo,
          sandboxBuildInfo,
          imageId,
        )
      } finally {
        await browser?.close()
      }
    }
  } catch (error) {
    return blocked(
      options,
      checkedAt,
      'BLOCKED_BY_ENVIRONMENT',
      evidence,
      [messageOf(error)],
      security,
      browsers,
      hostBuildInfo,
      sandboxBuildInfo,
      imageId,
    )
  } finally {
    await proxy?.close().catch(() => {})
  }

  const securityOk = browsers.every(
    result => result.directSandboxOpaque && result.thirdPartyBlocked,
  )
  if (!securityOk) {
    return blocked(
      options,
      checkedAt,
      'BLOCKED_BY_SANDBOX_SECURITY',
      evidence,
      ['opaque-origin or third-party isolation check failed'],
      security,
      browsers,
      hostBuildInfo,
      sandboxBuildInfo,
      imageId,
    )
  }
  const productOk = browsers.every(
    result => result.nativeLab && result.webcStudio,
  )
  if (!productOk) {
    return blocked(
      options,
      checkedAt,
      'BLOCKED_BY_DEPLOYMENT',
      evidence,
      ['Native Lab or WebC Studio browser acceptance failed'],
      security,
      browsers,
      hostBuildInfo,
      sandboxBuildInfo,
      imageId,
    )
  }

  return {
    schema: PLAYGROUND_ACCEPTANCE_SCHEMA,
    status: 'PLAYGROUND_ONLINE_VALIDATED',
    checkedAt,
    hostUrl: host.href,
    sandboxUrl: sandbox.href,
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
    ...(options.sourceTree ? { sourceTree: options.sourceTree } : {}),
    ...(options.imageRef ? { imageRef: options.imageRef } : {}),
    ...(imageId ? { imageId } : {}),
    buildInfo: {
      ...(hostBuildInfo ? { host: hostBuildInfo } : {}),
      ...(sandboxBuildInfo ? { sandbox: sandboxBuildInfo } : {}),
    },
    security,
    browsers,
    evidence,
    blockers: [],
  }
}

function blocked(
  options: PlaygroundAcceptanceOptions,
  checkedAt: string,
  status: PlaygroundAcceptanceStatus,
  evidence: readonly string[],
  blockers: readonly string[],
  security: PlaygroundAcceptanceReport['security'],
  browsers: readonly PlaygroundBrowserResult[],
  hostBuildInfo?: BuildInfoEvidence,
  sandboxBuildInfo?: BuildInfoEvidence,
  imageId?: string,
): PlaygroundAcceptanceReport {
  return {
    schema: PLAYGROUND_ACCEPTANCE_SCHEMA,
    status,
    checkedAt,
    hostUrl: options.hostUrl,
    sandboxUrl: options.sandboxUrl,
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
    ...(options.sourceTree ? { sourceTree: options.sourceTree } : {}),
    ...(options.imageRef ? { imageRef: options.imageRef } : {}),
    ...((imageId ?? options.imageId)
      ? { imageId: imageId ?? options.imageId }
      : {}),
    buildInfo: {
      ...(hostBuildInfo ? { host: hostBuildInfo } : {}),
      ...(sandboxBuildInfo ? { sandbox: sandboxBuildInfo } : {}),
    },
    security,
    browsers,
    evidence,
    blockers,
  }
}

function assertHostResponse(
  response: ApprovedResponse,
  sandbox: URL,
  security: MutableSecurity,
): void {
  if (response.status !== 200) {
    throw new Error(`host returned HTTP ${response.status}`)
  }
  if (!response.contentType.includes('text/html')) {
    throw new Error(`host content-type is ${response.contentType || '<none>'}`)
  }
  if (!/id=("|')(app|root)\1/.test(response.body)) {
    throw new Error('host response is missing an application mount point')
  }
  const headers = response.headers
  if (headers['x-content-type-options'] !== 'nosniff') {
    throw new Error('host is missing X-Content-Type-Options: nosniff')
  }
  if (!String(headers['permissions-policy'] ?? '').trim()) {
    throw new Error('host is missing Permissions-Policy')
  }
  const csp = headerValue(headers['content-security-policy'])
  if (!csp) throw new Error('host is missing Content-Security-Policy')
  if (!csp.includes('frame-src')) {
    throw new Error('host CSP is missing frame-src')
  }
  if (!csp.includes(sandbox.origin)) {
    throw new Error('host CSP frame-src does not allow the sandbox origin')
  }
  security.hostCsp = true
}

function assertSandboxResponse(
  response: ApprovedResponse,
  host: URL,
  sandbox: URL,
  security: MutableSecurity,
): void {
  if (response.status !== 200) {
    throw new Error(`sandbox returned HTTP ${response.status}`)
  }
  if (!response.contentType.includes('text/html')) {
    throw new Error(
      `sandbox content-type is ${response.contentType || '<none>'}`,
    )
  }
  const csp = headerValue(response.headers['content-security-policy'])
  if (!csp || !/\bsandbox\b/.test(csp)) {
    throw new Error('sandbox is missing a CSP sandbox directive')
  }
  if (!/allow-scripts/.test(csp)) {
    throw new Error('sandbox CSP does not allow scripts')
  }
  if (/allow-same-origin/.test(csp)) {
    throw new Error('sandbox CSP must not allow same-origin')
  }
  if (!csp.includes(`frame-ancestors ${host.origin}`)) {
    throw new Error('sandbox CSP frame-ancestors does not name the host origin')
  }
  const acao = String(response.headers['access-control-allow-origin'] ?? '')
  if (acao !== '*' && acao !== sandbox.origin) {
    throw new Error(
      'sandbox assets are not CORS-readable from an opaque origin',
    )
  }
  if (
    String(response.headers['cross-origin-resource-policy'] ?? '') !==
    'cross-origin'
  ) {
    throw new Error('sandbox is missing Cross-Origin-Resource-Policy')
  }
  if (!response.body.includes("default-src 'none'")) {
    throw new Error('sandbox.html is missing its restrictive meta CSP')
  }
  security.sandboxCspSandbox = true
  security.sandboxFrameAncestors = true
  security.sandboxAcao = true
  security.sandboxNosniff =
    String(response.headers['x-content-type-options'] ?? '') === 'nosniff'
  if (!security.sandboxNosniff) {
    throw new Error('sandbox is missing X-Content-Type-Options: nosniff')
  }
}

async function verifyBuildInfo(
  url: string,
  assetBase: string,
  policy: ApprovedUrlPolicy,
  coreCommit: string,
  uiCommit: string,
  expectedDigest: string | undefined,
  expectedSourceTree: string | undefined,
  evidence: string[],
): Promise<BuildInfoEvidence> {
  const response = await fetchApproved(url, policy)
  if (response.status !== 200) {
    throw new Error(`build-info ${url} returned HTTP ${response.status}`)
  }
  let value: unknown
  try {
    value = JSON.parse(response.body) as unknown
  } catch {
    throw new Error(`build-info ${url} is not JSON`)
  }
  const errors = verifyDeployedBuildInfo(value, {
    products: [...PLAYGROUND_PRODUCTS],
    coreCommit,
    uiCommit,
    artifactDigest: getDigest(value),
  })
  if (errors.length > 0) throw new Error(errors.join('; '))
  const document = value as BuildInfoDocument
  if (document.schema !== BUILD_INFO_SCHEMA) {
    throw new Error(`build-info ${url} has the wrong schema`)
  }
  if (!document.files.length) throw new Error('build-info has no files')
  if (!Number.isFinite(Date.parse(document.builtAt))) {
    throw new Error(`build-info ${url} has an invalid builtAt`)
  }
  if (
    expectedSourceTree !== undefined &&
    document.sourceTree !== undefined &&
    document.sourceTree !== expectedSourceTree
  ) {
    throw new Error(
      `build-info ${url} sourceTree ${document.sourceTree} does not match ${expectedSourceTree}`,
    )
  }
  const files: BuildInfoFile[] = []
  for (const file of document.files) {
    if (
      typeof file.path !== 'string' ||
      typeof file.sha256 !== 'string' ||
      typeof file.bytes !== 'number' ||
      !isSafeRelativePath(file.path)
    ) {
      throw new Error(`build-info ${url} has an unsafe file record`)
    }
    const fileResponse = await fetchApproved(
      new URL(file.path, assetBase).href,
      policy,
    )
    if (fileResponse.status !== 200) {
      throw new Error(
        `artifact ${file.path} returned HTTP ${fileResponse.status}`,
      )
    }
    if (fileResponse.bytes.byteLength !== file.bytes) {
      throw new Error(`artifact ${file.path} byte length mismatch`)
    }
    const digest = createHash('sha256').update(fileResponse.bytes).digest('hex')
    if (digest !== file.sha256) {
      throw new Error(`artifact ${file.path} SHA256 mismatch`)
    }
    files.push(file)
  }
  const recomputed = computeArtifactDigest(files)
  if (recomputed !== document.artifactDigest) {
    throw new Error(`build-info ${url} artifactDigest does not match its files`)
  }
  if (expectedDigest && expectedDigest !== document.artifactDigest) {
    throw new Error(
      `build-info ${url} artifactDigest does not match the approval`,
    )
  }
  evidence.push(
    `build-info ${url} ${document.artifactDigest} (${document.files.length} files)`,
  )
  return {
    url,
    artifactDigest: document.artifactDigest,
    fileCount: document.files.length,
    builtAt: document.builtAt,
    redirects: response.redirects,
  }
}

async function runBrowserChecks(
  browser: Browser,
  name: string,
  host: URL,
  sandbox: URL,
  policy: ApprovedUrlPolicy,
): Promise<PlaygroundBrowserResult> {
  const page = await browser.newPage({
    viewport: { width: 1365, height: 900 },
  })
  const errors: string[] = []
  const failed: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      failed.push(`${response.status()} ${response.url()}`)
    }
  })
  try {
    await page.goto(host.href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await runNativeLab(page, host, sandbox, policy)
    await page.goto(new URL('/webc.html', host).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await runWebCStudio(page, sandbox, policy)
    const directSandboxOpaque = await checkDirectSandbox(browser, sandbox)
    const thirdPartyBlocked = await checkThirdParty(browser, sandbox)
    if (failed.length > 0) {
      throw new Error(`failed responses: ${failed.slice(0, 3).join(', ')}`)
    }
    if (errors.length > 0) {
      throw new Error(`page errors: ${errors.slice(0, 3).join('; ')}`)
    }
    return {
      browser: name,
      version: browser.version(),
      nativeLab: true,
      webcStudio: true,
      directSandboxOpaque,
      thirdPartyBlocked,
      errors,
    }
  } finally {
    await page.close()
  }
}

async function runNativeLab(
  page: Page,
  host: URL,
  sandbox: URL,
  policy: ApprovedUrlPolicy,
): Promise<void> {
  await page.getByTestId('compile').click()
  await page.waitForFunction(
    () => window.__zeusPlayground?.getState().previewReady === true,
    null,
    { timeout: 90_000 },
  )
  const frameElement = page.locator('[data-testid="preview-frame"]')
  const src = await frameElement.getAttribute('src')
  if (!src) throw new Error('Native Lab iframe has no src')
  const actual = new URL(src, page.url())
  assertApprovedHttpsUrl(actual, policy)
  if (
    actual.origin !== sandbox.origin ||
    actual.pathname !== sandbox.pathname
  ) {
    throw new Error(
      `Native Lab iframe URL ${actual.href} is not the approved sandbox`,
    )
  }
  if (!actual.searchParams.get('zeus-sandbox-session')) {
    throw new Error('Native Lab iframe is missing its sandbox session')
  }
  if ((await frameElement.getAttribute('sandbox')) !== 'allow-scripts') {
    throw new Error('Native Lab iframe sandbox attribute is not allow-scripts')
  }
  const frame = page
    .frames()
    .find(
      candidate =>
        candidate !== page.mainFrame() &&
        candidate.url().startsWith(sandbox.origin),
    )
  if (!frame) throw new Error('Native Lab sandbox frame is missing')
  const opaque = await frame.evaluate(() => globalThis.origin)
  if (opaque !== 'null') throw new Error(`sandbox origin is ${String(opaque)}`)
  const before = (await frame.locator('button').textContent())?.trim()
  // Chromium may swallow synthetic clicks aimed at an out-of-process iframe
  // while its compositor surface is still being committed after navigation.
  await page.waitForTimeout(250)
  await frame.locator('button').click()
  await page.waitForTimeout(500)
  const after = (await frame.locator('button').textContent())?.trim()
  if (!before || !after || before === after) {
    throw new Error('Native Lab counter did not update')
  }
  if (!frame.url().startsWith(sandbox.origin + sandbox.pathname)) {
    throw new Error('Native Lab iframe redirected outside the approved sandbox')
  }
  void host
}

async function runWebCStudio(
  page: Page,
  sandbox: URL,
  policy: ApprovedUrlPolicy,
): Promise<void> {
  await page.getByTestId('compile').click()
  await page.waitForFunction(
    () => window.__zeusPlayground?.getState().previewReady === true,
    null,
    { timeout: 90_000 },
  )
  await page.getByTestId('tab-inspector').click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="webc-manifest"]')
        ?.textContent?.includes('z-counter'),
    null,
    { timeout: 90_000 },
  )
  await page.getByTestId('preview-frameworks').click()
  // Status copy is localized; assert the message key, which is stable.
  await page.waitForFunction(
    () => {
      const state = (
        window as unknown as {
          __zeusPlayground?: {
            getState(): {
              frameworkPreviewStatusMessage?: {
                key?: string
                text?: string
              }
            }
          }
        }
      ).__zeusPlayground?.getState()
      const message = state?.frameworkPreviewStatusMessage
      return message?.key === 'frameworks.mounted'
    },
    null,
    { timeout: 30_000 },
  )
  const frame = page.frames().find(candidate => candidate !== page.mainFrame())
  if (!frame) throw new Error('WebC sandbox frame is missing')
  if (new URL(frame.url()).origin !== sandbox.origin) {
    throw new Error('WebC sandbox frame origin is not approved')
  }
  const react = frame.getByTestId('sandbox-react-host')
  const vue = frame.getByTestId('sandbox-vue-host')
  if (!(await react.innerText()).includes('React: 3')) {
    throw new Error('React host did not receive the Custom Element')
  }
  if (!(await vue.innerText()).includes('Vue: 7')) {
    throw new Error('Vue host did not receive the Custom Element')
  }
  await frame.evaluate(`(() => {
    const button = document.querySelector(
      '[data-testid="sandbox-react-host"] z-counter button',
    )
    if (!button) throw new Error('React-hosted counter button is missing')
    button.click()
  })()`)
  await page.waitForTimeout(400)
  if (!(await react.innerText()).includes('React: 4')) {
    throw new Error('React-hosted Custom Element did not update')
  }
  assertApprovedHttpsUrl(new URL(frame.url()), policy)
}

async function checkDirectSandbox(
  browser: Browser,
  sandbox: URL,
): Promise<boolean> {
  const page = await browser.newPage()
  try {
    await page.goto(sandbox.href, { waitUntil: 'load', timeout: 30_000 })
    const origin = await page.evaluate(() => globalThis.origin)
    if (origin !== 'null') return false
    return await page.evaluate(() => {
      try {
        void localStorage.length
        return false
      } catch {
        return true
      }
    })
  } finally {
    await page.close()
  }
}

async function checkThirdParty(
  browser: Browser,
  sandbox: URL,
): Promise<boolean> {
  const attacker = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html><body><script>
      window.__sandboxMessages = []
      window.__sandboxPwned = null
      window.addEventListener('message', event => {
        window.__sandboxMessages.push({ origin: event.origin, data: event.data })
        if (event.data && event.data.zeusPwn) window.__sandboxPwned = event.data
      })
      const frame = document.createElement('iframe')
      frame.src = ${JSON.stringify(sandbox.href)}
      document.body.append(frame)
      frame.addEventListener('load', () => setTimeout(() => frame.contentWindow.postMessage({
        channel: 'zeus-playground-sandbox', version: 1, kind: 'sandbox-load',
        sessionId: 'third-party', requestId: 'third-party-1', timeoutMs: 5000,
        payload: { entryPath: 'main.js', modules: [{
          path: 'main.js', imports: [],
          code: 'parent.postMessage({ zeusPwn: true, origin: String(globalThis.origin) }, "*")\\nexport default () => document.createElement("div")',
        }], styles: [], runtimeModules: [] },
      }, '*'), 600))
    </script></body></html>`)
  })
  await new Promise<void>(resolve => attacker.listen(0, '127.0.0.1', resolve))
  const address = attacker.address()
  if (!address || typeof address === 'string') {
    attacker.close()
    throw new Error('third-party fixture did not bind')
  }
  const page = await browser.newPage()
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`, {
      waitUntil: 'load',
      timeout: 30_000,
    })
    await page.waitForTimeout(2_000)
    const result = await page.evaluate(() => {
      const state = window as unknown as {
        __sandboxMessages?: unknown[]
        __sandboxPwned?: unknown
      }
      return {
        messages: state.__sandboxMessages ?? [],
        pwned: state.__sandboxPwned ?? null,
      }
    })
    return result.messages.length === 0 && result.pwned === null
  } finally {
    await page.close()
    await new Promise<void>(resolve => attacker.close(() => resolve()))
  }
}

function launchEngine(
  engine: BrowserType,
  name: string,
  proxy: PinnedProxy,
): Promise<Browser> {
  const options = {
    headless: true,
    proxy: {
      server: `http://127.0.0.1:${proxy.port}`,
      bypass: '127.0.0.1,localhost',
    },
  } as const
  if (name === 'chromium') {
    return engine
      .launch({ ...options, channel: 'chromium' })
      .catch(() => engine.launch(options))
  }
  return engine.launch(options)
}

function inspectImage(ref: string): {
  id: string
  coreCommit?: string
  uiCommit?: string
} {
  const id = execFileSync(
    'docker',
    ['image', 'inspect', ref, '--format', '{{.Id}}'],
    { encoding: 'utf8' },
  ).trim()
  const labels = JSON.parse(
    execFileSync(
      'docker',
      ['image', 'inspect', ref, '--format', '{{json .Config.Labels}}'],
      { encoding: 'utf8' },
    ),
  ) as Record<string, string>
  return {
    id,
    coreCommit: labels['org.opencontainers.image.revision'],
    uiCommit: labels['zeus.ui.commit'],
  }
}

function getDigest(value: unknown): string {
  if (!isRecord(value) || typeof value.artifactDigest !== 'string') {
    throw new Error('build-info has no artifactDigest')
  }
  return value.artifactDigest
}

function uniqueHosts(hostUrl: string, sandboxUrl: string): string[] {
  return [
    ...new Set(
      [new URL(hostUrl).hostname, new URL(sandboxUrl).hostname].map(host =>
        host.toLowerCase(),
      ),
    ),
  ]
}

function isSafeRelativePath(value: string): boolean {
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.startsWith('/')) return false
  return !value.split('/').includes('..')
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join('; ') : (value ?? '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'host-url': { type: 'string' },
      'sandbox-url': { type: 'string' },
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      browsers: { type: 'string', default: 'chromium,firefox,webkit' },
      'allow-port': { type: 'string', multiple: true },
      'host-map': { type: 'string', multiple: true },
      'source-tree': { type: 'string' },
      'image-ref': { type: 'string' },
      'image-id': { type: 'string' },
      'host-digest': { type: 'string' },
      'sandbox-digest': { type: 'string' },
      output: {
        type: 'string',
        default: 'temp/release/playground-online-acceptance.json',
      },
    },
  })
  const hostUrl = values['host-url'] ?? process.env.ZEUS_PLAYGROUND_HOST_URL
  const sandboxUrl =
    values['sandbox-url'] ?? process.env.ZEUS_PLAYGROUND_SANDBOX_URL
  const coreCommit =
    values['core-commit'] ?? process.env.ZEUS_CORE_COMMIT ?? gitHead()
  const uiCommit = values['ui-commit'] ?? process.env.ZEUS_UI_COMMIT
  if (!hostUrl) throw new Error('--host-url is required')
  if (!sandboxUrl) throw new Error('--sandbox-url is required')
  if (!uiCommit) throw new Error('--ui-commit is required')
  const allowedPorts = createApprovedPorts(
    values['allow-port'] ??
      (process.env.ZEUS_PLAYGROUND_ALLOW_PORTS ?? '')
        .split(',')
        .filter(Boolean),
  )
  const hostAddresses = values['host-map']
    ? createHostAddressMap(values['host-map'])
    : process.env.ZEUS_ACCEPTANCE_HOST_MAP
      ? createHostAddressMap([process.env.ZEUS_ACCEPTANCE_HOST_MAP])
      : undefined
  const engines = (values.browsers ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  void runPlaygroundOnlineAcceptance({
    hostUrl,
    sandboxUrl,
    coreCommit,
    uiCommit,
    engines,
    allowedPorts,
    ...(hostAddresses ? { hostAddresses } : {}),
    ...(values['source-tree']
      ? { sourceTree: values['source-tree'] }
      : { sourceTree: gitTree() }),
    ...(values['image-ref'] ? { imageRef: values['image-ref'] } : {}),
    ...(values['image-id'] ? { imageId: values['image-id'] } : {}),
    ...(values['host-digest']
      ? { expectedHostDigest: values['host-digest'] }
      : {}),
    ...(values['sandbox-digest']
      ? { expectedSandboxDigest: values['sandbox-digest'] }
      : {}),
  }).then(report => {
    const output = path.resolve(values.output ?? '')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`${report.status}: ${path.relative(process.cwd(), output)}`)
    for (const line of report.evidence) console.log(`- ${line}`)
    for (const line of report.blockers) console.log(`BLOCKER ${line}`)
    if (report.status !== 'PLAYGROUND_ONLINE_VALIDATED') process.exitCode = 1
  })
}

function gitHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function gitTree(): string {
  return execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    encoding: 'utf8',
  }).trim()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
