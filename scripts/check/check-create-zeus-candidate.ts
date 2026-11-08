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
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  CANDIDATE_TEMPLATES,
  applyCandidateManifest,
  assertCandidateInputsBuilt,
  assertCurrentNativeBinary,
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
const packageRoot = path.join(root, 'packages/devtools/create-zeus')
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
  if (options.candidates) {
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
    for (const name of coreCandidateNames) {
      const entry = entries.get(name)
      if (!entry?.file || !entry.sha256 || !fs.existsSync(entry.file)) {
        throw new Error(`candidate archive is missing for ${name}`)
      }
      const digest = createHash('sha256')
        .update(fs.readFileSync(entry.file))
        .digest('hex')
      if (digest !== entry.sha256) {
        throw new Error(`candidate archive digest mismatch for ${name}`)
      }
      if (entry.version !== corePackages.get(name)!.version) {
        throw new Error(`candidate archive version mismatch for ${name}`)
      }
      coreCandidates.set(name, toFileSpec(entry.file))
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
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(applied.manifest, null, 2)}\n`,
    )

    try {
      run(
        'pnpm',
        [
          'install',
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
        passed: true,
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

function parseOptions(args: string[]): {
  uiRoot?: string
  registry?: string
  templates?: string[]
  candidates?: string
  requirePinMatch?: boolean
  keepWork?: boolean
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
    },
  })
  return {
    ...(values['ui-root'] ? { uiRoot: values['ui-root'] } : {}),
    ...(values.registry ? { registry: values.registry } : {}),
    ...(values.template ? { templates: values.template } : {}),
    ...(values.candidates ? { candidates: values.candidates } : {}),
    requirePinMatch: values['require-pin-match'] === true,
    keepWork: values['keep-work'] === true,
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
  })
}
