import {
  compileCompilerModule,
  createWorkerCompiler,
  wasmURL,
} from '@zeus-js/compiler-wasm'
import {
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
} from '@zeus-js/playground-engine'
import type { WorkerCompiler } from '@zeus-js/compiler-wasm'

import { PreviewController } from './preview'

import './style.css'

interface EditableFile {
  readonly path: string
  readonly content: string
}

const initialFiles: readonly EditableFile[] = [
  {
    path: 'src/main.tsx',
    content: `import { render } from '@zeus-js/zeus'
import { Counter } from './counter'
import './counter.css'

render(
  () => <Counter />,
  document.querySelector('#root')!,
)
`,
  },
  {
    path: 'src/counter.tsx',
    content: `import { createSignal } from '@zeus-js/zeus'

export const Counter = () => {
  const [count, setCount] = createSignal(0)
  return (
    <button onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
  )
}
`,
  },
  {
    path: 'src/counter.css',
    content: `button {
  box-shadow: 0 8px 24px rgb(22 102 83 / 18%);
}
`,
  },
]

const [files, setFiles] = createSignal<readonly EditableFile[]>(initialFiles)
const [activePath, setActivePath] = createSignal('src/main.tsx')
const [domOutput, setDomOutput] = createSignal('')
const [ssrOutput, setSsrOutput] = createSignal('')
const [diagnostics, setDiagnostics] = createSignal('[]')
const [status, setStatus] = createSignal('等待编译')
const [previewStatus, setPreviewStatus] = createSignal('预览沙箱等待编译')
const [busy, setBusy] = createSignal(false)
const [buildSequence, setBuildSequence] = createSignal(0)
const preview = new PreviewController(resolveSandboxUrl())
let compilerPromise: Promise<WorkerCompiler> | undefined

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
    entryPath: 'src/main.tsx',
    frameworkTarget: 'native',
    compilerVersion: 'wasm:0.1.1-beta.20',
    dependencies: [],
    files: files(),
    options: {
      delegateEvents: true,
      sourceMap: true,
      sandboxTimeoutMs: 3_000,
    },
  })
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
  if (activePath() === 'src/main.tsx' || files().length === 1) return
  setFiles(current => current.filter(file => file.path !== activePath()))
  setActivePath('src/main.tsx')
}

async function compile(): Promise<void> {
  setBusy(true)
  setStatus('正在用 WASM Worker 编译多文件工程…')
  setPreviewStatus('等待新构建')
  preview.stop()
  let snapshot: ReturnType<typeof projectSnapshot>
  let dom: PlaygroundCompileResult
  let ssr: PlaygroundCompileResult
  try {
    snapshot = projectSnapshot()
    const compiler = await getCompiler()
    const builds = await Promise.all([
      compileProject(snapshot, compiler, {
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
      }),
      compileProject(snapshot, compiler, {
        target: 'ssr',
        runtimeModule: '@zeus-js/runtime-ssr',
      }),
    ])
    dom = builds[0]
    ssr = builds[1]
    setDomOutput(formatBuild(dom))
    setSsrOutput(formatBuild(ssr))
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
    const build = await createPlaygroundPreview(dom)
    setPreviewStatus('正在隔离沙箱中执行…')
    const result = await preview.run(build, snapshot.options.sandboxTimeoutMs)
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
      packageName: 'zeus-playground-export',
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
          <p class="eyebrow">Zeus PR-27 · Shared Engine</p>
          <h1>Live WASM Playground</h1>
          <p>
            多文件工程由 Worker 编译，不可信代码只在 opaque-origin iframe
            中执行。
          </p>
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
