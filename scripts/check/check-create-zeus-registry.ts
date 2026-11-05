import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  chromium,
  expect,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from '@playwright/test'

import {
  assertComponentLibraryOutputs,
  createZeusTemplates,
} from './check-create-zeus'
import {
  checkTemplateDependencies,
  getTemplateVersionPolicyErrors,
  readTemplateRequirements,
} from './check-template-dependencies'
import { scaffold } from '../../packages/devtools/create-zeus/src/scaffold'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { values } = parseArgs({
  options: {
    'framework-version': { type: 'string' },
    'vite-plugin-version': { type: 'string' },
    registry: { type: 'string' },
    template: { type: 'string', multiple: true },
    browsers: { type: 'string' },
  },
})
const registry = values.registry ?? 'https://registry.npmjs.org'
const browserTypes: Record<string, BrowserType> = {
  chromium,
  firefox,
  webkit,
}
const browsers = (values.browsers ?? 'chromium').split(',')
for (const name of browsers) {
  assert(browserTypes[name], `Unknown browser: ${name}`)
}
const selectedTemplates = values.template?.length
  ? values.template.map(template => {
      assert(
        (createZeusTemplates as readonly string[]).includes(template),
        `Unknown template: ${template}`,
      )
      return template
    })
  : createZeusTemplates
const smokeRoot = mkdtempSync(path.join(os.tmpdir(), 'zeus-create-registry-'))
const packageFiles: string[] = []
const report: Array<{
  template: string
  checks: string[]
  installed?: Record<string, { version: string; entry: string }>
}> = []
const runningBrowsers: Browser[] = []
let succeeded = false
let failure: string | undefined

try {
  for (const template of selectedTemplates) {
    const project = path.join(smokeRoot, template)
    await scaffold({
      root: project,
      projectName: `registry-${template}`,
      template,
    })
    const file = path.join(project, 'package.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    for (const dependencies of [
      manifest.dependencies,
      manifest.devDependencies,
    ]) {
      for (const name of Object.keys(dependencies ?? {})) {
        const override =
          name === '@zeus-js/vite-plugin'
            ? values['vite-plugin-version']
            : name.startsWith('@zeus-js/')
              ? values['framework-version']
              : undefined
        if (override) dependencies[name] = override
      }
    }
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
    packageFiles.push(file)
  }

  const errors = getTemplateVersionPolicyErrors(
    readTemplateRequirements(packageFiles),
  )
  assert.equal(errors.length, 0, errors.join('\n'))
  await checkTemplateDependencies(packageFiles, registry)
  for (const name of browsers) {
    runningBrowsers.push(
      await browserTypes[name].launch({
        headless: true,
        ...(name === 'chromium' && !process.env.ZEUS_CREATE_BROWSER_CHANNEL
          ? { channel: 'chromium' }
          : {}),
      }),
    )
  }

  for (const template of selectedTemplates) {
    const project = path.join(smokeRoot, template)
    const result: (typeof report)[number] = { template, checks: [] }
    report.push(result)
    run(project, ['install', '--ignore-workspace', '--registry', registry])
    result.installed = inspectInstalledDependencies(project)
    result.checks.push('isolated registry install')
    run(project, ['check'])
    run(project, ['build'])
    result.checks.push('typecheck', 'production build')
    const manifest = JSON.parse(
      readFileSync(path.join(project, 'package.json'), 'utf8'),
    )
    if (manifest.scripts?.test) {
      run(project, ['test'])
      result.checks.push('template tests')
    }
    if (template === 'component-library-ts') {
      assertComponentLibraryOutputs(project)
      writeFileSync(
        path.join(project, 'dist/index.html'),
        '<!doctype html><z-greeting name="World">Registry slot</z-greeting><script type="module" src="./wc/auto.js"></script>',
      )
    }
    for (const mode of ['dev', 'preview'] as const) {
      for (const [index, name] of browsers.entries()) {
        await checkBrowser(project, template, mode, runningBrowsers[index])
        result.checks.push(`${mode} browser interaction (${name})`)
      }
    }
    console.log(`[create-zeus registry] ${template}: all checks passed`)
  }
  succeeded = true
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  try {
    for (const running of runningBrowsers) await running.close()
  } catch (error) {
    const cleanupFailure = `Browser cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    failure = failure ? `${failure}\n${cleanupFailure}` : cleanupFailure
    succeeded = false
    process.exitCode = 1
  }
  const output = path.join(root, 'temp/create-zeus-registry')
  mkdirSync(output, { recursive: true })
  writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        registry,
        browsers,
        fixtureRoot: smokeRoot,
        scaffoldSource:
          'workspace candidate source; dependencies from registry',
        nodeVersion: process.version,
        overrides: values,
        requirements: readTemplateRequirements(packageFiles),
        passed: succeeded,
        failure,
        templates: report,
      },
      null,
      2,
    )}\n`,
  )
  if (succeeded) rmSync(smokeRoot, { recursive: true, force: true })
  else console.error(`Failed registry fixtures retained at ${smokeRoot}`)
}

function run(cwd: string, args: string[]): void {
  execFileSync('pnpm', args, {
    cwd,
    env: fixtureEnvironment(),
    stdio: 'inherit',
  })
}

function inspectInstalledDependencies(
  project: string,
): Record<string, { version: string; entry: string }> {
  const installed: Record<string, { version: string; entry: string }> = {}
  for (const requirement of readTemplateRequirements([
    path.join(project, 'package.json'),
  ])) {
    const entry = realpathSync(
      resolveFixturePackage(project, requirement.packageName),
    )
    const relative = path.relative(root, entry)
    assert(
      relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
      `${requirement.packageName} resolved inside the source workspace: ${entry}`,
    )
    let packageRoot = path.dirname(entry)
    while (true) {
      try {
        const manifest = JSON.parse(
          readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
        )
        if (manifest.name === requirement.packageName) {
          assert.equal(manifest.version, requirement.range)
          installed[requirement.packageName] = {
            version: manifest.version,
            entry,
          }
          break
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      const parent = path.dirname(packageRoot)
      assert.notEqual(
        parent,
        packageRoot,
        `Package metadata missing for ${entry}`,
      )
      packageRoot = parent
    }
  }
  return installed
}

function fixtureEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CI: 'true' }
  // The verifier runs under tsx with workspace aliases. Fixture processes must
  // resolve their own registry installation without inherited module loaders.
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  delete env.TSX_TSCONFIG_PATH
  return env
}

function resolveFixturePackage(project: string, name: string): string {
  return execFileSync(
    process.execPath,
    ['-e', 'process.stdout.write(require.resolve(process.argv[1]))', name],
    { cwd: project, env: fixtureEnvironment(), encoding: 'utf8' },
  )
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  return address.port
}

async function checkBrowser(
  project: string,
  template: string,
  mode: 'dev' | 'preview',
  browser: Browser,
): Promise<void> {
  const vite = path.join(
    path.dirname(resolveFixturePackage(project, 'vite/package.json')),
    'bin/vite.js',
  )
  const port = await freePort()
  const args = mode === 'preview' ? ['preview'] : []
  const server = spawn(
    process.execPath,
    [
      vite,
      ...args,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: project,
      env: fixtureEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  let spawnFailure: Error | undefined
  server.on('error', error => {
    spawnFailure = error
  })
  server.stdout.on('data', chunk => {
    output += String(chunk)
  })
  server.stderr.on('data', chunk => {
    output += String(chunk)
  })
  let page: Page | undefined
  const errors: string[] = []
  try {
    page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const url = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 30_000
    while (true) {
      if (spawnFailure) throw spawnFailure
      if (server.exitCode !== null) throw new Error(`Vite exited: ${output}`)
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
        if (response.ok) break
      } catch {
        /* Wait for the Vite listener. */
      }
      assert(Date.now() < deadline, `Vite startup timed out: ${output}`)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await page.goto(url)
    if (template === 'component-library-ts') {
      const greeting = page.locator('z-greeting')
      await expect(greeting.locator('[part="label"]')).toHaveText(
        'Hello, World!',
      )
      await greeting.evaluate(element =>
        element.setAttribute('name', 'Registry'),
      )
      await expect(greeting.locator('[part="label"]')).toHaveText(
        'Hello, Registry!',
      )
      if (mode === 'preview')
        await expect(greeting).toContainText('Registry slot')
    } else if (template === 'admin-ts') {
      await expect(page.getByTestId('login-card')).toBeVisible()
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByTestId('admin-layout')).toBeVisible()
      await expect(page.getByTestId('user-ada')).toContainText('Ada Lovelace')
      await page.getByLabel('Search users').fill('grace')
      await expect(page.getByTestId('user-ada')).toHaveCount(0)
      await expect(page.getByTestId('user-grace')).toBeVisible()
      await page.getByRole('button', { name: 'Roles' }).click()
      await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
      await page.getByRole('button', { name: 'Audit' }).click()
      await expect(
        page.getByRole('heading', { name: 'Audit log' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Sign out' }).click()
      await expect(page.getByTestId('login-card')).toBeVisible()
    } else if (template === 'webc-consumer-ts') {
      const host = page.locator('zw-button')
      await expect(host.locator('button')).toHaveText('Consume published WebC')
      await expect(page.locator('#status')).toHaveText('pressed: 0')
      await host.locator('button').click()
      await expect(page.locator('#status')).toHaveText('pressed: 1')
      await host.locator('button').click()
      await expect(page.locator('#status')).toHaveText('pressed: 2')
    } else {
      const button = page.getByRole('button')
      const prefix = template === 'application-ts' ? 'interactions' : 'count'
      await expect(button).toHaveText(new RegExp(`${prefix}:\\s*0`))
      await button.click()
      await expect(button).toHaveText(new RegExp(`${prefix}:\\s*1`))
      await button.click()
      await expect(button).toHaveText(new RegExp(`${prefix}:\\s*2`))
      if (template === 'web-component-ts')
        await expect(page.locator('z-counter')).toContainText(
          'Light DOM content',
        )
    }
    await page.waitForLoadState('networkidle')
    if (template === 'component-library-ts') {
      await expect(page.locator('z-greeting [part="label"]')).toHaveText(
        'Hello, Registry!',
      )
    } else if (template === 'admin-ts') {
      await expect(page.getByTestId('login-card')).toBeVisible()
    } else if (template === 'webc-consumer-ts') {
      await expect(page.locator('#status')).toHaveText('pressed: 2')
      await expect(page.locator('zw-button button')).toHaveText(
        'Consume published WebC',
      )
    } else {
      const prefix = template === 'application-ts' ? 'interactions' : 'count'
      await expect(page.getByRole('button')).toHaveText(
        new RegExp(`${prefix}:\\s*2`),
      )
    }
    assert.deepEqual(errors, [], `${template} ${mode} browser errors`)
  } catch (error) {
    throw new Error(
      `${template} ${mode}: ${error instanceof Error ? error.message : String(error)}\nBrowser errors: ${JSON.stringify(errors)}\nVite output: ${output.slice(-5000)}`,
    )
  } finally {
    try {
      await page?.close()
    } finally {
      await stopServer(server)
    }
  }
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (!server.pid || server.exitCode !== null || server.signalCode !== null) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    let forceExitTimeout: ReturnType<typeof setTimeout> | undefined
    const terminateTimeout = setTimeout(() => {
      server.kill('SIGKILL')
      forceExitTimeout = setTimeout(
        () => reject(new Error(`Vite process ${server.pid} did not exit`)),
        1000,
      )
    }, 5000)
    server.once('exit', () => {
      clearTimeout(terminateTimeout)
      clearTimeout(forceExitTimeout)
      resolve()
    })
    server.kill('SIGTERM')
  })
}
