/**
 * Independent deployment acceptance. The RC readiness validators only check
 * that an evidence document contains HTTPS URLs; this command performs real
 * HTTP and browser checks against each deployed product, verifies the served
 * build-info against a CI-generated provenance record and binds the result to
 * the source commits. It never publishes, tags or deploys anything.
 */
import { execFileSync } from 'node:child_process'
import { lookup as dnsLookup } from 'node:dns/promises'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
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

import {
  verifyDeployedBuildInfo,
  verifyProvenance,
  type ProvenanceRecord,
} from './build-info'
import {
  isLoopbackAddress,
  isLoopbackHostname as isLoopbackHost,
  isPrivateAddress,
} from './network-policy'

export { isPrivateAddress } from './network-policy'

export const DEPLOYMENT_MANIFEST_SCHEMA = 'zeus.deployment-manifest/v2'
export const DEPLOYMENT_ACCEPTANCE_SCHEMA = 'zeus.deployment-acceptance/v1'
export const APPROVED_DEPLOYMENT_PORTS = ['443', '8443'] as const

export const DEPLOYMENT_PRODUCTS = [
  'webc-studio',
  'native-lab',
  'admin',
  'ai-workbench',
] as const

export type DeploymentProduct = (typeof DEPLOYMENT_PRODUCTS)[number]
export type DeploymentMode = 'online' | 'local'
export type WriteMode = 'none' | 'isolated'
export type DeploymentProductStatus =
  | 'ONLINE_PASS'
  | 'LOCAL_VALIDATED'
  | 'BLOCKED'
  | 'NOT_RUN'
  | 'FAIL'
export type DeploymentDecision =
  | 'ONLINE_ACCEPTED'
  | 'LOCAL_VALIDATED'
  | 'BLOCKED'
  | 'NOT_ACCEPTED'
  | 'NOT_RUN'

export interface DeploymentProductEntry {
  readonly product: DeploymentProduct
  readonly url: string
  readonly commit: string
  readonly repository: string
  readonly artifactDigest: string
  readonly imageDigest?: string
  readonly healthUrl?: string
}

export interface DeploymentManifest {
  readonly schema: typeof DEPLOYMENT_MANIFEST_SCHEMA
  readonly coreCommit: string
  readonly uiCommit: string
  readonly allowedHosts: readonly string[]
  readonly allowedPorts?: readonly string[]
  readonly sandboxUrl?: string
  readonly provenance?: string
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
  readonly artifactDigest?: string
  readonly imageDigest?: string
  readonly provenanceRunId?: string
  readonly provenanceRunUrl?: string
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
  readonly provenanceFile?: string
  readonly writeMode?: WriteMode
  readonly tenant?: string
  readonly checkedAt?: string
}

const ENGINE_TYPES: Record<string, BrowserType> = {
  chromium,
  firefox,
  webkit,
}

const MAX_REDIRECTS = 5
const MAX_BODY_BYTES = 2 * 1024 * 1024
const HOP_TIMEOUT_MS = 15_000

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
  const allowedHosts = Array.isArray(value.allowedHosts)
    ? value.allowedHosts.filter(
        (item): item is string => typeof item === 'string',
      )
    : []
  if (mode === 'online') {
    if (allowedHosts.length === 0) {
      errors.push('allowedHosts must list the deployment domain names')
    }
    for (const host of allowedHosts) {
      if (!/^[a-z0-9.-]+$/i.test(host) || net.isIP(host) !== 0) {
        errors.push(`allowedHosts entry ${host} must be a DNS name`)
      }
    }
  }
  const configuredPorts = Array.isArray(value.allowedPorts)
    ? value.allowedPorts.filter(
        (item): item is string => typeof item === 'string',
      )
    : []
  const allowedPorts = configuredPorts.length > 0 ? configuredPorts : ['443']
  if (mode === 'online') {
    for (const port of allowedPorts) {
      if (!(APPROVED_DEPLOYMENT_PORTS as readonly string[]).includes(port)) {
        errors.push(`allowedPorts entry ${port} is not an approved HTTPS port`)
      }
    }
  }
  const sandboxUrl =
    typeof value.sandboxUrl === 'string' ? value.sandboxUrl : undefined
  if (
    sandboxUrl !== undefined &&
    !isAllowedDeploymentUrl(sandboxUrl, mode, allowedHosts, allowedPorts)
  ) {
    errors.push('sandboxUrl must follow the deployment URL policy')
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
      !isAllowedDeploymentUrl(entry.url, mode, allowedHosts, allowedPorts)
    ) {
      errors.push(
        `products[${index}].url must be an ${
          mode === 'online' ? 'allowlisted HTTPS' : 'loopback'
        } URL without credentials`,
      )
    }
    if (
      sandboxUrl !== undefined &&
      (productId === 'webc-studio' || productId === 'native-lab') &&
      typeof entry.url === 'string' &&
      isAllowedDeploymentUrl(entry.url, mode, allowedHosts, allowedPorts) &&
      new URL(entry.url).origin === new URL(sandboxUrl).origin
    ) {
      errors.push(`${productId} must not share the sandbox origin`)
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
        `products[${index}].commit ${entry.commit} does not match the ${
          productId === 'ai-workbench' ? 'UI' : 'Core'
        } source`,
      )
    }
    if (!isDigest(entry.artifactDigest)) {
      errors.push(`products[${index}].artifactDigest must be sha256:<64 hex>`)
    }
    if (entry.imageDigest !== undefined && !isDigest(entry.imageDigest)) {
      errors.push(`products[${index}].imageDigest must be sha256:<64 hex>`)
    }
    if (
      entry.healthUrl !== undefined &&
      (typeof entry.healthUrl !== 'string' ||
        !isAllowedDeploymentUrl(
          entry.healthUrl,
          mode,
          allowedHosts,
          allowedPorts,
        ))
    ) {
      errors.push(
        `products[${index}].healthUrl must follow the deployment URL policy`,
      )
    }

    if (
      typeof entry.url === 'string' &&
      isAllowedDeploymentUrl(entry.url, mode, allowedHosts, allowedPorts) &&
      typeof entry.repository === 'string' &&
      isCommit(entry.commit) &&
      isDigest(entry.artifactDigest)
    ) {
      products.push({
        product: productId,
        url: entry.url,
        commit: entry.commit,
        repository: entry.repository,
        artifactDigest: entry.artifactDigest,
        ...(typeof entry.imageDigest === 'string'
          ? { imageDigest: entry.imageDigest }
          : {}),
        ...(typeof entry.healthUrl === 'string'
          ? { healthUrl: entry.healthUrl }
          : {}),
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
  const provenance =
    typeof value.provenance === 'string' ? value.provenance : undefined

  return errors.length === 0
    ? {
        manifest: {
          schema: DEPLOYMENT_MANIFEST_SCHEMA,
          coreCommit,
          uiCommit,
          allowedHosts,
          allowedPorts,
          ...(sandboxUrl === undefined ? {} : { sandboxUrl }),
          provenance,
          products,
        },
        errors,
      }
    : { errors }
}

export function isAllowedDeploymentUrl(
  value: string,
  mode: DeploymentMode,
  allowedHosts: readonly string[] = [],
  allowedPorts: readonly string[] = ['443'],
): boolean {
  try {
    const url = new URL(value)
    if (url.username.length > 0 || url.password.length > 0) return false
    if (mode === 'online') {
      if (url.protocol !== 'https:') return false
      if (!allowedPorts.includes(url.port || '443')) return false
      const host = url.hostname.toLowerCase()
      if (net.isIP(host.replace(/^\[|\]$/g, '')) !== 0) return false
      return allowedHosts.includes(host)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return isLoopbackHost(url.hostname)
  } catch {
    return false
  }
}

export function decideAcceptance(
  mode: DeploymentMode,
  results: readonly DeploymentProductResult[],
): DeploymentDecision {
  if (results.some(result => result.status === 'FAIL')) {
    return 'NOT_ACCEPTED'
  }
  if (results.some(result => result.status === 'BLOCKED')) return 'BLOCKED'
  const passed =
    results.length === DEPLOYMENT_PRODUCTS.length &&
    results.every(result => result.status !== 'NOT_RUN')
  if (!passed) return 'NOT_ACCEPTED'
  return mode === 'online' ? 'ONLINE_ACCEPTED' : 'LOCAL_VALIDATED'
}

export async function runDeploymentAcceptance(
  options: DeploymentAcceptanceOptions,
): Promise<DeploymentAcceptanceReport> {
  const checkedAt = options.checkedAt ?? new Date().toISOString()
  const raw = readJsonFile(options.manifestFile)
  if (raw === undefined) {
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
  const manifest = validation.manifest

  const provenanceFile =
    options.provenanceFile ??
    (manifest.provenance
      ? path.resolve(path.dirname(options.manifestFile), manifest.provenance)
      : undefined)
  const provenance = readProvenance(provenanceFile, manifest, options.mode)
  if (provenance.errors.length > 0) {
    return {
      schema: DEPLOYMENT_ACCEPTANCE_SCHEMA,
      mode: options.mode,
      coreCommit: options.coreCommit,
      uiCommit: options.uiCommit,
      checkedAt,
      decision: 'NOT_ACCEPTED',
      products: [],
      blockers: provenance.errors,
    }
  }

  const results: DeploymentProductResult[] = []
  for (const entry of manifest.products) {
    results.push(
      await checkProduct(entry, manifest, provenance.record, {
        mode: options.mode,
        engines: options.engines,
        writeMode: options.writeMode ?? 'none',
        tenant: options.tenant,
        checkedAt,
        manifest,
      }),
    )
  }

  const decision = decideAcceptance(options.mode, results)
  const blockers = results
    .filter(
      result =>
        result.status === 'FAIL' ||
        result.status === 'BLOCKED' ||
        result.status === 'NOT_RUN',
    )
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

interface CheckContext {
  readonly mode: DeploymentMode
  readonly engines: readonly string[]
  readonly writeMode: WriteMode
  readonly tenant?: string
  readonly checkedAt: string
  readonly manifest: DeploymentManifest
}

async function checkProduct(
  entry: DeploymentProductEntry,
  manifest: DeploymentManifest,
  provenance: ProvenanceRecord | undefined,
  context: CheckContext,
): Promise<DeploymentProductResult> {
  const evidence: string[] = []
  try {
    const response = await fetchChecked(entry.url, context.mode, manifest)
    evidence.push(
      `HTTP ${response.status} ${response.contentType || '<no content-type>'}`,
    )
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status} for ${entry.url}`)
    }
    if (!response.contentType.includes('text/html')) {
      throw new Error(
        `expected text/html, received ${response.contentType || '<none>'}`,
      )
    }
    if (!/id=("|')(app|root)\1/.test(response.body)) {
      throw new Error('response is missing an application mount point')
    }
    if (context.mode === 'online') {
      const hsts = response.headers['strict-transport-security']
      const nosniff = response.headers['x-content-type-options']
      if (!hsts) throw new Error('missing Strict-Transport-Security header')
      if (nosniff !== 'nosniff') throw new Error('missing nosniff header')
      evidence.push('HSTS + nosniff present')
    }

    const buildInfoUrl = new URL('/build-info.json', response.finalUrl).href
    const buildInfoResponse = await fetchChecked(
      buildInfoUrl,
      context.mode,
      manifest,
    )
    const buildInfo = parseJson(buildInfoResponse.body, 'build-info')
    const buildInfoErrors = verifyDeployedBuildInfo(buildInfo, {
      products: [entry.product],
      coreCommit: manifest.coreCommit,
      uiCommit: manifest.uiCommit,
      artifactDigest: entry.artifactDigest,
      ...(entry.imageDigest ? { imageDigest: entry.imageDigest } : {}),
    })
    if (buildInfoErrors.length > 0) {
      throw new Error(
        `build provenance mismatch: ${buildInfoErrors.join('; ')}`,
      )
    }
    evidence.push(`build-info ${entry.artifactDigest}`)
    if (provenance) {
      const record = provenance.products.find(
        product => product.product === entry.product,
      )
      if (!record) throw new Error('provenance record is missing this product')
      if (record.artifactDigest !== entry.artifactDigest) {
        throw new Error('provenance artifactDigest does not match the manifest')
      }
      if (entry.imageDigest && record.imageDigest !== entry.imageDigest) {
        throw new Error('provenance imageDigest does not match the manifest')
      }
      evidence.push(
        `CI provenance run ${provenance.runId} (${provenance.runUrl})${record.imageDigest ? ` image ${record.imageDigest}` : ''}`,
      )
    }

    if (entry.product === 'webc-studio' || entry.product === 'native-lab') {
      const sandboxUrl =
        manifest.sandboxUrl ?? new URL('/sandbox.html', response.finalUrl).href
      const sandbox = await fetchChecked(sandboxUrl, context.mode, manifest)
      if (!sandbox.body.includes("default-src 'none'")) {
        throw new Error('sandbox.html is missing its restrictive CSP')
      }
      const sandboxHeaders = sandbox.headers
      const sandboxCsp = String(sandboxHeaders['content-security-policy'] ?? '')
      if (manifest.sandboxUrl !== undefined) {
        if (!/\bsandbox\b/.test(sandboxCsp)) {
          throw new Error('sandbox response is missing a CSP sandbox directive')
        }
        const hostOrigin = new URL(response.finalUrl).origin
        if (!sandboxCsp.includes(`frame-ancestors ${hostOrigin}`)) {
          throw new Error(
            'sandbox CSP frame-ancestors does not allow the playground host',
          )
        }
      }
      evidence.push('sandbox CSP default-src none')
    }

    if (requiresWrite(entry.product) && context.mode === 'online') {
      if (context.writeMode !== 'isolated' || !context.tenant) {
        return blocked(
          entry,
          'online write smoke requires --write-mode isolated and --tenant',
          evidence,
        )
      }
      if (
        entry.product === 'ai-workbench' &&
        process.env.ZEUS_ACCEPTANCE_AI_REPLAY !== 'true'
      ) {
        return blocked(
          entry,
          'AI write smoke requires ZEUS_ACCEPTANCE_AI_REPLAY=true',
          evidence,
        )
      }
    }

    const browsers: string[] = []
    const hostRules =
      context.mode === 'online'
        ? await buildHostResolverRules(manifest.allowedHosts)
        : undefined
    for (const engineName of context.engines.length > 0
      ? context.engines
      : ['chromium']) {
      const engine = ENGINE_TYPES[engineName]
      if (!engine) throw new Error(`unknown browser engine: ${engineName}`)
      const browser = await launchEngine(engine, engineName, hostRules)
      try {
        const page = await browser.newPage({
          viewport: { width: 1365, height: 900 },
        })
        const pageErrors: string[] = []
        const failedResponses: string[] = []
        const blockedRequests: string[] = []
        page.on('pageerror', error => pageErrors.push(error.message))
        page.on('response', response => {
          const status = response.status()
          const url = response.url()
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
        await page.route('**/*', async route => {
          try {
            validateBrowserUrl(
              new URL(route.request().url()),
              context.mode,
              manifest,
            )
            await route.continue()
          } catch {
            blockedRequests.push(route.request().url())
            await route.abort('blockedbyclient')
          }
        })
        await page.goto(entry.url, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        })
        validateBrowserUrl(new URL(page.url()), context.mode, manifest)
        await runProductSmoke(page, entry, context)
        await assertSandboxIsolation(page, entry.product, context.mode)
        if (pageErrors.length > 0) {
          throw new Error(`page errors: ${pageErrors.join('; ')}`)
        }
        if (failedResponses.length > 0) {
          throw new Error(`failed responses: ${failedResponses.join('; ')}`)
        }
        if (blockedRequests.length > 0) {
          throw new Error(`blocked requests: ${blockedRequests.join('; ')}`)
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
      status: context.mode === 'online' ? 'ONLINE_PASS' : 'LOCAL_VALIDATED',
      httpStatus: response.status,
      browser: browsers.join(','),
      artifactDigest: entry.artifactDigest,
      ...(entry.imageDigest ? { imageDigest: entry.imageDigest } : {}),
      ...(provenance
        ? {
            provenanceRunId: provenance.runId,
            provenanceRunUrl: provenance.runUrl,
          }
        : {}),
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

function requiresWrite(product: DeploymentProduct): boolean {
  return product === 'admin' || product === 'ai-workbench'
}

function blocked(
  entry: DeploymentProductEntry,
  reason: string,
  evidence: readonly string[],
): DeploymentProductResult {
  return {
    product: entry.product,
    url: entry.url,
    commit: entry.commit,
    repository: entry.repository,
    status: 'BLOCKED',
    evidence,
    error: reason,
  }
}

async function runProductSmoke(
  page: import('@playwright/test').Page,
  entry: DeploymentProductEntry,
  context: CheckContext,
): Promise<void> {
  const product = entry.product
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
    const email = process.env.ZEUS_ACCEPTANCE_ADMIN_EMAIL?.trim()
    const password = process.env.ZEUS_ACCEPTANCE_ADMIN_PASSWORD?.trim()
    if (!email || !password) {
      throw new Error(
        'ZEUS_ACCEPTANCE_ADMIN_EMAIL and ZEUS_ACCEPTANCE_ADMIN_PASSWORD are required',
      )
    }
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

  const healthUrl =
    entry.healthUrl ?? new URL('/ai-host/health', entry.url).href
  const health = await fetchChecked(healthUrl, context.mode, context.manifest)
  const healthData = parseJson(health.body, 'AI host health')
  if (!isRecord(healthData) || healthData.ok !== true) {
    throw new Error('AI host health check did not return ok')
  }
  if (context.tenant && healthData.workspace !== context.tenant) {
    throw new Error(
      `AI workspace ${String(healthData.workspace)} is not the acceptance tenant`,
    )
  }
  const composer = page.locator('zw-ai-composer textarea')
  await composer.waitFor({ state: 'visible', timeout: 45_000 })
  const message = `[zeus-acceptance:${context.tenant ?? 'local'}] ${Date.now()}`
  await composer.fill(message)
  await page.locator('zw-ai-composer button[aria-label="Send"]').click()
  await page
    .locator('zw-ai-message-timeline')
    .getByText(message, { exact: false })
    .waitFor({ state: 'visible', timeout: 20_000 })
}

async function assertSandboxIsolation(
  page: import('@playwright/test').Page,
  product: DeploymentProduct,
  mode: DeploymentMode,
): Promise<void> {
  if (product !== 'webc-studio' && product !== 'native-lab') return
  const frameElement = page.locator('[data-testid="preview-frame"]')
  const src = await frameElement.getAttribute('src')
  if (!src) throw new Error('preview sandbox frame has no origin')
  const sandboxOrigin = new URL(src, page.url()).origin
  if (sandboxOrigin === new URL(page.url()).origin) {
    throw new Error('playground sandbox shares the host origin')
  }
  const frame = page
    .frames()
    .find(
      candidate =>
        candidate !== page.mainFrame() &&
        candidate.url().startsWith(sandboxOrigin),
    )
  if (!frame) throw new Error('playground sandbox frame is missing')
  const opaque = await frame.evaluate(() => globalThis.origin)
  if (opaque !== 'null') {
    throw new Error(
      `playground sandbox origin is ${String(opaque)}, expected opaque`,
    )
  }
  if (mode === 'online' && new URL(sandboxOrigin).protocol !== 'https:') {
    throw new Error('playground sandbox must be served over HTTPS online')
  }
}

function validateBrowserUrl(
  url: URL,
  mode: DeploymentMode,
  manifest: DeploymentManifest,
): void {
  if (url.protocol === 'data:' || url.protocol === 'blob:') return
  if (mode === 'online') {
    if (url.protocol !== 'https:') throw new Error(`blocked ${url.protocol}`)
    if (!(manifest.allowedPorts ?? ['443']).includes(url.port || '443'))
      throw new Error('blocked unapproved port')
    if (!manifest.allowedHosts.includes(url.hostname.toLowerCase())) {
      throw new Error(`blocked host ${url.hostname}`)
    }
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`blocked ${url.protocol}`)
  }
  if (!isLoopbackHost(url.hostname))
    throw new Error('blocked non-loopback host')
}

async function launchEngine(
  engine: BrowserType,
  name: string,
  hostRules: string | undefined,
): Promise<Browser> {
  const args = hostRules ? [`--host-resolver-rules=${hostRules}`] : []
  if (name === 'chromium') {
    try {
      return await engine.launch({ headless: true, channel: 'chromium', args })
    } catch {
      return engine.launch({ headless: true, args })
    }
  }
  return engine.launch({ headless: true })
}

async function buildHostResolverRules(
  hosts: readonly string[],
): Promise<string> {
  const rules: string[] = []
  for (const host of hosts) {
    const addresses = await dnsLookup(host, { all: true, verbatim: true })
    if (addresses.length === 0) throw new Error(`no DNS address for ${host}`)
    for (const entry of addresses) {
      if (isPrivateAddress(entry.address)) {
        throw new Error(`host ${host} resolves to a private address`)
      }
    }
    const preferred =
      addresses.find(entry => entry.family === 4) ?? addresses[0]
    rules.push(`MAP ${host} ${preferred.address}`)
  }
  return rules.join(', ')
}

interface CheckedResponse {
  readonly status: number
  readonly headers: http.IncomingHttpHeaders
  readonly contentType: string
  readonly body: string
  readonly finalUrl: string
}

async function fetchChecked(
  value: string,
  mode: DeploymentMode,
  manifest: DeploymentManifest,
): Promise<CheckedResponse> {
  let current = new URL(value)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertUrlPolicy(current, mode, manifest)
    const addresses = await resolveAllowed(current, mode)
    const response = await requestHop(current, addresses)
    if (isRedirect(response.status)) {
      const location = response.headers.location
      if (typeof location !== 'string') {
        throw new Error(`redirect ${response.status} without Location`)
      }
      current = new URL(location, current)
      continue
    }
    return {
      ...response,
      finalUrl: current.href,
    }
  }
  throw new Error(`too many redirects (> ${MAX_REDIRECTS})`)
}

function assertUrlPolicy(
  url: URL,
  mode: DeploymentMode,
  manifest: DeploymentManifest,
): void {
  if (url.username || url.password)
    throw new Error('URL credentials are not allowed')
  if (mode === 'online') {
    if (url.protocol !== 'https:')
      throw new Error('online checks require HTTPS')
    if (!(manifest.allowedPorts ?? ['443']).includes(url.port || '443'))
      throw new Error('online checks require an approved HTTPS port')
    const host = url.hostname.toLowerCase()
    if (net.isIP(host.replace(/^\[|\]$/g, '')) !== 0) {
      throw new Error('online checks require a DNS hostname')
    }
    if (!manifest.allowedHosts.includes(host)) {
      throw new Error(`host ${host} is not in allowedHosts`)
    }
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('local checks require HTTP(S)')
  }
  if (!isLoopbackHost(url.hostname)) {
    throw new Error('local checks require a loopback host')
  }
}

async function resolveAllowed(
  url: URL,
  mode: DeploymentMode,
): Promise<Array<{ address: string; family: number }>> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const literal = net.isIP(host)
  const addresses = literal
    ? [{ address: host, family: literal }]
    : await dnsLookup(host, { all: true, verbatim: true })
  if (addresses.length === 0) throw new Error(`no DNS address for ${host}`)
  for (const entry of addresses) {
    if (
      isPrivateAddress(entry.address) &&
      !(mode === 'local' && isLoopbackAddress(entry.address))
    ) {
      throw new Error(`host ${host} resolves to a private address`)
    }
  }
  if (
    mode === 'online' &&
    addresses.some(entry => entry.family !== 4 && entry.family !== 6)
  ) {
    throw new Error(`host ${host} resolved to an unsupported family`)
  }
  return addresses
}

function requestHop(
  url: URL,
  addresses: readonly { address: string; family: number }[],
): Promise<Omit<CheckedResponse, 'finalUrl'>> {
  const transport = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          host: url.host,
          'user-agent': 'zeus-deployment-acceptance/2',
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
        ...(url.protocol === 'https:' ? { servername: url.hostname } : {}),
        lookup: (_hostname, _options, callback) => {
          const address = addresses[0]
          if (!address) {
            callback(new Error('no allowed address'), '', 0)
            return
          }
          callback(null, address.address, address.family)
        },
        timeout: HOP_TIMEOUT_MS,
      } as https.RequestOptions,
      response => {
        const chunks: Buffer[] = []
        let bytes = 0
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.byteLength
          if (bytes > MAX_BODY_BYTES) {
            response.destroy(new Error('response body exceeds 2 MiB'))
            return
          }
          chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            contentType: String(response.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    request.on('timeout', () =>
      request.destroy(
        new Error(`request timed out after ${HOP_TIMEOUT_MS} ms`),
      ),
    )
    request.on('error', reject)
    request.end()
  })
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  )
}

function readProvenance(
  file: string | undefined,
  manifest: DeploymentManifest,
  mode: DeploymentMode,
): { record?: ProvenanceRecord; errors: string[] } {
  if (!file) {
    return mode === 'online'
      ? { errors: ['online acceptance requires a CI provenance record'] }
      : { errors: [] }
  }
  const value = readJsonFile(file)
  if (value === undefined) {
    return mode === 'online'
      ? { errors: [`provenance missing: ${file}`] }
      : { errors: [] }
  }
  return verifyProvenance(value, manifest)
}

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
}

function expectedCommitFor(
  product: DeploymentProduct,
  coreCommit: string,
  uiCommit: string,
): string {
  return product === 'ai-workbench' ? uiCommit : coreCommit
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value)
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/i.test(value)
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
      provenance: { type: 'string' },
      'write-mode': { type: 'string', default: 'none' },
      tenant: { type: 'string' },
      output: {
        type: 'string',
        default: 'temp/release/deployment-acceptance.json',
      },
    },
  })

  const mode: DeploymentMode = values.mode === 'local' ? 'local' : 'online'
  const coreCommit =
    values['core-commit'] ?? git(process.cwd(), ['rev-parse', 'HEAD'])
  const uiCommit = values['ui-commit'] ?? process.env.ZEUS_UI_COMMIT ?? ''
  const engines = (values.browsers ?? 'chromium')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const writeMode: WriteMode =
    values['write-mode'] === 'isolated' ? 'isolated' : 'none'

  void runDeploymentAcceptance({
    manifestFile: path.resolve(values.manifest ?? ''),
    mode,
    coreCommit,
    uiCommit,
    engines,
    ...(values.provenance
      ? { provenanceFile: path.resolve(values.provenance) }
      : {}),
    writeMode,
    tenant: values.tenant ?? process.env.ZEUS_ACCEPTANCE_TENANT,
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
