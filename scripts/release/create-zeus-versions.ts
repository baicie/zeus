/**
 * Keeps create-zeus template pins aligned with the release candidate.
 *
 * `@zeus-js/*` packages (except the independently versioned vite-plugin) follow
 * the Core version. `@zeus-web/*` pins follow ZEUS_UI_VERSION when the release
 * manager supplies the paired UI candidate. `--check` is wired into precheck so
 * stale template pins cannot silently ship.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const TEMPLATES = path.join('packages', 'devtools', 'create-zeus', 'templates')
const VITE_PLUGIN = path.join(
  'packages',
  'devtools',
  'vite-plugin',
  'package.json',
)

export interface CreateZeusVersionOptions {
  readonly root: string
  readonly coreVersion: string
  readonly uiVersion?: string
  readonly check?: boolean
}

export function syncCreateZeusVersions(
  options: CreateZeusVersionOptions,
): string[] {
  const templatesRoot = path.join(options.root, TEMPLATES)
  const vitePluginVersion = (
    JSON.parse(
      fs.readFileSync(path.join(options.root, VITE_PLUGIN), 'utf8'),
    ) as { version: string }
  ).version
  const mismatches: string[] = []
  for (const file of templateFiles(templatesRoot)) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
      string,
      unknown
    >
    let changed = false
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const dependencies = value[field]
      if (!isRecord(dependencies)) continue
      for (const [name, raw] of Object.entries(dependencies)) {
        if (typeof raw !== 'string') continue
        let expected: string | undefined
        if (name === '@zeus-js/vite-plugin') expected = vitePluginVersion
        else if (name.startsWith('@zeus-js/')) expected = options.coreVersion
        else if (name.startsWith('@zeus-web/')) expected = options.uiVersion
        if (!expected || raw === expected) continue
        mismatches.push(
          `${path.relative(options.root, file)}: ${name} ${raw} != ${expected}`,
        )
        if (!options.check) {
          dependencies[name] = expected
          changed = true
        }
      }
    }
    if (changed) {
      fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
    }
  }
  return mismatches
}

function templateFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...templateFiles(absolute))
    else if (entry.isFile() && entry.name === 'package.json')
      files.push(absolute)
  }
  return files
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function main(): void {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean', default: false },
      'core-version': { type: 'string' },
      'ui-version': { type: 'string' },
    },
  })
  const root = process.cwd()
  const coreVersion =
    values['core-version'] ??
    (
      JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
        version: string
      }
    ).version
  const uiVersion = values['ui-version'] ?? process.env.ZEUS_UI_VERSION
  const mismatches = syncCreateZeusVersions({
    root,
    coreVersion,
    ...(uiVersion ? { uiVersion } : {}),
    check: values.check === true,
  })
  if (values.check === true && mismatches.length > 0) {
    for (const mismatch of mismatches) console.error(`STALE ${mismatch}`)
    process.exitCode = 1
    return
  }
  console.log(
    `create-zeus templates ${values.check ? 'verified' : 'updated'} for ${coreVersion}${uiVersion ? ` / UI ${uiVersion}` : ''}`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
