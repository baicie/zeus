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
} from '@zeus-js/playground-engine'
import { For, Show, createSignal, onCleanup, render } from '@zeus-js/zeus'

import compilerWorkerUrl from '@zeus-js/compiler-wasm/worker?worker&url'

import type {
  PlaygroundCompileResult,
  PlaygroundProjectError,
  PlaygroundComponentInspector,
  PlaygroundModuleHmr,
  PlaygroundSandboxDevtools,
} from '@zeus-js/playground-engine'
import type { WorkerCompiler } from '@zeus-js/compiler-wasm'

import { PreviewController } from './preview'
import { activeProduct, productHref } from './products'
import { templates } from './webc-project'

import './style.css'

import type { StudioFile, StudioTemplate } from './webc-project'

type EditableFile = StudioFile

const template = templates[activeProduct()]
const [files, setFiles] = createSignal<readonly EditableFile[]>(template.files)
const [activePath, setActivePath] = createSignal(template.files[0]!.path)
const [domOutput, setDomOutput] = createSignal('')
const [ssrOutput, setSsrOutput] = createSignal('')
const [diagnostics, setDiagnostics] = createSignal('[]')
const [status, setStatus] = createSignal('等待编译')
const [previewStatus, setPreviewStatus] = createSignal('预览沙箱等待编译')
const [busy, setBusy] = createSignal(false)
const [buildSequence, setBuildSequence] = createSignal(0)
const [webcManifest, setWebcManifest] = createSignal('')
const [webcDeclarations, setWebcDeclarations] = createSignal('')
const [webcInspector, setWebcInspector] = createSignal<
  readonly PlaygroundComponentInspector[]
>([])
const [frameworkPreviewStatus, setFrameworkPreviewStatus] = createSignal(
  'Compile a WebC project, then preview it in isolated React and Vue hosts.',
)
const [hmrModules, setHmrModules] = createSignal<
  readonly { path: string; hmr: PlaygroundModuleHmr }[]
>([])
const [devtoolsSnapshot, setDevtoolsSnapshot] = createSignal<
  PlaygroundSandboxDevtools | undefined
>(undefined)
const [buildMetrics, setBuildMetrics] = createSignal({
  compileMs: 0,
  previewMs: 0,
  domBytes: 0,
  ssrBytes: 0,
})
const preview = new PreviewController(resolveSandboxUrl())
let compilerPromise: Promise<WorkerCompiler> | undefined
let previousSnapshot: ReturnType<typeof projectSnapshot> | undefined
let webcHostTag: string | undefined

function resolveSandboxUrl(): string {
  const configured = import.meta.env.VITE_ZEUS_SANDBOX_ORIGIN
  const sandboxOrigin = configured
    ? new URL(configured).origin
    : alternateLoopbackOrigin()
  if (sandboxOrigin === location.origin) {
    throw new Error(
      'VITE_ZEUS_SANDBOX_ORIGIN must be a different origin from the playground host.',
    )
  }
  return `${sandboxOrigin}/sandbox.html`
}

function alternateLoopbackOrigin(): string {
  const port = location.port ? `:${location.port}` : ''
  if (location.hostname === '127.0.0.1') {
    return `${location.protocol}//localhost${port}`
  }
  if (location.hostname === 'localhost') {
    return `${location.protocol}//127.0.0.1${port}`
  }
  throw new Error(
    'Set VITE_ZEUS_SANDBOX_ORIGIN to a distinct sandbox origin before building this example.',
  )
}

function getCompiler(): Promise<WorkerCompiler> {
  compilerPromise ??= compileCompilerModule(fetch(wasmURL)).then(module =>
    createWorkerCompiler(
      new Worker(compilerWorkerUrl, { type: 'module' }),
      module,
      { timeout: 5_000 },
    ),
  )
  return compilerPromise
}

function activeFile(): EditableFile {
  const path = activePath()
  const match = files().find(file => file.path === path)
  if (match) return match
  const first = files()[0]
  if (!first) throw new Error('Playground requires at least one project file.')
  return first
}

function projectSnapshot() {
  return parseProjectSnapshot({
    schemaVersion: 2,
    entryPath: templateEntry(),
    frameworkTarget: activeProduct() === 'webc-studio' ? 'webc' : 'native',
    compilerVersion: 'wasm:0.1.1-beta.20',
    dependencies:
      activeProduct() === 'native-lab'
        ? [
            { name: '@zeus-js/query', version: '0.1.1-beta.20' },
            { name: '@zeus-js/router', version: '0.1.1-beta.20' },
          ]
        : [],
    files: files(),
    options: {
      delegateEvents: true,
      sourceMap: true,
      sandboxTimeoutMs: 3_000,
    },
  })
}

function templateEntry(): string {
  const current: StudioTemplate = templates[activeProduct()]
  const preferred = 'src/main.tsx'
  return current.files.some(file => file.path === preferred)
    ? preferred
    : current.files[0]!.path
}

function updateActiveSource(content: string): void {
  const path = activePath()
  setFiles(current =>
    current.map(file => (file.path === path ? { ...file, content } : file)),
  )
}

function addFile(): void {
  const existing = new Set(files().map(file => file.path))
  let index = files().length + 1
  let path = `src/component-${index}.tsx`
  while (existing.has(path)) {
    index += 1
    path = `src/component-${index}.tsx`
  }
  setFiles(current => [
    ...current,
    {
      path,
      content: `export const Component${index} = () => <p>New component</p>\n`,
    },
  ])
  setActivePath(path)
}

function removeActiveFile(): void {
  if (activePath() === templateEntry() || files().length === 1) return
  setFiles(current => current.filter(file => file.path !== activePath()))
  setActivePath(templateEntry())
}

async function compile(): Promise<void> {
  setBusy(true)
  setStatus('正在用 WASM Worker 编译多文件工程…')
  setPreviewStatus('等待新构建')
  setDevtoolsSnapshot(undefined)
  preview.stop()
  let snapshot: ReturnType<typeof projectSnapshot> | undefined
  let dom: PlaygroundCompileResult | undefined
  let ssr: PlaygroundCompileResult | undefined
  try {
    snapshot = projectSnapshot()
    const compiler = await getCompiler()
    const compileStarted = performance.now()
    const builds = await Promise.all([
      compileProject(snapshot, compiler, {
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
        hmr: activeProduct() === 'native-lab',
        previousSnapshot,
      }),
      compileProject(snapshot, compiler, {
        target: 'ssr',
        runtimeModule: '@zeus-js/runtime-ssr',
      }),
    ])
    const compileDuration = performance.now() - compileStarted
    dom = builds[0]
    ssr = builds[1]
    setHmrModules(
      dom.modules.flatMap(module =>
        module.hmr ? [{ path: module.path, hmr: module.hmr }] : [],
      ),
    )
    setBuildMetrics({
      compileMs: compileDuration,
      previewMs: 0,
      domBytes: dom.meta.byteCount,
      ssrBytes: ssr.meta.byteCount,
    })
    setDomOutput(formatBuild(dom))
    setSsrOutput(formatBuild(ssr))
    if (activeProduct() === 'webc-studio') {
      const webc = buildWebCArtifacts(snapshot)
      setWebcManifest(
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
      setWebcDeclarations(
        Object.entries(webc.metadata.declarations)
          .map(([tag, declaration]) => `// ${tag}\n${declaration}`)
          .join('\n'),
      )
      setWebcInspector(webc.metadata.inspector)
      const firstTag = webc.metadata.inspector[0]?.tag
      if (firstTag) webcHostTag = firstTag
      if (
        webc.metadata.diagnostics.some(
          (item: { severity: string }) => item.severity === 'error',
        )
      ) {
        setDiagnostics(
          JSON.stringify(
            {
              diagnostics: [
                ...dom.diagnostics,
                ...ssr.diagnostics,
                ...webc.metadata.diagnostics,
              ],
            },
            null,
            2,
          ),
        )
        setStatus('组件元数据校验失败。')
        setPreviewStatus('组件定义无效，预览未启动')
        preview.stop()
        setBusy(false)
        setBuildSequence(value => value + 1)
        return
      }
    }
    setDiagnostics(
      JSON.stringify(
        {
          diagnostics: [...dom.diagnostics, ...ssr.diagnostics],
          sourceMaps: {
            dom: moduleMaps(dom),
            ssr: moduleMaps(ssr),
          },
        },
        null,
        2,
      ),
    )
    const errors = [...dom.diagnostics, ...ssr.diagnostics].filter(
      diagnostic => diagnostic.severity === 'error',
    )
    if (errors.length > 0) {
      setStatus(
        `编译完成：${dom.meta.moduleCount} 个模块，${errors.length} 条错误。`,
      )
      setPreviewStatus('存在编译错误，预览未启动')
      preview.stop()
      setBusy(false)
      setBuildSequence(value => value + 1)
      return
    }
    setStatus(
      `编译完成：${dom.meta.moduleCount} 个模块，DOM/SSR source map 各 ${dom.modules.filter(module => module.map).length}/${ssr.modules.filter(module => module.map).length} 份。`,
    )
    previousSnapshot = snapshot
  } catch (error) {
    resetCompiler()
    const message = formatCompileError(error)
    setDomOutput('')
    setSsrOutput('')
    setDiagnostics(message)
    setStatus('编译失败。')
    setPreviewStatus('编译失败，预览未启动')
    preview.stop()
    setBusy(false)
    setBuildSequence(value => value + 1)
    return
  }

  try {
    if (!dom || !snapshot) return
    const build = await createPlaygroundPreview(dom)
    setPreviewStatus('正在隔离沙箱中执行…')
    const result = await preview.run(build, snapshot.options.sandboxTimeoutMs)
    setDevtoolsSnapshot(result.devtools)
    setBuildMetrics(current => ({
      ...current,
      previewMs: result.durationMs,
    }))
    setPreviewStatus(
      `预览就绪：${result.durationMs.toFixed(1)} ms${result.exportedNames.length > 0 ? `，导出 ${result.exportedNames.join(', ')}` : ''}`,
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'PlaygroundProjectError') {
      setPreviewStatus(error.message)
    } else {
      setPreviewStatus(formatCompileError(error))
    }
  } finally {
    setBusy(false)
    setBuildSequence(value => value + 1)
  }
}

async function downloadProject(): Promise<void> {
  setBusy(true)
  setStatus('正在生成可安装工程…')
  try {
    const result = await exportProject(projectSnapshot(), {
      packageName:
        activeProduct() === 'webc-studio'
          ? 'zeus-webc-studio-export'
          : 'zeus-native-lab-export',
    })
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(result.data).buffer], {
        type: result.mediaType,
      }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.fileName
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setStatus(`已导出 ${result.files.length} 个文件：${result.fileName}`)
  } catch (error) {
    setStatus(`导出失败：${formatCompileError(error)}`)
  } finally {
    setBusy(false)
  }
}

async function previewFrameworks(): Promise<void> {
  const tag = webcHostTag
  if (!tag) {
    setFrameworkPreviewStatus('Compile a WebC project first.')
    return
  }
  setFrameworkPreviewStatus('Mounting React and Vue in the sandbox…')
  try {
    await preview.runHostPreview(tag)
    setFrameworkPreviewStatus(
      'React and Vue hosts mounted in the opaque sandbox.',
    )
  } catch (error) {
    setFrameworkPreviewStatus(formatCompileError(error))
  }
}

function resetCompiler(): void {
  const current = compilerPromise
  compilerPromise = undefined
  void current?.then(compiler => compiler.terminate()).catch(() => {})
}

function formatBuild(result: PlaygroundCompileResult): string {
  return result.modules
    .map(
      module =>
        `// ${module.path}${module.map ? ' · source map' : ''}\n${module.code}`,
    )
    .join('\n\n')
}

function moduleMaps(result: PlaygroundCompileResult): Record<string, unknown> {
  return Object.fromEntries(
    result.modules
      .filter(module => module.map)
      .map(module => [module.path, module.map]),
  )
}

function DevtoolsPanel(props: {
  snapshot: PlaygroundSandboxDevtools | undefined
}) {
  return (
    <div data-testid="runtime-devtools-content">
      <p>
        <span class="tag" data-testid="devtools-mode">
          {props.snapshot?.mode ?? 'unknown'}
        </span>
        <span class="tag secondary-tag">
          {props.snapshot?.eventCount ?? 0} events
        </span>
      </p>
      <dl>
        <dt>Owners</dt>
        <dd data-testid="devtools-owners">{props.snapshot?.ownerCount ?? 0}</dd>
        <dt>Bindings</dt>
        <dd data-testid="devtools-bindings">
          {props.snapshot?.bindingCount ?? 0}
        </dd>
        <dt>Effects</dt>
        <dd data-testid="devtools-effects">
          {props.snapshot?.effectCount ?? 0}
        </dd>
        <dt>Signals</dt>
        <dd data-testid="devtools-sources">
          {props.snapshot?.sourceCount ?? 0}
        </dd>
        <dt>DOM nodes</dt>
        <dd data-testid="devtools-dom-nodes">
          {props.snapshot?.domNodeCount ?? 0}
        </dd>
        <dt>Text nodes</dt>
        <dd data-testid="devtools-text-nodes">
          {props.snapshot?.textNodeCount ?? 0}
        </dd>
      </dl>
      <Show when={(props.snapshot?.timeline.length ?? 0) > 0}>
        <ol class="timeline" data-testid="devtools-timeline">
          <For each={props.snapshot?.timeline ?? []}>
            {entry => (
              <li>
                {entry.type}
                {entry.reason ? ` · ${entry.reason}` : ''}
              </li>
            )}
          </For>
        </ol>
      </Show>
    </div>
  )
}

function formatCompileError(error: unknown): string {
  if (isProjectError(error)) {
    return JSON.stringify(error.issues, null, 2)
  }
  return error instanceof Error ? error.message : String(error)
}

function isProjectError(error: unknown): error is PlaygroundProjectError {
  return (
    error instanceof Error &&
    error.name === 'PlaygroundProjectError' &&
    Array.isArray((error as PlaygroundProjectError).issues)
  )
}

function Playground() {
  let previewFrame: HTMLIFrameElement | undefined
  onCleanup(() => preview.dispose())

  function mountPreview(container: HTMLDivElement | null): void {
    if (!container || previewFrame) return
    const frame = document.createElement('iframe')
    frame.dataset.testid = 'preview-frame'
    frame.title = 'Zeus playground sandbox'
    frame.referrerPolicy = 'no-referrer'
    frame.setAttribute('sandbox', 'allow-scripts')
    container.append(frame)
    previewFrame = frame
    preview.attach(frame)
  }

  return (
    <main>
      <header>
        <div>
          <nav class="product-switcher" aria-label="Playground products">
            <a
              href={productHref('native-lab')}
              aria-current={
                activeProduct() === 'native-lab' ? 'page' : undefined
              }
              data-testid="product-native"
            >
              Native Lab
            </a>
            <a
              href={productHref('webc-studio')}
              aria-current={
                activeProduct() === 'webc-studio' ? 'page' : undefined
              }
              data-testid="product-webc"
            >
              WebC Studio
            </a>
          </nav>
          <p class="eyebrow">Zeus 0.2.0 · {template.title}</p>
          <h1>{template.title}</h1>
          <p>{template.description}</p>
        </div>
        <div class="actions">
          <button
            type="button"
            class="secondary"
            data-testid="export"
            disabled={busy()}
            onClick={() => void downloadProject()}
          >
            Export
          </button>
          <button
            type="button"
            data-testid="compile"
            data-build-sequence={buildSequence()}
            disabled={busy()}
            onClick={() => void compile()}
          >
            {busy() ? 'Working…' : 'Compile & Run'}
          </button>
        </div>
      </header>
      <p role="status" data-testid="status">
        {status()}
      </p>
      <section class="workspace">
        <div class="editor-pane">
          <div class="file-toolbar" aria-label="Project files">
            <div class="file-tabs" role="tablist" aria-label="Project files">
              <For each={files()}>
                {file => (
                  <button
                    type="button"
                    class="file-tab"
                    role="tab"
                    aria-selected={file.path === activePath()}
                    data-active={file.path === activePath()}
                    onClick={() => setActivePath(file.path)}
                  >
                    {file.path.replace('src/', '')}
                  </button>
                )}
              </For>
            </div>
            <div class="file-actions">
              <button
                type="button"
                class="icon-button"
                data-testid="add-file"
                onClick={addFile}
              >
                +
              </button>
              <button
                type="button"
                class="icon-button"
                data-testid="remove-file"
                disabled={
                  activePath() === 'src/main.tsx' || files().length === 1
                }
                onClick={removeActiveFile}
              >
                −
              </button>
            </div>
          </div>
          <label class="source-editor">
            <span data-testid="active-file">{activePath()}</span>
            <textarea
              data-testid="source"
              spellcheck={false}
              prop:value={activeFile().content}
              onInput={event =>
                updateActiveSource(
                  (event.currentTarget as HTMLTextAreaElement).value,
                )
              }
            />
          </label>
        </div>
        <div class="compiled-pane">
          <Show when={activeProduct() === 'webc-studio'}>
            <h2>Custom Elements manifest</h2>
            <pre>
              <code data-testid="webc-manifest">
                {webcManifest() ||
                  'Compile to inspect the generated WebC metadata.'}
              </code>
            </pre>
            <h2>Declarations</h2>
            <pre>
              <code data-testid="webc-declarations">
                {webcDeclarations() || 'Per-tag DTS appears after compilation.'}
              </code>
            </pre>
            <h2>Component inspector</h2>
            <div data-testid="webc-inspector" class="inspector">
              <For each={webcInspector()}>
                {component => (
                  <article class="inspector-card">
                    <h3>&lt;{component.tag}&gt;</h3>
                    <p>
                      {component.shadow ? 'Shadow DOM' : 'Light DOM'}
                      {component.formAssociated ? ' · form-associated' : ''}
                    </p>
                    <h4>Props</h4>
                    <ul>
                      <For each={component.props}>
                        {prop => (
                          <li>
                            {prop.attribute === false
                              ? `${prop.name} (property)`
                              : `${prop.name} ← ${prop.attribute}`}
                            : {prop.type}
                            {prop.required ? ' · required' : ''}
                          </li>
                        )}
                      </For>
                    </ul>
                    <h4>Events</h4>
                    <ul>
                      <For each={component.events}>
                        {event => <li>{event.name}</li>}
                      </For>
                    </ul>
                    <h4>Slots</h4>
                    <ul>
                      <For each={component.slots}>
                        {slot => <li>{slot || 'default'}</li>}
                      </For>
                    </ul>
                    <h4>React</h4>
                    <pre>
                      <code>{component.reactUsage}</code>
                    </pre>
                    <h4>Vue</h4>
                    <pre>
                      <code>{component.vueUsage}</code>
                    </pre>
                  </article>
                )}
              </For>
            </div>
            <h2>Frameworks host</h2>
            <div class="framework-link" data-testid="framework-host-link">
              <p>
                This page verifies the same Custom Element implementation inside
                real React 19 and Vue 3 hosts. It uses a fixed reference CE, so
                editor changes are not injected across the security boundary.
              </p>
              <a href="/host.html" target="_blank" rel="noreferrer">
                Open React + Vue reference host
              </a>
              <button
                type="button"
                data-testid="preview-frameworks"
                onClick={() => void previewFrameworks()}
              >
                Preview in React + Vue sandbox
              </button>
              <p data-testid="framework-preview-status">
                {frameworkPreviewStatus()}
              </p>
            </div>
          </Show>
          <h2>DOM</h2>
          <pre>
            <code data-testid="dom-output">
              {domOutput() || 'Compile the project to inspect DOM output.'}
            </code>
          </pre>
          <h2>SSR</h2>
          <pre>
            <code data-testid="ssr-output">
              {ssrOutput() || 'Compile the project to inspect SSR output.'}
            </code>
          </pre>
          <h2>Diagnostics & Source maps</h2>
          <pre>
            <code data-testid="diagnostics">{diagnostics()}</code>
          </pre>
          <Show when={activeProduct() === 'native-lab'}>
            <h2>HMR classification</h2>
            <div class="diagnostic-list" data-testid="hmr-list">
              <Show
                when={hmrModules().length > 0}
                fallback={
                  <p class="empty">
                    Compile to inspect compiler HMR plans and the edit
                    classification against the previous build.
                  </p>
                }
              >
                <For each={hmrModules()}>
                  {module => (
                    <article class="hmr-card">
                      <strong>{module.path}</strong>
                      <p>
                        <span
                          class="tag"
                          data-testid={`hmr-kind-${module.path}`}
                        >
                          {module.hmr.initial
                            ? 'first-build'
                            : (module.hmr.classification?.kind ?? 'unknown')}
                        </span>
                        <span class="tag secondary-tag">
                          {module.hmr.initial
                            ? 'initial-mount'
                            : (module.hmr.classification?.strategy ??
                              'dispose-remount')}
                        </span>
                        <span class="tag secondary-tag">
                          {module.hmr.plan
                            ? `${module.hmr.plan.bindings.length} literal bindings`
                            : 'no literal plan'}
                        </span>
                      </p>
                    </article>
                  )}
                </For>
              </Show>
            </div>
            <h2>Runtime DevTools</h2>
            <div data-testid="runtime-devtools" class="devtools-grid">
              <Show
                when={devtoolsSnapshot()}
                fallback={
                  <p class="empty">
                    The sandbox reports structural nodes and, when development
                    instrumentation is present, runtime graph counters.
                  </p>
                }
              >
                <DevtoolsPanel snapshot={devtoolsSnapshot()} />
              </Show>
            </div>
            <h2>Build performance</h2>
            <dl class="metrics" data-testid="build-metrics">
              <dt>WASM compile</dt>
              <dd>{buildMetrics().compileMs.toFixed(1)} ms</dd>
              <dt>Sandbox run</dt>
              <dd>{buildMetrics().previewMs.toFixed(1)} ms</dd>
              <dt>DOM bytes</dt>
              <dd>{buildMetrics().domBytes}</dd>
              <dt>SSR bytes</dt>
              <dd>{buildMetrics().ssrBytes}</dd>
            </dl>
          </Show>
        </div>
        <div class="preview-pane">
          <div class="preview-heading">
            <h2>Sandbox preview</h2>
            <span class="sandbox-badge">opaque origin</span>
          </div>
          <p class="preview-status" data-testid="preview-status">
            {previewStatus()}
          </p>
          <div
            class="preview-mount"
            data-testid="preview-host"
            ref={mountPreview}
          />
        </div>
      </section>
      <Show when={!busy() && domOutput().length > 0}>
        <p class="note">
          Edit any project file, compile again, then interact with the isolated
          preview.
        </p>
      </Show>
    </main>
  )
}

render(() => <Playground />, document.querySelector<HTMLElement>('#root')!)
