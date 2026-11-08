/**
 * Installs every create-zeus scaffold from isolated candidate tarballs, not
 * from workspace links or the registry beta. Core packages and the UI
 * `@zeus-web` closure are packed from the checked-out repositories and every
 * candidate is pinned through `pnpm.overrides`.
 *
 * Usage:
 *   pnpm check:create-zeus-candidate --ui-root temp/zeus-ui
 *   pnpm check:create-zeus-candidate --ui-root temp/zeus-ui --template basic-ts
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  CANDIDATE_TEMPLATES,
  applyCandidateManifest,
  assertCandidateInputsBuilt,
  collectWorkspaceClosure,
  discoverWorkspacePackages,
  templateOutput,
  templateOutputExists,
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
  output: string
  direct: string[]
  overrides: number
  installed?: Record<string, string>
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
  assertTemplatePins(corePackages, manifests)

  const coreCandidates = new Map<string, string>()
  for (const name of coreCandidateNames) {
    coreCandidates.set(
      name,
      toFileSpec(pack(corePackages.get(name)!.directory, archives)),
    )
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
      const expectedOutput = templateOutput(template.name)
      if (!templateOutputExists(target, expectedOutput)) {
        throw new Error(`${template.name} build is missing ${expectedOutput}`)
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
        output: expectedOutput,
        direct: applied.direct,
        overrides: Object.keys(applied.overrides).length,
        installed,
        passed: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      templateResults.push({
        template: template.name,
        output: templateOutput(template.name),
        direct: applied.direct,
        overrides: Object.keys(applied.overrides).length,
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
  keepWork?: boolean
} {
  const { values } = parseArgs({
    args,
    options: {
      'ui-root': { type: 'string' },
      registry: { type: 'string' },
      template: { type: 'string', multiple: true },
      'keep-work': { type: 'boolean', default: false },
    },
  })
  return {
    ...(values['ui-root'] ? { uiRoot: values['ui-root'] } : {}),
    ...(values.registry ? { registry: values.registry } : {}),
    ...(values.template ? { templates: values.template } : {}),
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

function assertTemplatePins(
  corePackages: Map<string, { version: string; directory: string }>,
  manifests: Map<string, PackageManifest>,
): void {
  const expectedVitePlugin = corePackages.get('@zeus-js/vite-plugin')!.version
  for (const [template, manifest] of manifests) {
    for (const field of ['dependencies', 'devDependencies'] as const) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (name === '@zeus-js/vite-plugin') {
          if (version !== expectedVitePlugin) {
            throw new Error(
              `${template} ${name} ${version} != ${expectedVitePlugin}`,
            )
          }
          continue
        }
        if (!name.startsWith('@zeus-js/')) continue
        const workspacePackage = corePackages.get(name)
        if (!workspacePackage) {
          throw new Error(`${template} uses unknown Core package ${name}`)
        }
        if (version !== workspacePackage.version) {
          throw new Error(
            `${template} ${name} ${version} != ${workspacePackage.version}`,
          )
        }
      }
    }
  }
}

function assertCurrentNativeBinary(coreRoot: string): void {
  const platformPackage =
    process.platform === 'darwin'
      ? `compiler-native-darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
      : process.platform === 'win32'
        ? `compiler-native-win32-${process.arch === 'arm64' ? 'arm64' : 'x64'}-msvc`
        : `compiler-native-linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}-gnu`
  const directory = path.join(coreRoot, 'packages/core', platformPackage)
  const binaries = fs
    .readdirSync(directory)
    .filter(file => file.endsWith('.node'))
  if (binaries.length === 0) {
    throw new Error(
      `native binary for ${process.platform}/${process.arch} is missing from ${directory}; build it with native:build:platform`,
    )
  }
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
