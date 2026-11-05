import { buildWebCArtifacts } from './webc'

import type { ProjectSnapshot } from './project'

export interface PlaygroundExportFile {
  readonly path: string
  readonly content: string
}

export interface ProjectExportOptions {
  readonly packageName?: string
  readonly zeusVersion?: string
  readonly vitePluginVersion?: string
  readonly viteVersion?: string
  readonly typescriptVersion?: string
  readonly compress?: boolean
}

export interface PlaygroundExport {
  readonly packageName: string
  readonly files: readonly PlaygroundExportFile[]
  readonly fileName: string
  readonly mediaType: 'application/gzip' | 'application/x-tar'
  readonly data: Uint8Array
}

const DEFAULT_ZEUS_VERSION = '0.1.1-beta.20'
const DEFAULT_VITE_PLUGIN_VERSION = '0.0.5'
const DEFAULT_VITE_VERSION = '8.3.4'
const DEFAULT_TYPESCRIPT_VERSION = '6.0.3'
const ENTRY_PATH = 'src/__zeus_playground_entry.ts'
const encoder = new TextEncoder()

/**
 * Produces a self-contained Native app. The archive is deterministic so the
 * same project produces byte-identical evidence across repeated runs.
 */
export async function exportProject(
  snapshot: ProjectSnapshot,
  options: ProjectExportOptions = {},
): Promise<PlaygroundExport> {
  const packageName = options.packageName ?? 'zeus-playground-export'
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(packageName)) {
    throw new TypeError('Export packageName must be a valid npm package name.')
  }

  const files: PlaygroundExportFile[] = snapshot.files.map(file =>
    Object.freeze({ path: file.path, content: file.content }),
  )
  ensureUniquePath(files, ENTRY_PATH)
  const declaredDependencies: Record<string, string> = {}
  for (const dependency of snapshot.dependencies) {
    declaredDependencies[dependency.name] = dependency.version
  }
  const zeusVersion =
    declaredDependencies['@zeus-js/zeus'] ??
    options.zeusVersion ??
    DEFAULT_ZEUS_VERSION
  files.push(
    {
      path: ENTRY_PATH,
      content:
        snapshot.frameworkTarget === 'webc'
          ? createWebCExportEntry(snapshot)
          : createExportEntry(snapshot),
    },
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(packageName)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${ENTRY_PATH}"></script>
  </body>
</html>
`,
    },
    {
      path: 'package.json',
      content: `${JSON.stringify(
        {
          name: packageName,
          version: '0.0.0',
          private: true,
          type: 'module',
          packageManager: 'pnpm@10.33.4',
          scripts: {
            dev: 'vite',
            check: 'tsc --noEmit',
            build: 'vite build',
            preview: 'vite preview',
          },
          dependencies: {
            ...declaredDependencies,
            '@zeus-js/zeus': zeusVersion,
          },
          devDependencies: {
            '@zeus-js/vite-plugin':
              options.vitePluginVersion ?? DEFAULT_VITE_PLUGIN_VERSION,
            typescript: options.typescriptVersion ?? DEFAULT_TYPESCRIPT_VERSION,
            vite: options.viteVersion ?? DEFAULT_VITE_VERSION,
          },
          pnpm: {
            onlyBuiltDependencies: [],
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: 'tsconfig.json',
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            jsx: 'preserve',
            jsxImportSource: '@zeus-js/zeus',
            types: ['@zeus-js/zeus/jsx', 'vite/client'],
            skipLibCheck: true,
            noEmit: true,
          },
          include: ['src'],
        },
        null,
        2,
      )}\n`,
    },
    {
      path: 'vite.config.ts',
      content: `import zeus from '@zeus-js/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [zeus()],
})
`,
    },
    {
      path: 'README.md',
      content: createReadme(packageName, snapshot),
    },
  )
  if (snapshot.frameworkTarget === 'webc') {
    const artifacts = buildWebCArtifacts(snapshot)
    for (const artifact of artifacts.files) {
      if (artifact.path.startsWith('webc/')) {
        files.push({
          path: artifact.path.replace(/^webc\//, ''),
          content: artifact.content,
        })
      }
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path))

  const archive = createTar(files, packageName)
  const compress = options.compress ?? true
  const data = compress ? await gzip(archive) : archive
  return Object.freeze({
    packageName,
    files: Object.freeze(files.map(file => Object.freeze(file))),
    fileName: `${packageName.replace('/', '-')}.${compress ? 'tar.gz' : 'tar'}`,
    mediaType: compress ? 'application/gzip' : 'application/x-tar',
    data,
  })
}

function createWebCExportEntry(snapshot: ProjectSnapshot): string {
  const relativeEntry = relativeModulePath(ENTRY_PATH, snapshot.entryPath)
  return `import * as ComponentModule from '${relativeEntry}'

const root = document.querySelector('#root')
if (!(root instanceof Element)) {
  throw new Error('Zeus WebC export requires a #root element.')
}

// The authored module is the single Custom Element implementation. This
// mount only instantiates it; React and Vue exports consume the same class.
const definitions = Object.entries(ComponentModule).filter(
  (entry): entry is [string, CustomElementConstructor] =>
    typeof entry[1] === 'function' && 'observedAttributes' in entry[1],
)
if (definitions.length === 0) {
  throw new Error('The WebC entry must defineElement().')
}
for (const [, ElementClass] of definitions) {
  const tag = customElements.getName(ElementClass)
  if (!tag) {
    throw new Error('The WebC entry must define its Custom Element tag.')
  }
  if (!customElements.get(tag)) customElements.define(tag, ElementClass)
  const element = document.createElement(tag)
  element.textContent = 'Exported Zeus Web Component'
  root.append(element)
}
`
}

function createExportEntry(snapshot: ProjectSnapshot): string {
  const relativeEntry = relativeModulePath(ENTRY_PATH, snapshot.entryPath)
  return `import { render } from '@zeus-js/zeus'
import * as Entry from '${relativeEntry}'

type Component = () => unknown

const root = document.querySelector('#root')
if (!(root instanceof Element)) {
  throw new Error('Zeus playground export requires a #root element.')
}

// Entry modules that already call render() populate #root during import.
if (root.childNodes.length === 0) {
  const entries = Entry as Record<string, unknown>
  const component =
    [entries.default, entries.App, entries.Counter].find(
      (value): value is Component => typeof value === 'function',
    ) ??
    Object.values(entries).find(
      (value): value is Component => typeof value === 'function',
    )
  if (!component) {
    throw new Error(
      'The exported entry must default-export a component, export a component, or call render().',
    )
  }
  render(component as () => any, root)
}
`
}

function createReadme(packageName: string, snapshot: ProjectSnapshot): string {
  return `# ${packageName}

Exported from the Zeus playground.

This project preserves the original ${snapshot.files.length}-file source snapshot,
uses \`${snapshot.compilerVersion}\` as its recorded compiler version, and targets
\`${snapshot.frameworkTarget}\`.

\`\`\`sh
pnpm install --ignore-scripts
pnpm check
pnpm build
pnpm dev
\`\`\`

The generated entry auto-mounts a component when the source itself does not
call \`render()\`.
`
}

function relativeModulePath(fromFile: string, targetFile: string): string {
  const fromSegments = fromFile.split('/')
  fromSegments.pop()
  const targetSegments = targetFile.replace(/\.(?:ts|tsx)$/, '').split('/')
  let common = 0
  while (
    common < fromSegments.length &&
    common < targetSegments.length &&
    fromSegments[common] === targetSegments[common]
  ) {
    common += 1
  }
  return `${
    [
      ...Array.from({ length: fromSegments.length - common }, () => '..'),
      ...targetSegments.slice(common),
    ].join('/') || '.'
  }`.replace(/^([^.])/, './$1')
}

function ensureUniquePath(
  files: readonly PlaygroundExportFile[],
  path: string,
) {
  if (files.some(file => file.path === path)) {
    throw new Error(`Cannot generate export entry because "${path}" exists.`)
  }
}

function createTar(
  files: readonly PlaygroundExportFile[],
  packageName: string,
): Uint8Array {
  const parts: Uint8Array[] = []
  const directory = `${packageName.replace(/^@/, '').replace('/', '-')}/`
  parts.push(createHeader(directory, 0, true))
  for (const file of files) {
    const bytes = encoder.encode(file.content)
    const name = `${directory}${file.path}`
    parts.push(createHeader(name, bytes.byteLength, false), bytes)
    const padding = (512 - (bytes.byteLength % 512)) % 512
    if (padding > 0) parts.push(new Uint8Array(padding))
  }
  parts.push(new Uint8Array(1024))
  return concat(parts)
}

function createHeader(
  name: string,
  size: number,
  directory: boolean,
): Uint8Array {
  if (encoder.encode(name).byteLength > 100) {
    throw new Error(`Archive path is too long: ${name}`)
  }
  const header = new Uint8Array(512)
  writeText(header, 0, 100, name)
  writeOctal(header, 100, 8, directory ? 0o755 : 0o644)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  header[156] = directory ? 0x35 : 0x30
  writeText(header, 257, 6, 'ustar\0')
  writeText(header, 263, 2, '00')
  writeText(header, 265, 32, 'zeus')
  writeText(header, 297, 32, 'zeus')
  const checksum = header.reduce((total, value) => total + value, 0)
  writeOctal(header, 148, 8, checksum)
  return header
}

function writeText(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  target.set(encoder.encode(value).subarray(0, length), offset)
}

function writeOctal(
  target: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  const text = `${value.toString(8).padStart(length - 1, '0')}\0`
  writeText(target, offset, length, text)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error(
      'This environment cannot create gzip archives. Pass compress:false.',
    )
  }
  const stream = new Blob([new Uint8Array(bytes).buffer])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
