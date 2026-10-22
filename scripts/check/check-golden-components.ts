import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium, firefox, webkit, type BrowserType } from '@playwright/test'
import { createVerifier } from 'sigstore'

import { verifyGoldenComponentManifest } from './golden-component-manifest'
import { escapeRegExp } from './regexp-utils'

const reportDirectory = path.resolve(
  readOption('--output') ?? 'temp/golden-components',
)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-golden-consumer-'))
const uiVersion =
  readOption('--ui-version') ?? process.env.ZEUS_UI_VERSION ?? '0.1.0-beta.32'
const frameworkVersion =
  readOption('--framework-version') ??
  process.env.ZEUS_FRAMEWORK_VERSION ??
  '0.1.1-beta.13'
const registry = readOption('--registry') ?? 'https://registry.npmjs.org'
const browsers = (readOption('--browsers') ?? 'chromium,firefox,webkit').split(
  ',',
)
const browserTypes: Record<string, BrowserType> = { chromium, firefox, webkit }
const packages = [
  '@zeus-web/button',
  '@zeus-web/input',
  '@zeus-web/dialog',
  '@zeus-web/data-grid',
] as const
const goldenContract = JSON.parse(
  fs.readFileSync(
    path.resolve('tests/contracts/golden-components.json'),
    'utf8',
  ),
) as {
  source: {
    repository: string
    commit: string
    version: string
    frameworkDependency: string
  }
  groups: Array<{
    id: string
    package: string
    sourceFile: string
    sourceSha256: string
    manifestFile: string
    manifestSha256: string
    requiredBrowserAssertions: string[]
  }>
}
const results: Array<Record<string, unknown>> = []
const supplyChainEvidence: Array<Record<string, unknown>> = []
const manifestEvidence: Array<Record<string, unknown>> = []
const ssrEvidence: Array<Record<string, unknown>> = []

if (browsers.some(name => !browserTypes[name])) {
  throw new Error(
    'browsers must be a comma-separated subset of chromium,firefox,webkit',
  )
}

fs.mkdirSync(reportDirectory, { recursive: true })
for (const consumer of ['native', 'react18', 'react19', 'vue3']) {
  const project = path.join(work, consumer)
  try {
    prepareProject(project, consumer)
    install(project, consumer)
    await verifyPublishedPackages(project, consumer)
    verifyManifests(project, consumer)
    try {
      verifySsrImports(project, consumer)
    } catch (error) {
      results.push({
        consumer,
        status: 'failed',
        stage: 'ssr-import',
        error: String(error),
      })
    }
    buildProject(project, consumer)
  } catch (error) {
    results.push({
      consumer,
      status: 'failed',
      stage: 'package-verification',
      error: String(error),
    })
    continue
  }
  for (const browser of browsers) {
    const result = await runBrowser(project, consumer, browser)
    try {
      verifyBrowserAssertions(result, goldenContract.groups)
      results.push(result)
    } catch (error) {
      results.push({
        ...result,
        status: 'failed',
        stage: 'browser-assertions',
        verificationError: String(error),
      })
    }
  }
}

const report = {
  createdAt: new Date().toISOString(),
  uiVersion,
  frameworkVersion,
  registry,
  packages,
  browsers,
  contract: {
    source: goldenContract.source,
    requiredBrowserAssertions: [
      ...new Set(
        goldenContract.groups.flatMap(group => group.requiredBrowserAssertions),
      ),
    ],
  },
  supplyChain: supplyChainEvidence,
  manifests: manifestEvidence,
  ssr: ssrEvidence,
  results,
}
fs.writeFileSync(
  path.join(reportDirectory, 'report.json'),
  JSON.stringify(report, null, 2) + '\n',
)
console.log(
  `Golden component report: ${path.join(reportDirectory, 'report.json')}`,
)
if (results.some(result => result.status !== 'passed')) {
  throw new Error(
    `Golden component verification failed: ${JSON.stringify(results)}`,
  )
}

function prepareProject(project: string, consumer: string): void {
  fs.mkdirSync(path.join(project, 'src'), { recursive: true })
  const reactVersion = consumer === 'react18' ? '^18.3.1' : '^19.1.0'
  const dependencies: Record<string, string> = {
    ...Object.fromEntries(packages.map(name => [name, uiVersion])),
    '@zeus-js/zeus': frameworkVersion,
    '@zeus-js/runtime-dom': frameworkVersion,
    react: reactVersion,
    'react-dom': reactVersion,
    vue: '^3.5.0',
    vite: '^8.0.0',
    typescript: '^6.0.0',
  }
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
  )
  fs.writeFileSync(
    path.join(project, 'index.html'),
    '<div id="app"></div><script type="module" src="/src/main.mjs"></script>\n',
  )
  fs.writeFileSync(path.join(project, 'vite.config.mjs'), 'export default {}\n')
  fs.writeFileSync(path.join(project, 'src/main.mjs'), browserSource(consumer))
}

function install(project: string, consumer: string): void {
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry',
      registry,
    ],
    { cwd: project, stdio: 'inherit' },
  )
  execFileSync('npm', ['audit', 'signatures', '--registry', registry], {
    cwd: project,
    stdio: 'inherit',
  })
  // React and Vue wrappers are optional peer paths. Installing only the selected
  // framework keeps each consumer an independent package installation.
  if (consumer === 'native') {
    execFileSync(
      'npm',
      ['uninstall', '--no-audit', '--no-fund', 'react', 'react-dom', 'vue'],
      {
        cwd: project,
        stdio: 'ignore',
      },
    )
  }
}

function verifyManifests(project: string, consumer: string): void {
  for (const packageName of packages) {
    const packageDirectory = path.dirname(
      requireResolve(
        path.join(project, 'node_modules', packageName, 'package.json'),
      ),
    )
    const manifestPath = path.join(
      packageDirectory,
      'dist/zeus.components.json',
    )
    const group = goldenContract.groups.find(
      entry => entry.package === packageName,
    )
    if (!group)
      throw new Error(`${packageName} is missing from the Golden contract`)
    const digest = verifyGoldenComponentManifest(
      fs.readFileSync(manifestPath, 'utf8'),
      packageName,
      group.manifestSha256,
    )
    manifestEvidence.push({
      consumer,
      package: packageName,
      sha256: digest,
      contractSha256: group.manifestSha256,
      status: 'verified',
    })
  }
}

async function verifyPublishedPackages(
  project: string,
  consumer: string,
): Promise<void> {
  const lock = JSON.parse(
    fs.readFileSync(path.join(project, 'package-lock.json'), 'utf8'),
  ) as {
    packages?: Record<
      string,
      { version?: string; resolved?: string; integrity?: string }
    >
  }
  if (
    goldenContract.source.repository !== 'https://github.com/baicie/zeus-ui' ||
    goldenContract.source.version !== uiVersion ||
    goldenContract.source.frameworkDependency !== frameworkVersion
  ) {
    throw new Error(
      'Golden contract source does not match the selected registry versions',
    )
  }
  verifyFrameworkDependencies(lock, project, consumer)
  for (const packageName of packages) {
    const packageJsonPath = requireResolve(
      path.join(project, 'node_modules', packageName, 'package.json'),
    )
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as {
      name?: string
      version?: string
      repository?: { url?: string }
      peerDependencies?: Record<string, string>
    }
    if (packageJson.name !== packageName || packageJson.version !== uiVersion) {
      throw new Error(
        `${packageName} resolved to an unexpected published version`,
      )
    }
    if (!packageJson.repository?.url?.includes('github.com/baicie/zeus-ui')) {
      throw new Error(
        `${packageName} does not identify the Zeus UI source repository`,
      )
    }
    if (packageJson.peerDependencies?.['@zeus-js/zeus'] !== frameworkVersion) {
      throw new Error(
        `${packageName} does not declare framework ${frameworkVersion}`,
      )
    }
    const lockEntry = lock.packages?.[`node_modules/${packageName}`]
    if (
      !lockEntry?.resolved?.includes(
        `/${packageName}/-/${packageName.split('/').pop()}-${uiVersion}.tgz`,
      )
    ) {
      throw new Error(
        `${packageName} was not installed from its registry tarball`,
      )
    }
    if (!lockEntry.integrity) {
      throw new Error(
        `${packageName} has no npm integrity recorded in package-lock.json`,
      )
    }
    const registryIntegrity = execFileSync(
      'npm',
      [
        'view',
        `${packageName}@${uiVersion}`,
        'dist.integrity',
        '--json',
        '--registry',
        registry,
      ],
      { cwd: project, encoding: 'utf8' },
    )
      .trim()
      .replace(/^"|"$/g, '')
    if (registryIntegrity !== lockEntry.integrity) {
      throw new Error(
        `${packageName} package-lock integrity does not match npm dist.integrity`,
      )
    }
    const provenanceUrl = execFileSync(
      'npm',
      [
        'view',
        `${packageName}@${uiVersion}`,
        'dist.attestations.url',
        '--json',
        '--registry',
        registry,
      ],
      { cwd: project, encoding: 'utf8' },
    )
      .trim()
      .replace(/^"|"$/g, '')
    if (!provenanceUrl)
      throw new Error(`${packageName} has no npm provenance attestation`)
    const provenanceResponse = await fetchWithRetry(
      provenanceUrl,
      `${packageName} provenance`,
    )
    if (!provenanceResponse.ok) {
      throw new Error(
        `${packageName} provenance request failed: ${provenanceResponse.status}`,
      )
    }
    const provenance = (await provenanceResponse.json()) as {
      attestations?: Array<{
        predicateType?: string
        bundle?: { dsseEnvelope?: { payload?: string } }
      }>
    }
    const slsa = provenance.attestations?.find(
      attestation =>
        attestation.predicateType === 'https://slsa.dev/provenance/v1',
    )
    const payload = slsa?.bundle?.dsseEnvelope?.payload
    if (!payload)
      throw new Error(`${packageName} has no SLSA provenance payload`)
    const statement = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf8'),
    ) as {
      _type?: string
      predicateType?: string
      subject?: Array<{ name?: string; digest?: { sha512?: string } }>
      predicate?: {
        buildDefinition?: {
          buildType?: string
          externalParameters?: {
            workflow?: {
              repository?: string
              ref?: string
              path?: string
            }
          }
          resolvedDependencies?: Array<{
            uri?: string
            digest?: { gitCommit?: string }
          }>
        }
        runDetails?: { builder?: { id?: string } }
      }
    }
    const expectedSubject = `pkg:npm/${packageName.startsWith('@') ? `%40${packageName.slice(1)}` : packageName}@${uiVersion}`
    const subject = statement.subject?.[0]
    if (
      statement._type !== 'https://in-toto.io/Statement/v1' ||
      statement.predicateType !== 'https://slsa.dev/provenance/v1' ||
      statement.subject?.length !== 1 ||
      subject?.name !== expectedSubject ||
      subject.digest?.sha512 !== integritySha512Hex(lockEntry.integrity)
    ) {
      throw new Error(
        `${packageName} SLSA subject does not match the published tarball integrity`,
      )
    }
    const build = statement.predicate?.buildDefinition
    const workflow = build?.externalParameters?.workflow
    const expectedRef = `refs/tags/v${uiVersion}`
    const expectedWorkflowPath = '.github/workflows/publish.yml'
    const expectedSourceUri = `git+${goldenContract.source.repository}@${expectedRef}`
    const sourceDependency = build?.resolvedDependencies?.find(
      dependency => dependency.uri === expectedSourceUri,
    )
    if (
      build?.buildType !==
        'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1' ||
      workflow?.repository !== goldenContract.source.repository ||
      workflow.ref !== expectedRef ||
      workflow.path !== expectedWorkflowPath ||
      sourceDependency?.digest?.gitCommit !== goldenContract.source.commit ||
      statement.predicate?.runDetails?.builder?.id !==
        'https://github.com/actions/runner/github-hosted'
    ) {
      throw new Error(
        `${packageName} SLSA provenance does not match the frozen Golden workflow/source`,
      )
    }
    const verifier = await createVerifier({
      certificateIssuer: 'https://token.actions.githubusercontent.com',
      certificateIdentityURI: `^${escapeRegExp(
        `${goldenContract.source.repository}/${expectedWorkflowPath}@${expectedRef}`,
      )}$`,
      certificateOIDs: {
        '1.3.6.1.4.1.57264.1.3': goldenContract.source.commit,
        '1.3.6.1.4.1.57264.1.5': 'baicie/zeus-ui',
        '1.3.6.1.4.1.57264.1.6': expectedRef,
      },
    })
    try {
      verifier.verify(slsa.bundle as Parameters<typeof verifier.verify>[0])
    } catch (error) {
      throw new Error(
        `${packageName} SLSA attestation signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    /*
     * Keep the source dependency bound to the exact URI. Looking for any
     * dependency with a gitCommit would allow a transitive dependency to
     * satisfy the source check accidentally.
     */
    if (!sourceDependency) {
      throw new Error(
        `${packageName} SLSA provenance is missing the exact Zeus UI source URI`,
      )
    }
    const group = goldenContract.groups.find(
      entry => entry.package === packageName,
    )
    if (!group)
      throw new Error(`${packageName} is missing from the Golden contract`)
    const manifestPath = path.join(
      path.dirname(packageJsonPath),
      'dist/zeus.components.json',
    )
    verifyGoldenComponentManifest(
      fs.readFileSync(manifestPath, 'utf8'),
      packageName,
      group.manifestSha256,
    )
    const sourceUrl = `${goldenContract.source.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${goldenContract.source.commit}/${group.sourceFile}`
    const sourceResponse = await fetchWithRetry(
      sourceUrl,
      `${packageName} source`,
    )
    if (!sourceResponse.ok) {
      throw new Error(
        `${packageName} source snapshot request failed: ${sourceResponse.status}`,
      )
    }
    const sourceHash = createHash('sha256')
      .update(Buffer.from(await sourceResponse.arrayBuffer()))
      .digest('hex')
    if (sourceHash !== group.sourceSha256) {
      throw new Error(
        `${packageName} source differs from the frozen Golden contract`,
      )
    }
    supplyChainEvidence.push({
      consumer,
      package: packageName,
      version: uiVersion,
      registry,
      tarball: lockEntry.resolved,
      integrity: lockEntry.integrity,
      provenance: {
        subjectSha512: subject.digest?.sha512,
        sourceRepository: goldenContract.source.repository,
        sourceCommit: goldenContract.source.commit,
        workflow: expectedWorkflowPath,
        ref: expectedRef,
        sigstoreVerified: true,
      },
      source: {
        file: group.sourceFile,
        sha256: sourceHash,
        contractSha256: group.sourceSha256,
      },
      status: 'verified',
    })
  }
}

function verifyFrameworkDependencies(
  lock: {
    packages?: Record<
      string,
      { version?: string; resolved?: string; integrity?: string }
    >
  },
  project: string,
  consumer: string,
): void {
  for (const packageName of [
    '@zeus-js/zeus',
    '@zeus-js/runtime-dom',
  ] as const) {
    const lockEntry = lock.packages?.[`node_modules/${packageName}`]
    if (!lockEntry?.integrity || !lockEntry.resolved) {
      throw new Error(
        `${packageName} is missing a registry tarball and integrity in package-lock.json`,
      )
    }
    if (lockEntry.version !== frameworkVersion) {
      throw new Error(
        `${packageName} resolved to ${lockEntry.version}, expected ${frameworkVersion}`,
      )
    }
    const registryIntegrity = execFileSync(
      'npm',
      [
        'view',
        `${packageName}@${frameworkVersion}`,
        'dist.integrity',
        '--json',
        '--registry',
        registry,
      ],
      { cwd: project, encoding: 'utf8' },
    )
      .trim()
      .replace(/^"|"$/g, '')
    if (registryIntegrity !== lockEntry.integrity) {
      throw new Error(
        `${packageName} package-lock integrity does not match npm dist.integrity`,
      )
    }
    const expectedTarball = `/${packageName}/-/${packageName.split('/').pop()}-${frameworkVersion}.tgz`
    if (!lockEntry.resolved.includes(expectedTarball)) {
      throw new Error(
        `${packageName} was not installed from its registry tarball`,
      )
    }
    supplyChainEvidence.push({
      consumer,
      package: packageName,
      version: frameworkVersion,
      registry,
      tarball: lockEntry.resolved,
      integrity: lockEntry.integrity,
      status: 'verified',
    })
  }
}

function buildProject(project: string, consumer: string): void {
  execFileSync('npx', ['vite', 'build'], { cwd: project, stdio: 'inherit' })
  void consumer
}

function verifySsrImports(project: string, consumer: string): void {
  const entries = packages.map(packageName => {
    const entry =
      consumer === 'native'
        ? 'wc'
        : consumer.startsWith('react')
          ? 'react'
          : 'vue'
    return `${packageName}/${entry}`
  })
  const source = `
    import assert from 'node:assert/strict'
    assert.equal(typeof HTMLElement, 'undefined')
    assert.equal(typeof customElements, 'undefined')
    assert.equal(typeof document, 'undefined')
    const entries = ${JSON.stringify(entries)}
    for (const entry of entries) await import(entry)
    assert.equal(typeof HTMLElement, 'undefined')
    assert.equal(typeof customElements, 'undefined')
    assert.equal(typeof document, 'undefined')
  `
  try {
    execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: project,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    ssrEvidence.push({
      consumer,
      entries,
      status: 'verified',
      domGlobals: 'absent',
    })
  } catch (error) {
    ssrEvidence.push({
      consumer,
      entries,
      status: 'failed',
      error: String(error),
    })
    throw new Error(`SSR imports failed for ${consumer}: ${String(error)}`)
  }
}

async function runBrowser(
  project: string,
  consumer: string,
  browserName: string,
): Promise<Record<string, unknown>> {
  const browserType = browserTypes[browserName]
  const server = await startPreview(project)
  let browser
  try {
    browser = await browserType.launch({
      headless: true,
      ...(browserName === 'chromium' ? { channel: 'chromium' } : {}),
    })
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(server.url)
    await page.waitForFunction(
      () => (window as Window & { goldenResult?: unknown }).goldenResult,
      undefined,
      { timeout: 30_000 },
    )
    const result = await page.evaluate(
      () => (window as Window & { goldenResult?: unknown }).goldenResult,
    )
    const passed =
      typeof result === 'object' &&
      result !== null &&
      'passed' in result &&
      result.passed === true
    if (!passed || errors.length) {
      return {
        consumer,
        browser: browserName,
        status: 'failed',
        result,
        errors,
      }
    }
    return { consumer, browser: browserName, status: 'passed', result }
  } catch (error) {
    return {
      consumer,
      browser: browserName,
      status: 'failed',
      error: String(error),
    }
  } finally {
    await browser?.close()
    server.close()
  }
}

async function startPreview(project: string): Promise<{
  url: string
  close: () => void
}> {
  const { preview } = await import(
    pathToFileURL(path.join(project, 'node_modules/vite/dist/node/index.js'))
      .href
  )
  const server = await preview({
    root: project,
    preview: { host: '127.0.0.1', port: 0 },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string')
    throw new Error('Vite preview did not expose a port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => server.httpServer.close(),
  }
}

function browserSource(consumer: string): string {
  return `
const waitFor = async (predicate, message) => {
  const deadline = performance.now() + 10000
  while (performance.now() < deadline) {
    const value = predicate()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(message)
}
const assertions = []
const check = async (name, callback, kind = 'required') => {
  try {
    const details = await callback()
    assertions.push({ name, status: 'passed', kind, ...(details === undefined ? {} : { details }) })
  } catch (error) {
    assertions.push({ name, status: 'failed', kind, error: String(error.stack || error) })
  }
}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const tick = () => new Promise(resolve => setTimeout(resolve, 20))
async function run() {
  const app = document.querySelector('#app')
  const wrapperEvents = { pressCount: 0, lastValue: undefined, open: undefined }
  let vueValue
  let vueOpen
  const tags = ['zw-button', 'zw-input', 'zw-dialog', 'zw-dialog-trigger', 'zw-dialog-content', 'zw-dialog-title', 'zw-dialog-description', 'zw-dialog-close', 'zw-data-grid']
  if (${JSON.stringify(consumer)} === 'native') {
    const modules = await Promise.all([
      import('@zeus-web/button/wc'), import('@zeus-web/input/wc'),
      import('@zeus-web/dialog/wc'), import('@zeus-web/data-grid/wc'),
    ])
    for (const module of modules) module.defineCustomElements()
    for (const tag of tags) await customElements.whenDefined(tag)
    const button = document.createElement('zw-button')
    button.innerHTML = '<span slot="prefix">P</span>Golden<span slot="suffix">S</span>'
    button.setAttribute('aria-label', 'Golden button')
    let presses = 0
    button.addEventListener('press', () => presses++)
    app.append(button)
    const input = document.createElement('zw-input')
    input.defaultValue = 'before'
    input.required = true
    app.append(input)
    const dialog = document.createElement('zw-dialog')
    dialog.innerHTML = '<zw-dialog-trigger>Open</zw-dialog-trigger><zw-dialog-content><zw-dialog-title>Title</zw-dialog-title><zw-dialog-description>Description</zw-dialog-description><button>Inside</button><zw-dialog-close>Close</zw-dialog-close></zw-dialog-content>'
    app.append(dialog)
    const grid = document.createElement('zw-data-grid')
    grid.rows = Array.from({ length: 120 }, (_, index) => ({ id: 'row-' + index, name: 'Row ' + index }))
    grid.columns = [{ id: 'name', field: 'name', header: 'Name', sortable: true, resizable: true }]
    grid.virtual = true; grid.selectionMode = 'multiple'; grid.resizable = true
    grid.style.cssText = 'display:block;height:160px;width:320px'
    app.append(grid)
  } else if (${JSON.stringify(consumer)}.startsWith('react')) {
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const [{ Button }, { Input }, dialog, { DataGrid }] = await Promise.all([
      import('@zeus-web/button/react'), import('@zeus-web/input/react'),
      import('@zeus-web/dialog/react'), import('@zeus-web/data-grid/react'),
    ])
    const root = createRoot(app)
    root.render(React.createElement('div', null,
      React.createElement(Button, { onPress: () => wrapperEvents.pressCount++, 'aria-label': 'Golden button' }, React.createElement('span', { slot: 'prefix' }, 'P'), 'Golden', React.createElement('span', { slot: 'suffix' }, 'S')),
      React.createElement(Input, { defaultValue: 'before', required: true, 'aria-label': 'Golden input', onValueChange: event => { wrapperEvents.lastValue = event.detail.value } }),
      React.createElement(dialog.Dialog, { onOpenChange: event => { wrapperEvents.open = event.detail.open } },
        React.createElement(dialog.DialogTrigger, null, 'Open'),
        React.createElement(dialog.DialogContent, null, React.createElement(dialog.DialogTitle, null, 'Title'), React.createElement(dialog.DialogDescription, null, 'Description'), React.createElement('button', null, 'Inside'), React.createElement(dialog.DialogClose, null, 'Close')),
      ),
      React.createElement(DataGrid, { rows: Array.from({ length: 120 }, (_, index) => ({ id: 'row-' + index, name: 'Row ' + index })), columns: [{ id: 'name', field: 'name', header: 'Name', sortable: true, resizable: true }], virtual: true, selectionMode: 'multiple', resizable: true, style: { display: 'block', height: 160, width: 320 } }),
    ))
  } else {
    const { createApp, h, nextTick, ref } = await import('vue')
    const [{ Button }, { Input }, dialog, { DataGrid }] = await Promise.all([
      import('@zeus-web/button/vue'), import('@zeus-web/input/vue'),
      import('@zeus-web/dialog/vue'), import('@zeus-web/data-grid/vue'),
    ])
    vueValue = ref('before')
    vueOpen = ref(false)
    const vueApp = createApp({ render: () => h('div', null, [
      h(Button, { 'aria-label': 'Golden button', onPress: () => wrapperEvents.pressCount++ }, { default: () => 'Golden', prefix: () => 'P', suffix: () => 'S' }),
      h(Input, { value: vueValue.value, 'onUpdate:value': value => { vueValue.value = value }, required: true, 'aria-label': 'Golden input' }),
      h(dialog.Dialog, { open: vueOpen.value, 'onUpdate:open': open => { vueOpen.value = open } }, { default: () => [h(dialog.DialogTrigger, null, { default: () => 'Open' }), h(dialog.DialogContent, null, { default: () => [h(dialog.DialogTitle, null, { default: () => 'Title' }), h(dialog.DialogDescription, null, { default: () => 'Description' }), h('button', null, 'Inside'), h(dialog.DialogClose, null, { default: () => 'Close' })] })] }),
      h(DataGrid, { rows: Array.from({ length: 120 }, (_, index) => ({ id: 'row-' + index, name: 'Row ' + index })), columns: [{ id: 'name', field: 'name', header: 'Name', sortable: true, resizable: true }], virtual: true, selectionMode: 'multiple', resizable: true, style: 'display:block;height:160px;width:320px' }),
    ]) })
    vueApp.mount(app); await nextTick()
  }
  await waitFor(() => app.querySelector('zw-button button') && app.querySelector('zw-input input') && app.querySelector('zw-data-grid [data-slot="data-grid-cell"]'), 'Golden components did not mount')
  const button = app.querySelector('zw-button')
  const input = app.querySelector('zw-input')
  const dialog = app.querySelector('zw-dialog')
  const grid = app.querySelector('zw-data-grid')
  const buttonControl = button.querySelector('button')
  const inputControl = input.querySelector('input')
  const dialogTrigger = dialog.querySelector('zw-dialog-trigger button')
  const dialogContent = dialog.querySelector('[data-slot="dialog-content"] > [role="dialog"]')
  const dialogClose = dialog.querySelector('zw-dialog-close button')
  const rows = Array.from({ length: 120 }, (_, index) => ({ id: 'row-' + index, name: 'Row ' + index }))

  await check('disabled/loading prevents press', async () => {
    let count = 0; button.addEventListener('press', () => count++)
    button.disabled = true; buttonControl.click(); button.loading = true; buttonControl.click(); button.disabled = false; button.loading = false
    await tick(); assert(count === 0, 'disabled/loading dispatched press')
  })
  await check('one press carries detail.nativeEvent', async () => {
    let detail; let count = 0; button.addEventListener('press', event => { count++; detail = event.detail })
    buttonControl.click(); await waitFor(() => detail, 'press event missing'); await tick(); assert(count === 1, 'one click did not dispatch exactly one press'); assert(detail.nativeEvent instanceof MouseEvent, 'nativeEvent is not MouseEvent'); if (${JSON.stringify(consumer)} !== 'native') assert(wrapperEvents.pressCount === 1, 'framework wrapper did not receive one press')
  })
  await check('default/prefix/suffix projection', () => {
    assert(button.querySelector('[data-slot="button-prefix"]').textContent.includes('P'), 'prefix missing'); assert(button.querySelector('[data-slot="button-label"]').textContent.includes('Golden'), 'default slot missing'); assert(button.querySelector('[data-slot="button-suffix"]').textContent.includes('S'), 'suffix missing')
  })
  await check('focus/blur/click after ready', async () => {
    button.focus(); assert(document.activeElement === buttonControl, 'focus method failed'); button.blur(); assert(document.activeElement !== buttonControl, 'blur method failed'); const before = document.querySelectorAll('zw-button').length; button.click(); await tick(); assert(document.querySelectorAll('zw-button').length === before, 'click changed DOM')
  })
  await check('runtime detach/reconnect cleanup', async () => {
    const parent = button.parentElement; let count = 0; button.addEventListener('press', () => count++); parent.removeChild(button); await tick(); parent.append(button); await waitFor(() => button.querySelector('button'), 'button did not reconnect'); button.querySelector('button').click(); await tick(); assert(count === 1, 'reconnect duplicated listener')
  })

  await check('value and defaultValue precedence', async () => {
    assert(inputControl.value === 'before', 'defaultValue did not initialize'); input.value = 'controlled'; await tick(); assert(inputControl.value === 'controlled', 'value did not control native input')
  })
  await check('formatter is passed as function property and runs on input only', async () => {
    let calls = 0; const formatter = value => { calls++; return value.trimStart() }; input.formatter = formatter; await tick(); assert(calls === 0, 'formatter ran during mount/update'); inputControl.value = '  Ada'; inputControl.dispatchEvent(new InputEvent('input', { bubbles: true })); await tick(); assert(calls === 1 && inputControl.value === 'Ada', 'formatter did not run on input only')
  })
  await check('value-change carries detail.value', async () => {
    let detail; input.addEventListener('value-change', event => { detail = event.detail }, { once: true }); inputControl.value = 'Grace'; inputControl.dispatchEvent(new InputEvent('input', { bubbles: true })); await waitFor(() => detail, 'value-change missing'); assert(detail.value === 'Grace' && detail.nativeEvent instanceof Event, 'value-change detail mismatch'); if (${JSON.stringify(consumer)} === 'vue3') assert(vueValue.value === 'Grace', 'Vue v-model:value did not receive value-change'); if (${JSON.stringify(consumer)}.startsWith('react')) assert(wrapperEvents.lastValue === 'Grace', 'React onValueChange did not receive value-change')
  })
  await check('focus-change carries detail.focused', async () => {
    const values = []; input.addEventListener('focus-change', event => values.push(event.detail), { once: false }); inputControl.focus(); inputControl.blur(); await tick(); assert(values.some(value => value.focused === true && value.nativeEvent instanceof FocusEvent) && values.some(value => value.focused === false), 'focus-change detail mismatch')
  })
  await check('required validity and focus on the rendered control', async () => {
    inputControl.value = ''; assert(inputControl.required && !inputControl.checkValidity(), 'required validity missing'); inputControl.value = 'Ada'; assert(inputControl.checkValidity(), 'valid control did not become valid'); input.focus(); assert(document.activeElement === inputControl, 'input focus missing')
  })

  await check('open-change carries detail.open', async () => {
    let detail; dialog.addEventListener('open-change', event => { detail = event.detail }, { once: true }); dialogTrigger.click(); await waitFor(() => detail, 'open-change missing'); assert(detail.open === true, 'open-change did not report open'); if (${JSON.stringify(consumer)} === 'vue3') assert(vueOpen.value === true, 'Vue v-model:open did not receive open-change'); if (${JSON.stringify(consumer)}.startsWith('react')) assert(wrapperEvents.open === true, 'React onOpenChange did not receive open-change')
  })
  await check('trigger opens and close/Escape closes', async () => {
    assert(dialog.open === true, 'trigger did not open'); dialogClose.click(); await tick(); assert(dialog.open === false, 'close did not close'); dialogTrigger.click(); await tick(); dialogContent.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick(); assert(dialog.open === false, 'Escape did not close')
  })
  await check('dialog/title/description relationships', () => {
    assert(dialogContent.getAttribute('role') === 'dialog' && dialogContent.getAttribute('aria-labelledby') === dialog.querySelector('zw-dialog-title').id && dialogContent.getAttribute('aria-describedby') === dialog.querySelector('zw-dialog-description').id, 'dialog ARIA relationships missing')
  })
  await check('modal Tab and Shift+Tab trap', async () => {
    dialogTrigger.click(); await tick(); const inside = dialog.querySelector('zw-dialog-content button'); dialogClose.focus(); dialogContent.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await tick(); assert(document.activeElement === inside, 'Tab did not wrap from the last focusable element'); inside.focus(); dialogContent.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })); await tick(); assert(document.activeElement === dialogClose, 'Shift+Tab did not wrap from the first focusable element')
  })
  await check('close restores trigger focus', async () => { dialogClose.click(); await new Promise(resolve => setTimeout(resolve, 30)); assert(document.activeElement === dialogTrigger, 'close did not restore trigger focus') })
  await check('pending focus timers do not target detached nodes', async () => { dialogTrigger.click(); dialog.remove(); await new Promise(resolve => setTimeout(resolve, 30)); assert(!document.body.contains(dialog), 'detached dialog remained connected')
  })

  await check('rows/columns/selectedKeys pass through DOM properties', async () => { grid.rows = rows; grid.columns = [{ id: 'name', field: 'name', header: 'Name', sortable: true, resizable: true }]; grid.selectedKeys = ['row-1']; await tick(); assert(grid.rows === rows && grid.columns[0].id === 'name' && grid.selectedKeys[0] === 'row-1', 'grid controlled properties lost') })
  await check('selection/sort/active-cell events preserve source detail', async () => { let selection; let sort; let active; grid.addEventListener('selection-change', event => { selection = event.detail }); grid.addEventListener('sort-change', event => { sort = event.detail }); grid.addEventListener('active-cell-change', event => { active = event.detail }); grid.selectedKeys = undefined; grid.querySelector('[data-slot="data-grid-row"][data-row-key="row-0"]').click(); grid.querySelector('[data-slot="data-grid-header-cell"][data-column-id="name"]').click(); grid.setActiveCell('row-1', 'name', new Event('golden-test')); await tick(); assert(selection?.selection?.keys?.includes('row-0') && selection.row?.key === 'row-0', 'selection-change did not identify selected row'); assert(sort?.sort?.columnId === 'name' && sort.column.id === 'name', 'sort-change did not identify sorted column'); assert(active?.activeCell?.rowKey === 'row-1' && active.nativeEvent?.type === 'golden-test', 'active-cell-change payload mismatch'); return { selection: selection.selection, sort: sort.sort, activeCell: active.activeCell } })
  await check('same-key data updates preserve current row behavior', async () => { const updatedRows = rows.map(row => row.id === 'row-0' ? { ...row, name: 'Updated' } : row); grid.setRows(updatedRows); await waitFor(() => grid.getRows().some(row => row.key === 'row-0' && row.data.name === 'Updated'), 'same-key row model did not update'); await waitFor(() => grid.querySelector('[data-slot="data-grid-row"][data-row-key="row-0"] [data-slot="data-grid-cell"]')?.textContent.includes('Updated'), 'same-key row did not update in the DOM'); return { rowKey: 'row-0', updatedValue: 'Updated' } })
  await check('virtual viewport keeps bounded rendered nodes', async () => { const viewport = grid.querySelector('[data-slot="data-grid-viewport"]'); viewport.style.cssText = 'display:block;height:160px;width:320px;overflow:auto'; grid.refreshViewport(); await tick(); const rendered = grid.querySelectorAll('[data-slot="data-grid-row"]').length; assert(rendered > 0 && rendered < rows.length, 'virtual viewport rendered all rows'); return { viewportHeight: viewport.clientHeight, renderedRows: rendered, totalRows: rows.length } })
  await check('keyboard navigation/resize/scroll preserves active cell focus', async () => { const viewport = grid.querySelector('[data-slot="data-grid-viewport"]'); viewport.style.cssText = 'display:block;height:160px;width:320px;overflow:auto'; grid.refreshViewport(); await tick(); const firstCell = grid.querySelector('[data-slot="data-grid-cell"]'); assert(firstCell, 'virtual viewport did not render a focusable cell'); const initialActiveRow = grid.getActiveCell()?.rowKey; firstCell.focus(); firstCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); await tick(); const movedActiveRow = grid.getActiveCell()?.rowKey; assert(movedActiveRow !== undefined && movedActiveRow !== initialActiveRow, 'ArrowDown did not move the active row'); grid.focusCell('row-20', 'name'); await tick(); assert(grid.getActiveCell()?.rowKey === 'row-20', 'focusCell did not set the requested active cell'); grid.resizeColumn('name', 200, new Event('resize')); assert(grid.getColumnWidths().name === 200, 'resizeColumn did not update column width'); grid.scrollToIndex(20); await tick(); assert(grid.getRange().start <= 20 && grid.getRange().end >= 20, 'scrollToIndex did not bring row 20 into range'); grid.scrollToOffset(80); return { activeCell: grid.getActiveCell(), columnWidth: grid.getColumnWidths().name, range: grid.getRange() } })
  await check('large dataset performance records an informational duration', async () => { const start = performance.now(); grid.setRows(Array.from({ length: 1000 }, (_, index) => ({ id: 'perf-' + index, name: 'Perf ' + index }))); await waitFor(() => grid.getRows().length === 1000, 'large dataset model did not update'); const elapsedMs = performance.now() - start; assert(Number.isFinite(elapsedMs) && elapsedMs >= 0, 'performance measurement missing'); grid.setRows(rows); await waitFor(() => grid.getRows().length === rows.length, 'original dataset was not restored'); return { rowCount: 1000, elapsedMs } }, 'observation')

  return { passed: assertions.every(item => item.status === 'passed'), consumer: ${JSON.stringify(consumer)}, assertions }
}
window.goldenResult = run().catch(error => ({ passed: false, error: String(error.stack || error) }))
`
}

function verifyBrowserAssertions(
  result: Record<string, unknown>,
  groups: Array<{ id: string; requiredBrowserAssertions: string[] }>,
): void {
  const value = result.result
  if (!value || typeof value !== 'object') {
    throw new Error(
      `Golden browser run returned no result for ${String(result.consumer)}/${String(result.browser)}`,
    )
  }
  const assertions =
    (value as { assertions?: Array<{ name?: string; status?: string }> })
      .assertions ?? []
  const expected = groups.flatMap(group => group.requiredBrowserAssertions)
  const names = new Set(assertions.map(assertion => assertion.name))
  const missing = expected.filter(name => !names.has(name))
  const failed = assertions.filter(assertion => assertion.status !== 'passed')
  if (missing.length || failed.length) {
    throw new Error(
      `Golden assertions failed for ${String(result.consumer)}/${String(result.browser)}: ${JSON.stringify({ missing, failed })}`,
    )
  }
}

function integritySha512Hex(integrity: string): string {
  if (!integrity.startsWith('sha512-'))
    throw new Error('npm dist.integrity must use sha512')
  const digest = Buffer.from(integrity.slice('sha512-'.length), 'base64')
  if (digest.length !== 64)
    throw new Error('npm dist.integrity has an invalid sha512')
  return digest.toString('hex')
}

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response
      }
      lastError = new Error(`${label} request failed: ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 250))
  }
  throw new Error(`${label} request failed after retries: ${String(lastError)}`)
}

function requireResolve(file: string): string {
  if (!fs.existsSync(file)) throw new Error(`Cannot resolve ${file}`)
  return file
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
