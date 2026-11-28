/**
 * Installs every create-zeus scaffold from isolated candidate tarballs, not
 * from workspace links or the registry beta. Core packages and the UI
 * `@zeus-web` closure are packed from the checked-out repositories and every
 * candidate is pinned through `pnpm.overrides`.
 *
 * Usage:
 *   pnpm check:create-zeus-candidate --ui-root temp/zeus-ui
 *   pnpm check:create-zeus-candidate --ui-root temp/zeus-ui --template basic-ts
 *   pnpm check:create-zeus-candidate --ui-root temp/zeus-ui --candidates temp/create-zeus-candidate/candidates.json --require-pin-match
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { chromium } from '@playwright/test'

import { chromiumLaunchOptions, isMissingBrowser } from './browser-channel'
import {
  CANDIDATE_TEMPLATES,
  applyCandidateManifest,
  assertCandidateInputsBuilt,
  assertCurrentNativeBinary,
  addPeerEdges,
  candidateArchiveProblems,
  collectWorkspaceClosure,
  discoverWorkspacePackages,
  templateOutputs,
  templateOutputExists,
  templatePinMismatches,
  toFileSpec,
} from '../release/create-zeus-candidate-matrix'
import { zeusFixedPackages } from '../release.config'

import type { PackageManifest } from '../release/create-zeus-candidate-matrix'

const root = path.resolve(import.meta.dirname, '../..')
const packageRoot = path.join(root, 'packages/create/create-zeus')
const output = path.join(root, 'temp/create-zeus-candidate')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-create-candidate-'))
const archives = path.join(work, 'archives')
const project = path.join(work, 'app')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const options = parseOptions(process.argv.slice(2))
const uiRoot = options.uiRoot ? path.resolve(root, options.uiRoot) : undefined
const templates = selectTemplates(options.templates, Boolean(uiRoot))
const registry = options.registry ?? 'https://registry.npmjs.org'
const uiVersion = uiRoot
  ? (
      JSON.parse(
        fs.readFileSync(path.join(uiRoot, 'package.json'), 'utf8'),
      ) as { version: string }
    ).version
  : undefined

fs.mkdirSync(archives)
fs.mkdirSync(project)
fs.mkdirSync(output, { recursive: true })

let passed = false
let failure: string | undefined
let candidateUiVersion: string | undefined
/** The version the fixed group carries, read once and reported. */
let candidateCoreVersion: string | undefined
const candidateCounts = { core: 0, ui: 0 }
const templateResults: Array<{
  template: string
  outputs: string[]
  direct: string[]
  overrides: number
  installed?: Record<string, string>
  pinMatch?: boolean
  pinMismatches?: Array<{ name: string; actual: string; expected: string }>
  tested?: boolean
  passed: boolean
  error?: string
}> = []

try {
  assertCandidateInputsBuilt(root, uiRoot)
  if (uiRoot) assertCurrentNativeBinary(root)

  run('pnpm', ['-F', 'create-zeus', 'build'], root)
  const cliArchive = pack(packageRoot, archives)
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry',
      registry,
      toFileSpec(cliArchive),
    ],
    project,
  )
  const cli = path.join(project, 'node_modules/create-zeus/dist/index.js')
  if (!fs.existsSync(cli)) {
    throw new Error('packed create-zeus CLI is missing after install')
  }

  const manifests = new Map<string, PackageManifest>()
  for (const template of templates) {
    const name = `candidate-${template.name}`
    run(
      process.execPath,
      [cli, '--name', name, '--template', template.name],
      project,
    )
    const manifestPath = path.join(project, name, 'package.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`create-zeus did not scaffold ${template.name}`)
    }
    manifests.set(template.name, readManifest(manifestPath))
  }

  const corePackages = discoverWorkspacePackages(root)
  candidateCoreVersion = corePackages.get('@zeus-js/zeus')?.version
  const coreCandidateNames = [...zeusFixedPackages, '@zeus-js/vite-plugin']
  candidateCounts.core = coreCandidateNames.length
  const missingCore = coreCandidateNames.filter(name => !corePackages.has(name))
  if (missingCore.length > 0) {
    throw new Error(
      `candidate Core packages are missing: ${missingCore.join(', ')}`,
    )
  }
  const expectedVersions = new Map<string, string>()
  for (const name of coreCandidateNames) {
    expectedVersions.set(name, corePackages.get(name)!.version)
  }
  for (const manifest of manifests.values()) {
    for (const name of candidateDependencyNames(manifest)) {
      if (name.startsWith('@zeus-web/') && uiVersion) {
        expectedVersions.set(name, uiVersion)
      }
    }
  }

  const coreCandidates = new Map<string, string>()
  if (options.coreFromRegistry) {
    /*
     * Nothing to pack and nothing to override: the template's own pins already
     * name the published version, and the install resolves them from the
     * registry exactly as a user's would.
     *
     * This is only valid when the version really is published. `assertPublished`
     * below asks the registry rather than assuming it, because "I passed a flag"
     * is not evidence that npm has the packages.
     */
    /*
     * `coreCandidateNames` includes `@zeus-js/vite-plugin`, which releases on
     * its own version line and is never at the Core version. Asserting it at
     * `candidateCoreVersion` asked the registry for a version that by design
     * does not exist.
     */
    await assertCorePublished(
      coreCandidateNames.filter(name => name !== '@zeus-js/vite-plugin'),
      candidateCoreVersion!,
      registry,
    )
  } else if (options.candidates) {
    const candidateFile = path.resolve(root, options.candidates)
    const document = JSON.parse(fs.readFileSync(candidateFile, 'utf8')) as {
      schema?: string
      sourceCommit?: string
      coreVersion?: string
      packages?: Array<{
        name?: string
        version?: string
        file?: string
        sha256?: string
      }>
    }
    if (
      document.schema !== 'zeus.create-zeus-candidate-archives/v1' ||
      document.sourceCommit !== sourceCommit ||
      document.coreVersion !== corePackages.get('@zeus-js/zeus')!.version ||
      !Array.isArray(document.packages)
    ) {
      throw new Error(`invalid or stale candidate manifest: ${candidateFile}`)
    }
    const entries = new Map(
      document.packages.map(entry => [entry.name ?? '', entry]),
    )
    const expected = new Map(
      coreCandidateNames.map(name => [name, corePackages.get(name)!.version]),
    )
    const declared = new Map(
      coreCandidateNames.map(name => {
        const entry = entries.get(name)
        return [
          name,
          {
            sha256: entry?.sha256,
            version: entry?.version,
            exists: Boolean(entry?.file && fs.existsSync(entry.file)),
          },
        ] as const
      }),
    )
    const digests = new Map(
      coreCandidateNames.flatMap(name => {
        const entry = entries.get(name)
        if (!entry?.file || !fs.existsSync(entry.file)) return []
        return [
          [
            name,
            createHash('sha256')
              .update(fs.readFileSync(entry.file))
              .digest('hex'),
          ] as const,
        ]
      }),
    )
    const archiveProblems = candidateArchiveProblems(
      expected,
      declared,
      digests,
    )
    if (archiveProblems.length > 0) {
      throw new Error(archiveProblems.join('; '))
    }
    for (const name of coreCandidateNames) {
      coreCandidates.set(name, toFileSpec(entries.get(name)!.file!))
    }
  } else {
    for (const name of coreCandidateNames) {
      coreCandidates.set(
        name,
        toFileSpec(pack(corePackages.get(name)!.directory, archives)),
      )
    }
  }

  let uiCandidates: Map<string, string> | undefined
  /** Peer names any candidate package declares, with the range it asked for. */
  const candidatePeers = new Map<string, string>()
  if (uiRoot) {
    const uiPackages = discoverWorkspacePackages(uiRoot)
    const uiRoots = [
      ...new Set(
        [...manifests.values()].flatMap(manifest =>
          candidateDependencyNames(manifest).filter(name =>
            name.startsWith('@zeus-web/'),
          ),
        ),
      ),
    ]
    if (uiRoots.length > 0) {
      const missingUi = uiRoots.filter(name => !uiPackages.has(name))
      if (missingUi.length > 0) {
        throw new Error(
          `UI candidate packages are missing from ${uiRoot}: ${missingUi.join(', ')}`,
        )
      }
      const closures = collectWorkspaceClosure(uiPackages, uiRoots)
      if (closures.length === 0) {
        throw new Error(
          `UI candidate packages were not found under ${uiRoot}: ${uiRoots.join(', ')}`,
        )
      }
      uiCandidates = new Map()
      for (const workspacePackage of closures) {
        uiCandidates.set(
          workspacePackage.name,
          toFileSpec(pack(workspacePackage.directory, archives)),
        )
        /*
         * Peers are collected while the directory is in hand, because the
         * packed tarball keeps them and the template never sees them.
         */
        const workspaceManifest = JSON.parse(
          fs.readFileSync(
            path.join(workspacePackage.directory, 'package.json'),
            'utf8',
          ),
        ) as PackageManifest
        for (const [name, range] of Object.entries(
          workspaceManifest.peerDependencies ?? {},
        )) {
          candidatePeers.set(name, range)
        }
      }
      candidateCounts.ui = uiCandidates.size
      candidateUiVersion = uiVersion
    }
  }

  for (const template of templates) {
    const target = path.join(project, `candidate-${template.name}`)
    const manifestPath = path.join(target, 'package.json')
    const manifest = manifests.get(template.name)!
    const candidates = new Map<string, string>(coreCandidates)
    if (uiCandidates) {
      for (const [name, fileSpec] of uiCandidates)
        candidates.set(name, fileSpec)
    }
    if (
      !uiRoot &&
      candidateDependencyNames(manifest).some(name =>
        name.startsWith('@zeus-web/'),
      )
    ) {
      throw new Error(
        `${template.name} contains @zeus-web dependencies; pass --ui-root with the paired UI checkout`,
      )
    }
    const pinMismatches = templatePinMismatches(manifest, expectedVersions)
    const coreMismatches = pinMismatches.filter(mismatch =>
      mismatch.name.startsWith('@zeus-js/'),
    )
    if (coreMismatches.length > 0) {
      throw new Error(
        `${template.name} has stale Core pins: ${coreMismatches
          .map(
            mismatch =>
              `${mismatch.name} ${mismatch.actual} != ${mismatch.expected}`,
          )
          .join(', ')}`,
      )
    }
    if (options.requirePinMatch && pinMismatches.length > 0) {
      throw new Error(
        `${template.name} has stale pins: ${pinMismatches
          .map(
            mismatch =>
              `${mismatch.name} ${mismatch.actual} != ${mismatch.expected}`,
          )
          .join(', ')}`,
      )
    }
    const applied = applyCandidateManifest(manifest, candidates)

    const withPeers = addPeerEdges(
      applied.manifest,
      candidates,
      candidatePeers.keys(),
    )
    if (withPeers !== applied.manifest) {
      applied.manifest.dependencies = withPeers.dependencies
    }

    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(applied.manifest, null, 2)}\n`,
    )

    try {
      /*
       * `--ignore-workspace` is not optional here.
       *
       * Each candidate project is its own install root: its manifest carries a
       * `pnpm.overrides` map pointing every Core and UI package at a local
       * tarball, and `--require-pin-match` has just asserted the pins that map
       * replaces. Without this flag pnpm walks up from the temporary project
       * looking for a workspace, and when `TMPDIR` happens to sit inside a
       * checkout that has one, it resolves against that workspace's lockfile
       * instead — the overrides are ignored and the install reaches for a
       * registry version that by design is not published yet.
       *
       * It surfaced on a workstation whose `TMPDIR` is under the repository; CI
       * installs to `/tmp`, outside any workspace, so the flag changed nothing
       * there and the defect stayed hidden.
       */
      run(
        'pnpm',
        [
          'install',
          '--ignore-workspace',
          '--ignore-scripts',
          '--no-frozen-lockfile',
          '--config.confirmModulesPurge=false',
        ],
        target,
      )
      run(
        process.execPath,
        [
          path.join(target, 'node_modules/typescript/bin/tsc'),
          '--noEmit',
          '-p',
          'tsconfig.json',
        ],
        target,
      )
      run(
        process.execPath,
        [path.join(target, 'node_modules/vite/bin/vite.js'), 'build'],
        target,
      )
      if (manifest.scripts?.test) {
        run('pnpm', ['test'], target)
      }
      const expectedOutputs = templateOutputs(template.name)
      const missingOutputs = expectedOutputs.filter(
        output => !templateOutputExists(target, output),
      )
      if (missingOutputs.length > 0) {
        throw new Error(
          `${template.name} build is missing ${missingOutputs.join(', ')}`,
        )
      }
      // The built template must load and react (R23 TASK 13). Every assertion
      // above stops at "the build wrote files", so a template whose bundle
      // throws on load passed. Serving `dist/` instead of starting a dev server
      // keeps this a check of the artifact, which is what ships.
      //
      // ## What it found, and why it is reported rather than fixed here
      //
      // On the candidate tarballs every template fails at run time with
      // "Cannot track a reactive value with a different Zeus signal engine",
      // and the bundle contains two `Symbol.for('@zeus-js/signal/execution-context')`
      // — the signal package is bundled twice.
      //
      // The cause is the candidate mechanism, not the template. A template
      // declares only `@zeus-js/zeus`, which depends on `@zeus-js/signal` and
      // `@zeus-js/runtime-dom`; rewriting those to `file:` specs makes pnpm
      // give each one its own `.pnpm` entry, while the Vite plugin's `dedupe`
      // compares package names across physically different paths and cannot
      // collapse them. A registry install has one `@zeus-js/signal` and does
      // not do this.
      //
      // So the probe result is recorded, and `passed` keeps meaning "the build
      // and typecheck succeeded". Turning the run red here would report a
      // tarball-registry artefact as a template defect, and the fix belongs to
      // the candidate matrix (TASK 17), not to this check.
      const loadProbe = templateOutputs(template.name).includes(
        'dist/index.html',
      )
        ? await probeBuiltTemplate(target)
        : undefined

      const installed = readInstalledVersions(target)
      const directNames = candidateDependencyNames(manifest)
      assertInstalledVersions(
        template.name,
        installed,
        corePackages.get('@zeus-js/zeus')!.version,
        candidateUiVersion,
        directNames.includes('@zeus-js/zeus'),
        directNames.some(name => name.startsWith('@zeus-web/')),
      )
      templateResults.push({
        template: template.name,
        outputs: [...expectedOutputs],
        direct: applied.direct,
        overrides: Object.keys(applied.overrides).length,
        installed,
        pinMatch: pinMismatches.length === 0,
        pinMismatches,
        tested: Boolean(manifest.scripts?.test),
        /*
         * A failed probe is a failed template.
         *
         * The probe used to be recorded and ignored, with `passed` meaning only
         * "the build wrote files". That is how the duplicate signal engine
         * reached a candidate acceptance that reported success: every bundle
         * built, every typecheck passed, and every app threw on load. A
         * template that cannot render is not verified, whatever its `dist`
         * contains.
         *
         * `blocked` — no browser on this machine — is not a failure. It is
         * also not a pass: the report carries the status, and the release
         * workflow runs where the browsers are installed.
         */
        passed: loadProbe?.status !== 'failed',
        ...(loadProbe ? { loadProbe } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      templateResults.push({
        template: template.name,
        outputs: [...templateOutputs(template.name)],
        direct: applied.direct,
        overrides: Object.keys(applied.overrides).length,
        pinMatch: pinMismatches.length === 0,
        pinMismatches,
        tested: Boolean(manifest.scripts?.test),
        passed: false,
        error: message,
      })
      throw error
    }
  }
  /*
   * The run passes only when every template passed.
   *
   * This was `passed = true`, unconditionally: reaching the end of the loop was
   * the whole claim, so a template recorded with `passed: false` still produced
   * a passing report as long as nothing threw. The probe made that visible —
   * four templates were `passed: false` with a failed load probe and the report
   * still said `passed: true`.
   */
  const failedTemplates = templateResults.filter(result => !result.passed)
  if (failedTemplates.length > 0) {
    throw new Error(
      `candidate templates failed: ${failedTemplates.map(result => result.template).join(', ')}`,
    )
  }
  passed = true
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        schema: 'zeus.create-zeus-candidate/v2',
        sourceCommit,
        registry,
        /*
         * Both versions, always.
         *
         * The report is the evidence that a specific Core and a specific UI
         * build together, and a reader should not have to infer either from the
         * tarball names. `coreVersion` was missing entirely, so a report that
         * had verified a pair named only half of it.
         */
        coreVersion: candidateCoreVersion,
        /*
         * Where the Core came from.
         *
         * A report built from this workspace's packages and one built from the
         * registry's published artifacts are different claims: the first says
         * "the tree about to be published works", the second says "the
         * artifact users install works". The downstream evidence reader has to
         * tell them apart, and inferring it from the presence of a field is a
         * guess — so the source is recorded.
         */
        coreSource: options.coreFromRegistry ? 'registry' : 'workspace',
        ...(uiRoot ? { uiRoot, uiVersion: candidateUiVersion } : {}),
        candidatePackages: candidateCounts,
        templates: templateResults,
        passed,
        ...(failure ? { error: failure } : {}),
      },
      null,
      2,
    )}\n`,
  )
  if (passed && !options.keepWork) {
    fs.rmSync(work, { recursive: true, force: true })
  } else {
    console.error(`Candidate fixture retained at ${work}`)
  }
}

/**
 * Fails unless every Core package the templates need is on the registry at the
 * expected version.
 *
 * Reuses `readPublishedVersions`, which already distinguishes the two failures
 * that matter here: a 404 means "not published" and is a refusal, while any
 * other status or a network error means "could not ask" and is also a refusal.
 * Treating the second as the first would let a flaky registry pass a gate whose
 * entire job is to prove the artifacts exist.
 */
async function assertCorePublished(
  names: readonly string[],
  version: string,
  registry: string,
): Promise<void> {
  const { readPublishedVersions } =
    await import('./check-template-dependencies')
  const missing: string[] = []
  for (const name of names) {
    const published = await readPublishedVersions(name, registry)
    if (!published.includes(version)) missing.push(`${name}@${version}`)
  }
  if (missing.length > 0) {
    throw new Error(
      `--core-from-registry requires every Core package to be published, and these are not:\n${missing.join('\n')}`,
    )
  }
}

function parseOptions(args: string[]): {
  uiRoot?: string
  registry?: string
  templates?: string[]
  candidates?: string
  requirePinMatch?: boolean
  keepWork?: boolean
  coreFromRegistry?: boolean
} {
  const { values } = parseArgs({
    args,
    options: {
      'ui-root': { type: 'string' },
      registry: { type: 'string' },
      template: { type: 'string', multiple: true },
      candidates: { type: 'string' },
      'require-pin-match': { type: 'boolean', default: false },
      'keep-work': { type: 'boolean', default: false },
      /*
       * Resolve Core from the registry instead of packing it from this
       * workspace.
       *
       * The candidate gate normally proves that a Core tree *about to be
       * published* works with a UI tree about to be published. Once Core is
       * published, the honest thing to verify the UI against is the artifact
       * users will actually install — not a fresh build of the same commit,
       * which could differ if the build is not reproducible.
       */
      'core-from-registry': { type: 'boolean', default: false },
    },
  })
  return {
    ...(values['ui-root'] ? { uiRoot: values['ui-root'] } : {}),
    ...(values.registry ? { registry: values.registry } : {}),
    ...(values.template ? { templates: values.template } : {}),
    ...(values.candidates ? { candidates: values.candidates } : {}),
    requirePinMatch: values['require-pin-match'] === true,
    keepWork: values['keep-work'] === true,
    coreFromRegistry: values['core-from-registry'] === true,
  }
}

function selectTemplates(names: string[] | undefined, hasUiRoot: boolean) {
  if (!names || names.length === 0) {
    return hasUiRoot
      ? CANDIDATE_TEMPLATES
      : CANDIDATE_TEMPLATES.filter(template => template.name === 'basic-ts')
  }
  const selected = names.flatMap(name => name.split(','))
  return selected.map(name => {
    const template = CANDIDATE_TEMPLATES.find(item => item.name === name)
    if (!template) throw new Error(`unknown create-zeus template: ${name}`)
    return template
  })
}

/**
 * Serves a template's `dist/` and drives a browser against it (R23 TASK 13).
 *
 * "It builds" and "it runs" are different claims, and only the first was ever
 * checked. A template can emit `dist/index.html` and a JS asset while the bundle
 * throws on load — a missing runtime import, a component that assumes a DOM node
 * the HTML does not have.
 *
 * Returns what was observed rather than only throwing, so the report can say
 * what each template did. A missing browser is reported as BLOCKED rather than
 * failed: the build evidence is still true, and calling a machine without a
 * browser a template defect sends someone to the wrong place.
 */
async function probeBuiltTemplate(target: string): Promise<{
  status: 'passed' | 'blocked' | 'failed'
  detail: string
  rendered?: string
}> {
  const dist = path.join(target, 'dist')
  const server = http.createServer((request, response) => {
    const url = (request.url ?? '/').split('?')[0]!
    const relative = url === '/' ? 'index.html' : url.replace(/^\//, '')
    const file = path.join(dist, relative)
    if (!file.startsWith(dist) || !fs.existsSync(file)) {
      response.statusCode = 404
      response.end('not found')
      return
    }
    response.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html; charset=utf-8',
    )
    response.end(fs.readFileSync(file))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    await new Promise<void>(resolve => server.close(() => resolve()))
    throw new Error('the template probe could not bind a port')
  }
  const origin = `http://127.0.0.1:${address.port}`

  let browser: import('@playwright/test').Browser | undefined
  try {
    try {
      browser = await chromium.launch(chromiumLaunchOptions())
    } catch (error) {
      if (!isMissingBrowser(error)) throw error
      return {
        status: 'blocked',
        detail: 'no browser available on this machine',
      }
    }
    const page = await browser.newPage()
    const pageErrors: string[] = []
    const missing: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('response', response => {
      if (response.status() >= 400) {
        missing.push(`${response.status()} ${response.url()}`)
      }
    })
    page.setDefaultTimeout(30_000)
    await page.goto(origin)
    /*
     * Assert that the page rendered *something*, without naming the container.
     *
     * This used to look for `#app` specifically, and the comment above it
     * claimed the check did not need to know which template it was — but the
     * templates disagree: `webc-consumer-ts` mounts into `#app`, and the five
     * Vite templates mount into `#root`. Four of them therefore reported "the
     * bundle loaded but mounted nothing" while rendering correctly.
     *
     * The defect was invisible until the signal engine stopped being bundled
     * twice, because that failure came first and short-circuited this one.
     *
     * No container is named now: whatever the template renders lands in
     * `body`, so its text content is the claim. Bytes of markup, not a
     * particular element.
     */
    await page
      .waitForFunction(
        () => (document.body?.textContent ?? '').trim().length > 0,
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => undefined)
    const rendered = await page.evaluate(() => document.body?.innerHTML ?? '')
    if (pageErrors.length > 0) {
      return {
        status: 'failed',
        detail: `page errors: ${pageErrors.join('; ')}`,
      }
    }
    if (missing.length > 0) {
      return {
        status: 'failed',
        detail: `the page requested assets that were not emitted: ${missing.join('; ')}`,
      }
    }
    if (rendered.trim().length === 0) {
      return {
        status: 'failed',
        detail: 'the bundle loaded but rendered nothing into the page',
      }
    }
    return {
      status: 'passed',
      detail: `rendered ${rendered.length} characters into the page`,
      rendered: rendered.slice(0, 200),
    }
  } finally {
    if (browser) await browser.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

function readInstalledVersions(target: string): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const name of ['@zeus-js/zeus', '@zeus-web/button'] as const) {
    const file = path.join(target, 'node_modules', name, 'package.json')
    if (!fs.existsSync(file)) continue
    versions[name] = (
      JSON.parse(fs.readFileSync(file, 'utf8')) as { version: string }
    ).version
  }
  return versions
}

function assertInstalledVersions(
  template: string,
  installed: Record<string, string>,
  coreVersion: string,
  uiVersion: string | undefined,
  expectsCore: boolean,
  expectsUi: boolean,
): void {
  if (expectsCore && installed['@zeus-js/zeus'] !== coreVersion) {
    throw new Error(
      `${template} installed @zeus-js/zeus ${installed['@zeus-js/zeus'] ?? '(missing)'} != ${coreVersion}`,
    )
  }
  if (expectsUi && uiVersion && installed['@zeus-web/button'] !== uiVersion) {
    throw new Error(
      `${template} installed @zeus-web/button ${installed['@zeus-web/button'] ?? '(missing)'} != ${uiVersion}`,
    )
  }
}

function readManifest(file: string): PackageManifest {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageManifest
}

function candidateDependencyNames(manifest: PackageManifest): string[] {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]
}

function pack(directory: string, destination: string): string {
  const before = new Set(fs.readdirSync(destination))
  run('pnpm', ['pack', '--pack-destination', destination], directory)
  const created = fs
    .readdirSync(destination)
    .filter(name => name.endsWith('.tgz') && !before.has(name))
  if (created.length !== 1) {
    throw new Error(
      `expected one tarball from ${directory}, got ${created.length}`,
    )
  }
  return path.join(destination, created[0]!)
}

function run(command: string, args: readonly string[], cwd: string): void {
  const shell = process.platform === 'win32' && command !== process.execPath
  const finalArgs = shell
    ? args.map(argument =>
        /[\s"]/u.test(argument)
          ? `"${argument.replace(/"/g, '\\"')}"`
          : argument,
      )
    : [...args]
  execFileSync(command, finalArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
    env: {
      ...process.env,
      /*
       * `NODE_PATH` must not reach the child.
       *
       * This script runs under `tsx`, which sets `NODE_PATH` to this
       * repository's `node_modules` so its own loader can be found. Node then
       * adds those directories to every module lookup the child performs, and
       * Vite honours `NODE_PATH` too. The effect on a candidate project is that
       * `@zeus-js/signal` resolved through the repository while
       * `@zeus-js/signal/internal` resolved through the project — two module
       * ids for one file, so the engine was bundled twice and every template
       * threw "Cannot track a reactive value with a different Zeus signal
       * engine" at run time while its build and typecheck passed.
       *
       * Measured: the same directory and the same `vite build` command
       * produced two engine copies under `tsx` and one under plain Node. CI
       * runs the precheck through `tsx` as well, so this was not a
       * workstation-only shape.
       */
      NODE_PATH: '',
      NODE_OPTIONS: '',
    },
  })
}
