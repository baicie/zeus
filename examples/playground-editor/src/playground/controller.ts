import {
  compileCompilerModule,
  createWorkerCompiler,
  wasmURL,
} from '@zeus-js/compiler-wasm'
import {
  buildWebCArtifacts,
  compileProject,
  createPlaygroundPreview,
  exportProject,
  parseProjectSnapshot,
  resolveSandboxUrl,
} from '@zeus-js/playground-engine'
import { createSignal } from '@zeus-js/zeus'
import compilerWorkerUrl from '@zeus-js/compiler-wasm/worker?worker&url'

import type {
  PlaygroundCompileResult,
  PlaygroundComponentInspector,
  PlaygroundModuleHmr,
  PlaygroundProjectError,
  PlaygroundSandboxDevtools,
} from '@zeus-js/playground-engine'
import type { WorkerCompiler } from '@zeus-js/compiler-wasm'

import { PreviewController } from '../preview'
import { activeProduct, productHref, setActiveProduct } from '../products'
import { templates } from '../webc-project'
import type { PlaygroundProduct } from '../products'
import { examples, examplesFor } from './examples'
import type {
  ConsoleEntry,
  DiagnosticItem,
  PlaygroundExample,
  PlaygroundFile,
} from './model'
import {
  DEFAULT_SETTINGS,
  clearWorkspace,
  loadWorkspace,
  readSettings,
  saveWorkspace,
  writeSettings,
  type PlaygroundSettings,
} from './persistence'
import {
  createShareUrl,
  decodeShare,
  downloadShareJson,
  readShareHash,
} from './share'

export type ResultTab =
  | 'preview'
  | 'output'
  | 'console'
  | 'problems'
  | 'inspector'
  | 'devtools'
export type MobilePane = 'editor' | 'preview'

type UiSignal<T> = (() => T) & {
  readonly set: (value: T | ((previous: T) => T)) => T
  readonly update: (updater: (previous: T) => T) => T
}

function createUiSignal<T>(value: T): UiSignal<T> {
  const [get, set] = createSignal(value)
  const signal = get as UiSignal<T>
  Object.defineProperties(signal, {
    set: { value: set },
    update: { value: (updater: (previous: T) => T) => set(updater) },
  })
  return signal
}

const initialTemplate = templates[activeProduct()]
const initialSettings = readSettings()

export const product = activeProduct
export const files = createUiSignal(initialTemplate.files)
export const activePath = createUiSignal(initialTemplate.files[0]!.path)
export const currentExampleId = createUiSignal<string | undefined>(undefined)
export const autoRun = createUiSignal(initialSettings.autoRun)
export const theme = createUiSignal(initialSettings.theme)
export const fontSize = createUiSignal(initialSettings.fontSize)
export const splitPercent = createUiSignal(initialSettings.splitPercent)
export const activeTab = createUiSignal<ResultTab>(initialSettings.activeTab)
export const mobilePane = createUiSignal('editor')
export const previewMaximized = createUiSignal(false)
export const examplesOpen = createUiSignal(false)
export const busy = createUiSignal(false)
export const stale = createUiSignal(false)
export const status = createUiSignal('Ready')
export const previewStatus = createUiSignal(
  'Preview will appear after the first run.',
)
export const buildSequence = createUiSignal(0)
export const dirty = createUiSignal(false)
export const savedAt = createUiSignal<string | undefined>(undefined)
export const diagnosticItems = createUiSignal<readonly DiagnosticItem[]>([])
export const diagnosticsRaw = createUiSignal('[]')
export const consoleEntries = createUiSignal<readonly ConsoleEntry[]>([])
export const consoleFilter = createUiSignal<'all' | 'error'>('all')
export const domOutput = createUiSignal('')
export const ssrOutput = createUiSignal('')
export const webcManifest = createUiSignal('')
export const webcDeclarations = createUiSignal('')
export const webcInspector = createUiSignal<
  readonly PlaygroundComponentInspector[]
>([])
export const hmrModules = createUiSignal<
  readonly { path: string; hmr: PlaygroundModuleHmr }[]
>([])
export const devtoolsSnapshot = createUiSignal<
  PlaygroundSandboxDevtools | undefined
>(undefined)
export const buildMetrics = createUiSignal({
  compileMs: 0,
  previewMs: 0,
  domBytes: 0,
  ssrBytes: 0,
  runs: 0,
})
export const frameworkPreviewStatus = createUiSignal(
  'Compile a WebC project, then preview it in isolated React and Vue hosts.',
)
export const toast = createUiSignal<
  { readonly message: string; readonly kind: 'info' | 'error' } | undefined
>(undefined)
export const focusRequest = createUiSignal<
  | { readonly file: string; readonly line?: number; readonly nonce: number }
  | undefined
>(undefined)

const preview = new PreviewController(resolveSandboxDocumentUrl())
let previewFrame: HTMLIFrameElement | undefined
let compilerPromise: Promise<WorkerCompiler> | undefined
let previousSnapshot: ReturnType<typeof projectSnapshot> | undefined
let webcHostTag: string | undefined
let runRevision = 0
let autoRunTimer: number | undefined
let saveTimer: number | undefined
let toastTimer: number | undefined
let initialized = false
let consoleSequence = 0
let lastCompileKind: 'auto' | 'manual' | 'none' = 'none'

preview.setConsoleHandler(entries => {
  const next = entries.map(entry => ({
    id: ++consoleSequence,
    level: entry.level,
    message: entry.message,
    timestamp: entry.timestamp,
  }))
  consoleEntries.update(current => [...current, ...next].slice(-200))
})

function resolveSandboxDocumentUrl(): string {
  return resolveSandboxUrl({
    hostUrl: location.href,
    sandboxUrl: import.meta.env.VITE_ZEUS_SANDBOX_URL,
    sandboxOrigin: import.meta.env.VITE_ZEUS_SANDBOX_ORIGIN,
  })
}

export function attachPreview(container: HTMLElement): void {
  if (previewFrame && previewFrame.parentElement === container) return
  previewFrame?.remove()
  const frame = document.createElement('iframe')
  frame.dataset.testid = 'preview-frame'
  frame.title = 'Zeus playground sandbox'
  frame.referrerPolicy = 'no-referrer'
  frame.setAttribute('sandbox', 'allow-scripts')
  container.append(frame)
  previewFrame = frame
  preview.attach(frame)
}

export function disposePreview(): void {
  previewFrame?.remove()
  previewFrame = undefined
  preview.dispose()
}

export function activeFile(): PlaygroundFile {
  const path = activePath()
  const match = files().find(file => file.path === path)
  const first = files()[0]
  if (!first) throw new Error('Playground requires at least one project file.')
  return match ?? first
}

export function entryPath(): string {
  const current = files()
  return (
    current.find(file => file.path === 'src/main.tsx')?.path ?? current[0]!.path
  )
}

export function projectSnapshot() {
  const currentProduct = product()
  return parseProjectSnapshot({
    schemaVersion: 2,
    entryPath: entryPath(),
    frameworkTarget: currentProduct === 'webc-studio' ? 'webc' : 'native',
    compilerVersion: 'wasm:0.1.1-beta.20',
    dependencies:
      currentProduct === 'native-lab'
        ? [
            { name: '@zeus-js/query', version: '0.1.1-beta.20' },
            { name: '@zeus-js/router', version: '0.1.1-beta.20' },
          ]
        : [],
    files: files().map(file => ({ path: file.path, content: file.content })),
    options: {
      delegateEvents: true,
      sourceMap: true,
      sandboxTimeoutMs: 3_000,
    },
  })
}

export async function initialize(): Promise<void> {
  if (initialized) return
  initialized = true
  applyTheme()
  const shared = readShareHash()
  if (shared) {
    const payload = await decodeShare(shared)
    if (payload) {
      setActiveProduct(payload.product)
      files.set(payload.files)
      activePath.set(payload.activePath)
      currentExampleId.set(payload.exampleId)
      history.replaceState(null, '', productHref(payload.product))
      markSaved(false)
      if (autoRun() && !busy() && buildSequence() === 0) scheduleAutoRun(0)
      return
    }
  }
  const saved = await loadWorkspace(product())
  if (saved) {
    files.set(saved.files)
    activePath.set(saved.activePath)
    currentExampleId.set(saved.exampleId)
    markSaved(false)
  }
  if (autoRun() && !busy() && buildSequence() === 0) scheduleAutoRun(0)
}

export function setActiveFilePath(path: string): void {
  if (!files().some(file => file.path === path)) return
  activePath.set(path)
  markDirty()
}

export function updateSource(content: string): void {
  const path = activePath()
  files.update(current =>
    current.map(file => (file.path === path ? { ...file, content } : file)),
  )
  markDirty()
  scheduleAutoRun()
}

export function addFile(): string {
  const existing = new Set(files().map(file => file.path))
  let index = files().length + 1
  let path = `src/component-${index}.tsx`
  while (existing.has(path)) {
    index += 1
    path = `src/component-${index}.tsx`
  }
  files.update(current => [
    ...current,
    {
      path,
      content: `export const Component${index} = () => <p>New component</p>\n`,
    },
  ])
  activePath.set(path)
  markDirty()
  scheduleAutoRun()
  return path
}

export function removeActiveFile(): void {
  if (activePath() === entryPath() || files().length === 1) return
  const removing = activePath()
  files.update(current => current.filter(file => file.path !== removing))
  activePath.set(entryPath())
  markDirty()
  scheduleAutoRun()
}

export function renameActiveFile(nextPath: string): boolean {
  const path = nextPath.trim().replaceAll('\\', '/')
  if (!isSafeProjectPath(path) || files().some(file => file.path === path)) {
    showToast('Use a unique relative path such as src/panel.tsx.', 'error')
    return false
  }
  const current = activePath()
  files.update(items =>
    items.map(file => (file.path === current ? { ...file, path } : file)),
  )
  activePath.set(path)
  markDirty()
  scheduleAutoRun()
  return true
}

export function selectProduct(next: PlaygroundProduct): void {
  if (next === product()) return
  saveNow()
  setActiveProduct(next)
  history.pushState(null, '', productHref(next))
  const template = templates[next]
  files.set(template.files)
  activePath.set(template.files[0]!.path)
  currentExampleId.set(undefined)
  resetBuildPanels()
  preview.stop()
  markDirty()
  void loadWorkspace(next).then(saved => {
    if (saved && product() === next) {
      files.set(saved.files)
      activePath.set(saved.activePath)
      currentExampleId.set(saved.exampleId)
      markSaved(false)
    }
    if (autoRun()) scheduleAutoRun(0)
  })
}

export function loadExample(example: PlaygroundExample): void {
  // Autosave the current draft before switching; no modal is involved.
  if (dirty()) saveNow()
  if (example.product !== product()) {
    setActiveProduct(example.product)
    history.pushState(null, '', productHref(example.product))
  }
  files.set(example.files)
  activePath.set(example.files[0]!.path)
  currentExampleId.set(example.id)
  examplesOpen.set(false)
  resetBuildPanels()
  preview.stop()
  markDirty()
  saveNow()
  if (autoRun()) scheduleAutoRun(0)
}

export function resetCurrentExample(): void {
  const current = examples.find(example => example.id === currentExampleId())
  if (current) {
    files.set(current.files)
    activePath.set(current.files[0]!.path)
  } else {
    const template = templates[product()]
    files.set(template.files)
    activePath.set(template.files[0]!.path)
  }
  resetBuildPanels()
  preview.stop()
  markDirty()
  scheduleAutoRun(0)
}

export function currentExample(): PlaygroundExample | undefined {
  return examples.find(example => example.id === currentExampleId())
}

export function availableExamples(): readonly PlaygroundExample[] {
  return examplesFor(product())
}

export function toggleAutoRun(): void {
  autoRun.update(value => !value)
  persistSettings()
  if (autoRun()) scheduleAutoRun(0)
}

export function setTheme(value: 'light' | 'dark'): void {
  theme.set(value)
  applyTheme()
  persistSettings()
}

export function setFontSize(value: number): void {
  fontSize.set(Math.max(12, Math.min(20, Math.round(value))))
  persistSettings()
}

export function setSplit(value: number): void {
  splitPercent.set(Math.max(30, Math.min(70, Math.round(value))))
  persistSettings()
}

export function selectTab(tab: ResultTab): void {
  activeTab.set(tab)
  if (tab !== 'preview') previewMaximized.set(false)
  persistSettings()
}

export function togglePreviewMax(): void {
  previewMaximized.update(value => !value)
  if (previewMaximized()) selectTab('preview')
}

export function setMobilePane(pane: MobilePane): void {
  mobilePane.set(pane)
}

export function filterConsole(): void {
  consoleFilter.update(value => (value === 'all' ? 'error' : 'all'))
}

export function clearConsole(): void {
  consoleEntries.set([])
}

export function copyConsole(): void {
  const text = consoleEntries()
    .map(
      entry =>
        `[${new Date(entry.timestamp).toISOString()}] ${entry.level}: ${entry.message}`,
    )
    .join('\n')
  void navigator.clipboard?.writeText(text).then(
    () => showToast('Console copied.', 'info'),
    () => showToast('Clipboard is unavailable.', 'error'),
  )
}

export function showToast(
  message: string,
  kind: 'info' | 'error' = 'info',
): void {
  toast.set({ message, kind })
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.set(undefined), 3200)
}

export function dismissToast(): void {
  toast.set(undefined)
}

export function focusDiagnostic(item: DiagnosticItem): void {
  setActiveFilePath(item.file)
  focusRequest.set({
    file: item.file,
    ...(item.line ? { line: item.line } : {}),
    nonce: Date.now(),
  })
  if (item.severity === 'error') selectTab('problems')
}

export function saveNow(): void {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer)
  saveTimer = undefined
  const value = {
    product: product(),
    files: files(),
    activePath: activePath(),
    ...(currentExampleId() ? { exampleId: currentExampleId() } : {}),
  }
  void saveWorkspace(value).then(ok => {
    if (ok) markSaved(true)
    else {
      dirty.set(true)
      showToast('Draft could not be saved in this browser mode.', 'error')
    }
  })
}

export function markDirty(): void {
  dirty.set(true)
  if (saveTimer !== undefined) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(saveNow, 500)
}

export async function importProject(file: File): Promise<void> {
  if (file.size > 1_500_000) {
    showToast('Project JSON is larger than 1.5 MB.', 'error')
    return
  }
  try {
    const value = JSON.parse(await file.text()) as unknown
    const payload = await decodeShareFromJson(value)
    if (!payload) throw new Error('Invalid project file.')
    setActiveProduct(payload.product)
    history.pushState(null, '', productHref(payload.product))
    files.set(payload.files)
    activePath.set(payload.activePath)
    currentExampleId.set(undefined)
    resetBuildPanels()
    preview.stop()
    markDirty()
    saveNow()
    if (autoRun()) scheduleAutoRun(0)
    showToast('Project imported.', 'info')
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Import failed.',
      'error',
    )
  }
}

export async function shareUrl(): Promise<string | undefined> {
  return createShareUrl({
    product: product(),
    files: files(),
    activePath: activePath(),
    ...(currentExampleId() ? { exampleId: currentExampleId() } : {}),
  })
}

export async function share(): Promise<void> {
  const url = await createShareUrl({
    product: product(),
    files: files(),
    activePath: activePath(),
    ...(currentExampleId() ? { exampleId: currentExampleId() } : {}),
  })
  if (!url) {
    downloadShareJson({
      product: product(),
      files: files(),
      activePath: activePath(),
      ...(currentExampleId() ? { exampleId: currentExampleId() } : {}),
    })
    showToast('Project too large for a URL — JSON downloaded instead.', 'info')
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    showToast('Share link copied to clipboard.', 'info')
  } catch {
    window.prompt('Copy this share link:', url)
  }
}

export async function exportZip(): Promise<void> {
  busy.set(true)
  status.set('Preparing project archive…')
  try {
    const result = await exportProject(projectSnapshot(), {
      packageName:
        product() === 'webc-studio'
          ? 'zeus-webc-studio-export'
          : 'zeus-native-lab-export',
    })
    const { zipSync } = await import('fflate')
    const tree: Record<string, Uint8Array> = {}
    const rootName = result.packageName.replace('/', '-')
    for (const file of result.files) {
      tree[`${rootName}/${file.path}`] = new TextEncoder().encode(file.content)
    }
    const zipped = zipSync(tree, { level: 6 })
    const url = URL.createObjectURL(
      new Blob([zipped], { type: 'application/zip' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${rootName}.zip`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    status.set(`Exported ${result.files.length} files as ZIP.`)
    showToast('Project ZIP downloaded.', 'info')
  } catch (error) {
    status.set('Export failed.')
    showToast(formatCompileError(error), 'error')
  } finally {
    busy.set(false)
  }
}

export async function compile(manual = false): Promise<void> {
  lastCompileKind = manual ? 'manual' : 'auto'
  const revision = ++runRevision
  if (autoRunTimer !== undefined) window.clearTimeout(autoRunTimer)
  autoRunTimer = undefined
  busy.set(true)
  if (!manual) status.set('Auto-running…')
  else status.set('Compiling…')
  previewStatus.update(value =>
    value.includes('Preview ready')
      ? 'Rebuilding preview…'
      : 'Compiling project…',
  )
  let snapshot: ReturnType<typeof projectSnapshot> | undefined
  let dom: PlaygroundCompileResult | undefined
  let ssr: PlaygroundCompileResult | undefined
  try {
    snapshot = projectSnapshot()
    const compiler = await getCompiler()
    const started = performance.now()
    const builds = await Promise.all([
      compileProject(snapshot, compiler, {
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
        hmr: product() === 'native-lab',
        previousSnapshot,
      }),
      compileProject(snapshot, compiler, {
        target: 'ssr',
        runtimeModule: '@zeus-js/runtime-ssr',
      }),
    ])
    if (revision !== runRevision) return
    const compileMs = performance.now() - started
    dom = builds[0]
    ssr = builds[1]
    setOutputs(dom, ssr)
    const webcDiagnostics =
      product() === 'webc-studio' ? setWebcOutputs(snapshot) : []
    const allDiagnostics = [
      ...dom.diagnostics,
      ...ssr.diagnostics,
      ...webcDiagnostics,
    ]
    setDiagnostics(allDiagnostics, dom, ssr)
    const errors = allDiagnostics.filter(item => item.severity === 'error')
    if (errors.length > 0) {
      stale.set(true)
      status.set(
        `Compile failed · ${errors.length} problem${errors.length === 1 ? '' : 's'}`,
      )
      previewStatus.set('Preview is stale — fix the reported problems.')
      selectTab('problems')
      return
    }
    previousSnapshot = snapshot
    stale.set(false)
    status.set(
      `Compiled ${dom.meta.moduleCount} modules · ${compileMs.toFixed(1)} ms`,
    )
    const build = await createPlaygroundPreview(dom)
    if (revision !== runRevision) return
    previewStatus.set('Running in the opaque sandbox…')
    const result = await preview.run(build, snapshot.options.sandboxTimeoutMs)
    if (revision !== runRevision) return
    devtoolsSnapshot.set(result.devtools)
    buildMetrics.update(current => ({
      ...current,
      compileMs,
      previewMs: result.durationMs,
      domBytes: dom!.meta.byteCount,
      ssrBytes: ssr!.meta.byteCount,
      runs: current.runs + 1,
    }))
    previewStatus.set(
      `Preview ready · ${result.durationMs.toFixed(1)} ms${
        result.exportedNames.length > 0
          ? ` · ${result.exportedNames.join(', ')}`
          : ''
      }`,
    )
    if (errors.length === 0 && activeTab() === 'problems') {
      selectTab('preview')
    }
  } catch (error) {
    if (revision !== runRevision) return
    resetCompiler()
    stale.set(true)
    status.set('Compile failed.')
    previewStatus.set('Preview is stale — the compiler rejected this project.')
    const message = formatCompileError(error)
    diagnosticsRaw.set(message)
    diagnosticItems.set(parseProjectError(message))
    selectTab('problems')
  } finally {
    if (revision === runRevision) {
      busy.set(false)
      buildSequence.update(value => value + 1)
    }
  }
}

export async function stop(): Promise<void> {
  runRevision += 1
  if (autoRunTimer !== undefined) window.clearTimeout(autoRunTimer)
  autoRunTimer = undefined
  preview.stop()
  busy.set(false)
  stale.set(true)
  status.set('Stopped')
  previewStatus.set('Preview stopped. Run again when ready.')
  buildSequence.update(value => value + 1)
}

export async function previewFrameworks(): Promise<void> {
  const tag = webcHostTag
  if (!tag) {
    frameworkPreviewStatus.set('Compile a WebC project first.')
    return
  }
  frameworkPreviewStatus.set('Mounting React and Vue in the opaque sandbox…')
  try {
    await preview.runHostPreview(tag)
    frameworkPreviewStatus.set(
      'React and Vue hosts mounted in the opaque sandbox.',
    )
  } catch (error) {
    frameworkPreviewStatus.set(formatCompileError(error))
  }
}

export function testState() {
  return {
    product: product(),
    files: files(),
    activePath: activePath(),
    source: activeFile().content,
    status: status(),
    previewStatus: previewStatus(),
    busy: busy(),
    stale: stale(),
    diagnostics: diagnosticItems(),
    console: consoleEntries(),
    devtools: devtoolsSnapshot(),
    buildSequence: buildSequence(),
    autoRun: autoRun(),
    lastCompileKind,
    buildMetrics: buildMetrics(),
    activeTab: activeTab(),
  }
}

export function setSourceForTest(content: string): void {
  updateSource(content)
}

export function resetProject(): void {
  void clearWorkspace(product()).then(() => {
    resetCurrentExample()
    showToast('Workspace reset.', 'info')
  })
}

export function scheduleAutoRun(delay = 700): void {
  if (!autoRun()) return
  if (autoRunTimer !== undefined) window.clearTimeout(autoRunTimer)
  autoRunTimer = window.setTimeout(() => {
    autoRunTimer = undefined
    void compile(false)
  }, delay)
}

export function getCompiler(): Promise<WorkerCompiler> {
  compilerPromise ??= compileCompilerModule(fetch(wasmURL)).then(module =>
    createWorkerCompiler(
      new Worker(compilerWorkerUrl, { type: 'module' }),
      module,
      {
        timeout: 5_000,
      },
    ),
  )
  return compilerPromise
}

function setOutputs(
  dom: PlaygroundCompileResult,
  ssr: PlaygroundCompileResult,
): void {
  domOutput.set(formatBuild(dom))
  ssrOutput.set(formatBuild(ssr))
  hmrModules.set(
    dom.modules.flatMap(module =>
      module.hmr ? [{ path: module.path, hmr: module.hmr }] : [],
    ),
  )
}

function setWebcOutputs(snapshot: ReturnType<typeof projectSnapshot>) {
  const webc = buildWebCArtifacts(snapshot)
  webcManifest.set(
    JSON.stringify(
      {
        manifest: webc.metadata.manifest,
        customElements: JSON.parse(webc.metadata.customElements || '[]'),
        diagnostics: webc.metadata.diagnostics,
        files: webc.files.map((file: { path: string }) => file.path),
      },
      null,
      2,
    ),
  )
  webcDeclarations.set(
    Object.entries(webc.metadata.declarations)
      .map(([tag, declaration]) => `// ${tag}\n${declaration}`)
      .join('\n'),
  )
  webcInspector.set(webc.metadata.inspector)
  const firstTag = webc.metadata.inspector[0]?.tag
  if (firstTag) webcHostTag = firstTag
  return webc.metadata.diagnostics
}

function setDiagnostics(
  items: readonly {
    readonly code: string
    readonly message: string
    readonly severity: 'error' | 'warning'
    readonly filename: string
    readonly hint?: string
  }[],
  dom: PlaygroundCompileResult,
  ssr: PlaygroundCompileResult,
): void {
  diagnosticsRaw.set(
    JSON.stringify(
      {
        diagnostics: items,
        sourceMaps: {
          dom: moduleMaps(dom),
          ssr: moduleMaps(ssr),
        },
      },
      null,
      2,
    ),
  )
  diagnosticItems.set(
    items.map((item, index) => {
      const location = extractLocation(item.message)
      return {
        id: `${item.filename}:${item.code}:${index}`,
        file: normalizeFile(item.filename),
        severity: item.severity,
        code: item.code,
        message: item.message,
        ...(item.hint ? { hint: item.hint } : {}),
        ...(location ? { line: location.line, column: location.column } : {}),
      }
    }),
  )
}

export function moduleMaps(
  result: PlaygroundCompileResult,
): Record<string, unknown> {
  return Object.fromEntries(
    result.modules
      .filter(module => module.map)
      .map(module => [module.path, module.map]),
  )
}

function formatBuild(result: PlaygroundCompileResult): string {
  return result.modules
    .map(
      module =>
        `// ${module.path}${module.map ? ' · source map' : ''}\n${module.code}`,
    )
    .join('\n\n')
}

function formatCompileError(error: unknown): string {
  if (isProjectError(error)) return JSON.stringify(error.issues, null, 2)
  return error instanceof Error ? error.message : String(error)
}

function parseProjectError(raw: string): readonly DiagnosticItem[] {
  try {
    const value = JSON.parse(raw) as unknown
    if (Array.isArray(value)) {
      return value.map((issue, index) => ({
        id: `project:${index}`,
        file: 'src/main.tsx',
        severity: 'error',
        code: 'ZEUS_PLAYGROUND_PROJECT',
        message: String((issue as { message?: unknown }).message ?? issue),
      }))
    }
  } catch {
    // Fall through to a single problem.
  }
  return [
    {
      id: 'compile:0',
      file: 'src/main.tsx',
      severity: 'error',
      code: 'ZEUS_PLAYGROUND_COMPILE',
      message: raw,
    },
  ]
}

function extractLocation(
  message: string,
): { line: number; column: number } | undefined {
  const match = /(?:\(|:)(\d+):(\d+)\)?/.exec(message)
  if (!match) return undefined
  const line = Number(match[1])
  const column = Number(match[2])
  return Number.isSafeInteger(line) && line > 0
    ? { line, column: Math.max(1, column) }
    : undefined
}

function normalizeFile(filename: string): string {
  const path = filename.replaceAll('\\', '/').replace(/^\.\//, '')
  if (files().some(file => file.path === path)) return path
  const match = files().find(
    file => file.path.endsWith(`/${path}`) || path.endsWith(file.path),
  )
  return match?.path ?? files()[0]?.path ?? 'src/main.tsx'
}

function isProjectError(error: unknown): error is PlaygroundProjectError {
  return (
    error instanceof Error &&
    error.name === 'PlaygroundProjectError' &&
    Array.isArray((error as PlaygroundProjectError).issues)
  )
}

function resetCompiler(): void {
  const current = compilerPromise
  compilerPromise = undefined
  void current?.then(compiler => compiler.terminate()).catch(() => {})
}

function resetBuildPanels(): void {
  domOutput.set('')
  ssrOutput.set('')
  diagnosticsRaw.set('[]')
  diagnosticItems.set([])
  webcManifest.set('')
  webcDeclarations.set('')
  webcInspector.set([])
  hmrModules.set([])
  devtoolsSnapshot.set(undefined)
  stale.set(false)
  consoleEntries.set([])
}

function persistSettings(): void {
  writeSettings({
    theme: theme(),
    fontSize: fontSize(),
    autoRun: autoRun(),
    splitPercent: splitPercent(),
    activeTab: activeTab(),
  })
}

function applyTheme(): void {
  document.documentElement.dataset.theme = theme()
}

function markSaved(_fromSave: boolean): void {
  dirty.set(false)
  savedAt.set(new Date().toISOString())
}

async function decodeShareFromJson(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const candidate = {
    ...(value as Record<string, unknown>),
    savedAt: new Date(0).toISOString(),
  }
  const { validatePersistedWorkspace } = await import('./persistence')
  if (!validatePersistedWorkspace(candidate)) return undefined
  return candidate
}

function isSafeProjectPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 180 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    !path.split('/').includes('..')
  )
}
