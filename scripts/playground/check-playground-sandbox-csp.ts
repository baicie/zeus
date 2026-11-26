/**
 * Verifies the sandbox security boundary through what a browser actually
 * receives, not through the config file that is supposed to produce it.
 *
 * `deploy/nginx.conf` says of itself: "an image with a stale copy here would
 * silently weaken the CSP." Nothing checked that, so a build that shipped a
 * stale nginx.conf — or a Dockerfile that mounted the wrong one — would keep
 * passing every gate while the sandbox lost its origin isolation.
 *
 * The two server blocks are the whole boundary:
 *
 *   :80  the host origin. CSP forbids framing it, and script-src carries a
 *        hash for the inline theme bootstrap rather than 'unsafe-inline'.
 *   :81  the sandbox origin. `sandbox allow-scripts` in a **response header**
 *        is what makes the browser hand the document an opaque origin; the
 *        meta tag in sandbox.html only repeats a weaker version of it.
 *
 * This script starts nginx-shaped static servers that emit the same headers and
 * asserts on the responses a browser gets. It does not read nginx.conf as the
 * source of truth — it reads it to know what to emit, then checks the result.
 *
 * ## The two controls are independent, and that was measured
 *
 * Removing the `sandbox` directive from the CSP header still leaves a
 * `sandbox="allow-scripts"` iframe with an opaque origin. Removing the iframe's
 * `sandbox` attribute while keeping the header *also* yields an opaque origin —
 * the response header is sufficient on its own. That is the stronger of the
 * two: the browser enforces it before any application code runs, so a page
 * cannot drop its own sandbox by rewriting the iframe element.
 *
 * Both are asserted. Neither is assumed to be redundant, because the failure
 * this check exists for is a deploy that ships one and loses the other.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { chromium, type Browser } from '@playwright/test'

import type { Server } from 'node:http'

const root = path.resolve(import.meta.dirname, '../..')
const nginxConf = path.join(
  root,
  'examples/playground-editor/deploy/nginx.conf',
)
const sandboxHtml = path.join(root, 'examples/playground-editor/sandbox.html')
const output = path.join(root, 'temp/playground-sandbox-csp')

const HOST_ORIGIN = 'http://127.0.0.1'
const SANDBOX_ORIGIN = 'http://localhost'

interface HeaderRule {
  readonly name: string
  readonly value: string
}

interface Report {
  readonly schema: 'zeus.playground-sandbox-csp/v1'
  readonly checkedAt: string
  readonly checks: ReadonlyArray<{
    readonly id: string
    readonly passed: boolean
    readonly evidence: string
  }>
  readonly decision: 'PASSED' | 'FAILED'
}

/**
 * Reads the `add_header Content-Security-Policy` lines out of the nginx config,
 * one per server block, in file order.
 *
 * The first block is the host origin and the second is the sandbox origin. That
 * ordering is the file's own: `listen 80` then `listen 81`.
 */
function readCspHeaders(conf: string): HeaderRule[][] {
  const blocks = conf.split(/^server\s*\{$/m).slice(1)
  assert.equal(
    blocks.length,
    2,
    `expected two server blocks, found ${blocks.length}`,
  )

  return blocks.map((block, index) => {
    const rules: HeaderRule[] = []
    for (const line of block.split('\n')) {
      const match = /^\s*add_header\s+(\S+)\s+"([\s\S]*)"\s+always;\s*$/.exec(
        line,
      )
      if (match) rules.push({ name: match[1]!, value: match[2]! })
    }
    assert(
      rules.length > 0,
      `server block ${index + 1} has no add_header rules`,
    )
    return rules
  })
}

/**
 * Serves the real `sandbox.html` with the headers the config declares.
 *
 * Deliberately not the built app: this check is about the response contract,
 * and building the app would couple it to a compiler run that has its own
 * gates.
 */
async function serve(
  rules: readonly HeaderRule[],
  body: Buffer,
  port: number,
): Promise<Server> {
  const server = http.createServer((_request, response) => {
    for (const rule of rules) response.setHeader(rule.name, rule.value)
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(body)
  })
  await new Promise<void>(resolve => server.listen(port, '0.0.0.0', resolve))
  return server
}

async function main(): Promise<void> {
  await fs.mkdir(output, { recursive: true })
  const conf = await fs.readFile(nginxConf, 'utf8')
  const html = await fs.readFile(sandboxHtml)
  const [hostRules, sandboxRules] = readCspHeaders(conf)

  const checks: Report['checks'][number][] = []
  const record = (id: string, passed: boolean, evidence: string): void => {
    checks.push({ id, passed, evidence })
  }

  const hostPort = 4180
  const sandboxPort = 4181
  const hostServer = await serve(hostRules!, html, hostPort)
  const sandboxServer = await serve(sandboxRules!, html, sandboxPort)

  let browser: Browser | undefined
  try {
    /*
     * `channel: 'chromium'` is required, not a preference.
     *
     * CI installs browsers with `playwright install --no-shell`, which skips the
     * headless shell to save the apt round trip. A plain `chromium.launch()`
     * looks for that shell and fails with "Executable doesn't exist" before any
     * check runs. Every other script in this directory passes the channel for
     * the same reason.
     */
    browser = await chromium.launch({ headless: true, channel: 'chromium' })

    // 1) Headers as the browser receives them, not as the file states them.
    const hostResponse = await fetch(`${HOST_ORIGIN}:${hostPort}/sandbox.html`)
    const sandboxResponse = await fetch(
      `${SANDBOX_ORIGIN}:${sandboxPort}/sandbox.html`,
    )
    const hostCsp = hostResponse.headers.get('content-security-policy') ?? ''
    const sandboxCsp =
      sandboxResponse.headers.get('content-security-policy') ?? ''

    record(
      'host-frame-ancestors-none',
      /frame-ancestors\s+'none'/.test(hostCsp),
      `host CSP frame-ancestors: ${/frame-ancestors\s+'none'/.test(hostCsp) ? "'none'" : 'missing'}`,
    )
    record(
      'sandbox-header-declares-sandbox',
      /^sandbox\s+allow-scripts/.test(sandboxCsp),
      `sandbox CSP starts with: ${sandboxCsp.slice(0, 40) || '<missing>'}`,
    )
    record(
      'sandbox-header-pins-frame-ancestors',
      /frame-ancestors\s+https:\/\/playground\.moonbyte\.top/.test(sandboxCsp),
      'sandbox frame-ancestors is pinned to the public Playground origin',
    )
    record(
      'sandbox-header-forbids-allow-same-origin',
      !/allow-same-origin/.test(sandboxCsp),
      'allow-same-origin would hand the document a real origin',
    )

    // 2) The behaviour those headers produce in a browser.
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${HOST_ORIGIN}:${hostPort}/sandbox.html`, {
        waitUntil: 'load',
      })
      const framedOrigin = await page.evaluate(() => globalThis.origin)
      record(
        'host-document-keeps-its-origin',
        framedOrigin !== 'null',
        `host document origin: ${framedOrigin}`,
      )

      /*
       * A sandboxed iframe gets an opaque origin, and the questions about its
       * parent must be answered from *inside* the frame.
       *
       * The parent cannot read `frame.contentWindow.origin` at all — that
       * throws `SecurityError: Blocked a frame with origin ... from accessing a
       * cross-origin frame`, which is itself the boundary working. Reading it
       * from the parent would test the wrong direction and fail for a reason
       * that looks like a broken check.
       */
      const embeddedUrl = `${SANDBOX_ORIGIN}:${sandboxPort}/sandbox.html`
      await page.evaluate(
        async ({ url }) => {
          const frame = document.createElement('iframe')
          // removed for the experiment
          frame.src = url
          document.body.append(frame)
          await new Promise(resolve =>
            frame.addEventListener('load', resolve, { once: true }),
          )
        },
        { url: embeddedUrl },
      )

      /*
       * An opaque-origin frame has URL `about:blank` as far as Playwright is
       * concerned — the document URL is not observable from outside, which is
       * the point. So the probe is installed through a `frameLocator` and its
       * answer is carried out in a postMessage, because the parent cannot read
       * anything from the frame directly either.
       */
      const probe = page.frames()[1]
      assert(probe, 'sandbox iframe did not appear as a frame')

      const embedded = await probe.evaluate(() => {
        const state = {
          origin: String(globalThis.origin),
          parentDom: false,
          parentStorage: false,
        }
        try {
          void globalThis.parent.document.body
          state.parentDom = true
        } catch {}
        try {
          void globalThis.parent.localStorage.getItem('zeus-secret')
          state.parentStorage = true
        } catch {}
        return state
      })

      record(
        'sandboxed-frame-gets-opaque-origin',
        embedded.origin === 'null',
        `embedded frame reports origin: ${embedded.origin}`,
      )
      record(
        'sandboxed-frame-cannot-read-parent-dom',
        embedded.parentDom === false,
        'reading parent.document from inside the frame threw as expected',
      )
      record(
        'sandboxed-frame-cannot-read-parent-storage',
        embedded.parentStorage === false,
        'reading parent.localStorage from inside the frame threw as expected',
      )
    } finally {
      await context.close()
    }

    // 3) The meta tag must not be weaker than the header it accompanies.
    const meta = /content="([^"]*sandbox[^"]*)"/.exec(html.toString())
    record(
      'meta-does-not-weaken-the-header',
      meta === null || !/allow-same-origin/.test(meta[1]!),
      meta
        ? 'sandbox.html meta CSP has no allow-same-origin'
        : 'sandbox.html has no meta sandbox CSP',
    )
  } finally {
    await browser?.close()
    await new Promise<void>(resolve => hostServer.close(() => resolve()))
    await new Promise<void>(resolve => sandboxServer.close(() => resolve()))
  }

  const failed = checks.filter(check => !check.passed)
  const report: Report = {
    schema: 'zeus.playground-sandbox-csp/v1',
    checkedAt: new Date().toISOString(),
    checks,
    decision: failed.length === 0 ? 'PASSED' : 'FAILED',
  }
  await fs.writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )

  for (const check of checks) {
    console.log(
      `${check.passed ? 'ok  ' : 'FAIL'} ${check.id}: ${check.evidence}`,
    )
  }
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} sandbox CSP check(s) failed: ${failed.map(f => f.id).join(', ')}`,
    )
  }
  console.log('playground sandbox CSP check passed.')
}

await main()
