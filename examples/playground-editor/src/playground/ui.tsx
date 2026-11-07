import { For, Show, createEffect, createSignal, onCleanup } from '@zeus-js/zeus'

import type { CodeEditorHandle } from './code-editor-impl'
import {
  activeFile,
  activePath,
  activeTab,
  addFile,
  attachPreview,
  autoRun,
  buildMetrics,
  buildSequence,
  busy,
  clearConsole,
  compile,
  consoleEntries,
  consoleFilter,
  copyConsole,
  currentExample,
  devtoolsSnapshot,
  diagnosticItems,
  diagnosticsRaw,
  dirty,
  dismissToast,
  domOutput,
  examplesOpen,
  exportZip,
  filterConsole,
  files,
  focusDiagnostic,
  focusRequest,
  fontSize,
  frameworkPreviewStatus,
  hmrModules,
  importProject,
  initialize,
  loadExample,
  mobilePane,
  previewFrameworks,
  previewMaximized,
  previewStatus,
  product,
  removeActiveFile,
  renameActiveFile,
  resetCurrentExample,
  resetProject,
  savedAt,
  saveNow,
  selectProduct,
  selectTab,
  setActiveFilePath,
  setFontSize,
  setMobilePane,
  setSplit,
  setTheme,
  share,
  splitPercent,
  ssrOutput,
  stale,
  status,
  stop,
  theme,
  toast,
  toggleAutoRun,
  togglePreviewMax,
  updateSource,
  webcDeclarations,
  webcInspector,
  webcManifest,
} from './controller'
import type { ConsoleEntry, DiagnosticItem } from './model'
import { examples as allExamples } from './examples'
import { productHref } from '../products'

export function PlaygroundShell() {
  let initialized = false
  if (!initialized) {
    initialized = true
    void initialize()
  }
  return (
    <div class="pg-shell">
      <TopBar />
      <Workspace />
      <StatusBar />
      <Show when={examplesOpen()}>
        <ExampleDrawer />
      </Show>
      <Show when={toast()}>
        <Toast />
      </Show>
    </div>
  )
}

function TopBar() {
  return (
    <header class="pg-toolbar">
      <div class="pg-brand">
        <span class="pg-logo" aria-hidden="true">
          Z
        </span>
        <div>
          <strong>Zeus Playground</strong>
          <span>Native TSX · Web Components</span>
        </div>
      </div>
      <nav class="pg-products" aria-label="Playground products">
        <a
          href={productHref('native-lab')}
          class="pg-product"
          data-active={product() === 'native-lab'}
          data-testid="product-native"
          onClick={event => {
            event.preventDefault()
            selectProduct('native-lab')
          }}
        >
          Native
        </a>
        <a
          href={productHref('webc-studio')}
          class="pg-product"
          data-active={product() === 'webc-studio'}
          data-testid="product-webc"
          onClick={event => {
            event.preventDefault()
            selectProduct('webc-studio')
          }}
        >
          WebC
        </a>
      </nav>
      <div class="pg-toolbar-actions">
        <button
          type="button"
          class="pg-button quiet"
          data-testid="examples"
          onClick={() => examplesOpen.set(true)}
        >
          Examples
        </button>
        <button
          type="button"
          class="pg-toggle"
          data-testid="auto-run"
          data-active={autoRun()}
          aria-pressed={autoRun()}
          onClick={toggleAutoRun}
          title="Compile after a short typing pause"
        >
          <span class="pg-dot" />
          Auto
        </button>
        <button
          type="button"
          class="pg-button primary"
          data-testid="compile"
          data-build-sequence={buildSequence()}
          onClick={() => void compile(true)}
        >
          Run
        </button>
        <button
          type="button"
          class="pg-button"
          data-testid="stop"
          onClick={() => void stop()}
          disabled={!busy() && !previewStatus().includes('ready')}
        >
          Stop
        </button>
        <button
          type="button"
          class="pg-button quiet"
          data-testid="share"
          onClick={() => void share()}
        >
          Share
        </button>
        <button
          type="button"
          class="pg-button quiet"
          data-testid="export"
          onClick={() => void exportZip()}
        >
          Export
        </button>
        <details class="pg-settings">
          <summary class="pg-button quiet" data-testid="settings">
            Settings
          </summary>
          <div class="pg-popover">
            <label class="pg-field">
              <span>Theme</span>
              <select
                prop:value={theme()}
                onChange={event => {
                  const select = event.currentTarget as HTMLSelectElement
                  setTheme(select.value === 'light' ? 'light' : 'dark')
                }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label class="pg-field">
              <span>
                Font size <b>{fontSize()}px</b>
              </span>
              <input
                type="range"
                min="12"
                max="20"
                value={fontSize()}
                onInput={event =>
                  setFontSize(
                    Number((event.currentTarget as HTMLInputElement).value),
                  )
                }
              />
            </label>
            <label class="pg-check">
              <input
                type="checkbox"
                checked={autoRun()}
                onChange={toggleAutoRun}
              />
              Auto Run
            </label>
            <button type="button" class="pg-button" onClick={resetProject}>
              Reset workspace
            </button>
            <label class="pg-button file-import">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={event => {
                  const file = (event.currentTarget as HTMLInputElement)
                    .files?.[0]
                  if (file) void importProject(file)
                }}
              />
            </label>
          </div>
        </details>
      </div>
    </header>
  )
}

function Workspace() {
  let workspaceElement: HTMLDivElement | undefined
  let resizing = false
  const [dragging, setDragging] = createSignal(false)

  function startResize(event: PointerEvent): void {
    event.preventDefault()
    resizing = true
    setDragging(true)
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture?.(event.pointerId)
    const move = (moveEvent: PointerEvent) => {
      if (!resizing || !workspaceElement) return
      const rect = workspaceElement.getBoundingClientRect()
      const percent = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setSplit(percent)
    }
    const end = () => {
      resizing = false
      setDragging(false)
      target.releasePointerCapture?.(event.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    onCleanup(() => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    })
  }

  return (
    <div
      class="pg-workspace"
      data-preview-max={previewMaximized()}
      data-resizing={dragging()}
      data-mobile-pane={mobilePane()}
      style={`--pg-editor-width: ${splitPercent()}%`}
      ref={element => {
        workspaceElement = element ?? undefined
      }}
    >
      <section class="pg-pane pg-editor-pane" aria-label="Editor">
        <FileBar />
        <CodeEditor />
      </section>
      <button
        type="button"
        class="pg-split"
        aria-label="Resize editor and preview"
        onPointerDown={startResize}
      />
      <section class="pg-pane pg-results-pane" aria-label="Results">
        <ResultsTabs />
        <div class="pg-results-body">
          <PreviewPanel />
          <OutputPanel />
          <ConsolePanel />
          <ProblemsPanel />
          <InspectorPanel />
          <DevtoolsPanel />
        </div>
      </section>
      <MobileSwitch />
    </div>
  )
}

function FileBar() {
  let renameValue = ''
  return (
    <div class="pg-filebar">
      <div class="pg-file-tabs" role="tablist" aria-label="Project files">
        <For each={files()}>
          {file => (
            <button
              type="button"
              role="tab"
              aria-selected={file.path === activePath()}
              data-active={file.path === activePath()}
              class="pg-file-tab"
              onClick={() => setActiveFilePath(file.path)}
            >
              <span
                class="pg-file-kind"
                data-kind={file.path.split('.').pop()}
              />
              {file.path.split('/').pop()}
            </button>
          )}
        </For>
        <button
          type="button"
          class="pg-icon-button"
          data-testid="add-file"
          aria-label="Add file"
          onClick={() => addFile()}
        >
          +
        </button>
        <button
          type="button"
          class="pg-icon-button"
          data-testid="remove-file"
          aria-label="Remove file"
          disabled={activePath() === files()[0]?.path || files().length === 1}
          onClick={removeActiveFile}
        >
          −
        </button>
      </div>
      <div class="pg-file-meta">
        <input
          aria-label="Active file path; edit to rename"
          data-testid="active-file"
          data-path-input="true"
          value={activePath()}
          onInput={event => {
            renameValue = (event.currentTarget as HTMLInputElement).value
          }}
          onBlur={() => {
            if (renameValue && renameValue !== activePath())
              renameActiveFile(renameValue)
            renameValue = ''
          }}
          onKeyDown={event => {
            if (event.key === 'Enter')
              (event.currentTarget as HTMLInputElement).blur()
          }}
        />
        <Show when={dirty()}>
          <span class="pg-unsaved" title="Draft is being saved locally">
            unsaved
          </span>
        </Show>
      </div>
    </div>
  )
}

function CodeEditor() {
  let mountElement: HTMLDivElement | undefined
  let handle: CodeEditorHandle | undefined
  let loading = false
  let [ready, setReady] = createSignal(false)

  function currentErrors(): readonly number[] {
    return diagnosticItems()
      .filter(item => item.file === activePath() && item.line !== undefined)
      .map(item => item.line!)
  }

  function sync(): void {
    if (!handle) return
    const file = activeFile()
    handle.setDoc(
      file.content,
      file.path.endsWith('.css') ? 'css' : 'ts',
      currentErrors(),
    )
    handle.setAppearance(theme(), fontSize())
  }

  function mount(): void {
    if (!mountElement || handle || loading) return
    loading = true
    void import('./code-editor-impl').then(module => {
      loading = false
      if (!mountElement || handle) return
      handle = module.mountCodeEditor({
        parent: mountElement,
        doc: activeFile().content,
        language: activeFile().path.endsWith('.css') ? 'css' : 'ts',
        theme: theme(),
        fontSize: fontSize(),
        onChange: updateSource,
        onRun: () => void compile(true),
        onSave: saveNow,
      })
      setReady(true)
      sync()
    })
  }

  createEffect(() => {
    activePath()
    activeFile().content
    theme()
    fontSize()
    diagnosticItems()
    if (handle) sync()
    else mount()
  })

  createEffect(() => {
    const request = focusRequest()
    if (!request || request.file !== activePath() || !request.line || !handle)
      return
    handle.focusLine(request.line)
  })

  onCleanup(() => {
    handle?.destroy()
    handle = undefined
  })

  return (
    <div class="pg-editor-shell">
      <div
        class="pg-code-editor"
        data-testid="editor"
        data-ready={ready()}
        ref={element => {
          mountElement = element ?? undefined
          mount()
        }}
      />
      <Show when={!ready()}>
        <textarea
          class="pg-editor-fallback"
          data-testid="source"
          spellcheck={false}
          value={activeFile().content}
          onInput={event =>
            updateSource((event.currentTarget as HTMLTextAreaElement).value)
          }
        />
      </Show>
    </div>
  )
}

function ResultsTabs() {
  const tabs = () => [
    { id: 'preview' as const, label: 'Preview' },
    { id: 'output' as const, label: 'Output' },
    {
      id: 'console' as const,
      label: 'Console',
      count: consoleEntries().length,
    },
    {
      id: 'problems' as const,
      label: 'Problems',
      count: diagnosticItems().filter(item => item.severity === 'error').length,
    },
    { id: 'inspector' as const, label: 'Inspector' },
    { id: 'devtools' as const, label: 'DevTools' },
  ]
  return (
    <div class="pg-result-tabs" role="tablist" aria-label="Results">
      <For each={tabs()}>
        {tab => (
          <button
            type="button"
            role="tab"
            data-testid={`tab-${tab.id}`}
            aria-selected={activeTab() === tab.id}
            data-active={activeTab() === tab.id}
            class="pg-result-tab"
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
            <Show
              when={'count' in tab && (tab as { count?: number }).count! > 0}
            >
              <span class="pg-badge">{(tab as { count: number }).count}</span>
            </Show>
          </button>
        )}
      </For>
      <span class="pg-result-spacer" />
      <button
        type="button"
        class="pg-icon-button"
        aria-label={previewMaximized() ? 'Restore editor' : 'Maximize preview'}
        data-testid="preview-max"
        onClick={togglePreviewMax}
      >
        {previewMaximized() ? '⤡' : '⤢'}
      </button>
    </div>
  )
}

function PreviewPanel() {
  let mounted = false
  return (
    <section
      class="pg-result-panel pg-preview-panel"
      data-active={activeTab() === 'preview'}
    >
      <div class="pg-preview-toolbar">
        <div>
          <strong>Preview</strong>
          <span class="pg-opaque-badge">opaque origin</span>
        </div>
        <Show when={stale()}>
          <span class="pg-stale" data-testid="stale-preview">
            Preview is stale
          </span>
        </Show>
      </div>
      <p class="pg-preview-status" data-testid="preview-status">
        {previewStatus()}
      </p>
      <div
        class="pg-preview-host"
        data-testid="preview-host"
        ref={element => {
          if (!element || mounted) return
          mounted = true
          attachPreview(element)
        }}
      />
    </section>
  )
}

function OutputPanel() {
  return (
    <section class="pg-result-panel" data-active={activeTab() === 'output'}>
      <div class="pg-panel-heading">
        <div>
          <strong>Compiler output</strong>
          <span>{status()}</span>
        </div>
        <span class="pg-pill">DOM + SSR</span>
      </div>
      <h3>DOM module</h3>
      <pre class="pg-code-output">
        <code data-testid="dom-output">
          {domOutput() || 'Run the project to inspect DOM output.'}
        </code>
      </pre>
      <h3>SSR module</h3>
      <pre class="pg-code-output">
        <code data-testid="ssr-output">
          {ssrOutput() || 'Run the project to inspect SSR output.'}
        </code>
      </pre>
      <details class="pg-raw-diagnostics">
        <summary>Source maps and raw diagnostics</summary>
        <pre data-testid="diagnostics">{diagnosticsRaw()}</pre>
      </details>
    </section>
  )
}

function ConsolePanel() {
  const entries = () =>
    consoleFilter() === 'error'
      ? consoleEntries().filter(entry => entry.level === 'error')
      : consoleEntries()
  return (
    <section class="pg-result-panel" data-active={activeTab() === 'console'}>
      <div class="pg-panel-heading">
        <div>
          <strong>Console</strong>
          <span>Isolated sandbox output</span>
        </div>
        <div class="pg-panel-actions">
          <button type="button" class="pg-button small" onClick={filterConsole}>
            {consoleFilter() === 'all' ? 'Errors only' : 'Show all'}
          </button>
          <button type="button" class="pg-button small" onClick={copyConsole}>
            Copy
          </button>
          <button type="button" class="pg-button small" onClick={clearConsole}>
            Clear
          </button>
        </div>
      </div>
      <Show
        when={entries().length > 0}
        fallback={
          <p class="pg-empty">Console output from the preview appears here.</p>
        }
      >
        <ol class="pg-console" data-testid="console">
          <For each={entries()}>{entry => <ConsoleRow entry={entry} />}</For>
        </ol>
      </Show>
    </section>
  )
}

function ConsoleRow(props: { entry: ConsoleEntry }) {
  return (
    <li class="pg-console-row" data-level={props.entry.level}>
      <time>{new Date(props.entry.timestamp).toLocaleTimeString()}</time>
      <span class="pg-console-level">{props.entry.level}</span>
      <code>{props.entry.message}</code>
    </li>
  )
}

function ProblemsPanel() {
  return (
    <section class="pg-result-panel" data-active={activeTab() === 'problems'}>
      <div class="pg-panel-heading">
        <div>
          <strong>Problems</strong>
          <span>
            {diagnosticItems().length} diagnostics from the current build
          </span>
        </div>
        <span class="pg-pill">{status()}</span>
      </div>
      <Show
        when={diagnosticItems().length > 0}
        fallback={
          <p class="pg-empty">No problems. Your preview is up to date.</p>
        }
      >
        <ul class="pg-problems" data-testid="problems">
          <For each={diagnosticItems()}>
            {item => (
              <li>
                <button
                  type="button"
                  class="pg-problem"
                  data-severity={item.severity}
                  onClick={() => focusDiagnostic(item)}
                >
                  <span class="pg-problem-icon">
                    {item.severity === 'error' ? '×' : '!'}
                  </span>
                  <span class="pg-problem-copy">
                    <strong>{item.message}</strong>
                    <span>
                      {item.file}
                      {item.line
                        ? `:${item.line}${item.column ? `:${item.column}` : ''}`
                        : ''}{' '}
                      · {item.code}
                    </span>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}

function InspectorPanel() {
  return (
    <section class="pg-result-panel" data-active={activeTab() === 'inspector'}>
      <Show
        when={product() === 'webc-studio'}
        fallback={
          <p class="pg-empty">Inspector is available in WebC Studio.</p>
        }
      >
        <div class="pg-panel-heading">
          <div>
            <strong>Component inspector</strong>
            <span>Manifest, declarations and framework consumption</span>
          </div>
          <button
            type="button"
            class="pg-button small"
            data-testid="preview-frameworks"
            onClick={() => void previewFrameworks()}
          >
            Preview React + Vue
          </button>
        </div>
        <p class="pg-note" data-testid="framework-preview-status">
          {frameworkPreviewStatus()}
        </p>
        <h3>Manifest</h3>
        <pre class="pg-code-output">
          <code data-testid="webc-manifest">
            {webcManifest() || 'Run a WebC project to generate the manifest.'}
          </code>
        </pre>
        <h3>Declarations</h3>
        <pre class="pg-code-output">
          <code data-testid="webc-declarations">
            {webcDeclarations() ||
              'Per-tag DTS appears after a successful compile.'}
          </code>
        </pre>
        <div data-testid="webc-inspector" class="pg-inspector">
          <For each={webcInspector()}>
            {component => (
              <article class="pg-inspector-card">
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
                        {prop.name}: {prop.type}
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
              </article>
            )}
          </For>
        </div>
        <p class="pg-note">
          The same Custom Element implementation is mounted in real React 19 and
          Vue 3 hosts.
          <a href="/host.html" target="_blank" rel="noreferrer">
            Open reference host
          </a>
        </p>
      </Show>
    </section>
  )
}

function DevtoolsPanel() {
  return (
    <section class="pg-result-panel" data-active={activeTab() === 'devtools'}>
      <Show
        when={product() === 'native-lab'}
        fallback={<p class="pg-empty">DevTools are available in Native Lab.</p>}
      >
        <div class="pg-panel-heading">
          <div>
            <strong>Runtime DevTools</strong>
            <span>Signals, bindings and sandbox inspection</span>
          </div>
          <span class="pg-pill" data-testid="devtools-hmr-count">
            {hmrModules().length} HMR modules
          </span>
        </div>
        <div data-testid="runtime-devtools">
          <DevtoolsSnapshot />
        </div>
        <h3>HMR classification</h3>
        <div class="pg-hmr" data-testid="hmr-list">
          <Show
            when={hmrModules().length > 0}
            fallback={
              <p class="pg-empty">Run the project to inspect HMR plans.</p>
            }
          >
            <For each={hmrModules()}>
              {module => (
                <article class="pg-hmr-row">
                  <strong>{module.path}</strong>
                  <span class="pg-pill" data-testid={`hmr-kind-${module.path}`}>
                    {module.hmr.initial
                      ? 'first-build'
                      : module.hmr.classification?.kind === 'unknown'
                        ? 'unchanged'
                        : (module.hmr.classification?.kind ?? 'unchanged')}
                  </span>
                  <span>
                    {module.hmr.plan
                      ? `${module.hmr.plan.bindings.length} bindings`
                      : 'no literal plan'}
                  </span>
                </article>
              )}
            </For>
          </Show>
        </div>
        <h3>Build performance</h3>
        <dl class="pg-metrics" data-testid="build-metrics">
          <dt>WASM compile</dt>
          <dd>{buildMetrics().compileMs.toFixed(1)} ms</dd>
          <dt>Sandbox run</dt>
          <dd>{buildMetrics().previewMs.toFixed(1)} ms</dd>
          <dt>Runs</dt>
          <dd>{buildMetrics().runs}</dd>
          <dt>DOM bytes</dt>
          <dd>{buildMetrics().domBytes}</dd>
          <dt>SSR bytes</dt>
          <dd>{buildMetrics().ssrBytes}</dd>
        </dl>
      </Show>
    </section>
  )
}

function DevtoolsSnapshot() {
  const snapshot = () => devtoolsSnapshot()
  return (
    <div data-testid="runtime-devtools-content">
      <dl class="pg-metrics">
        <dt>Mode</dt>
        <dd data-testid="devtools-mode">{snapshot()?.mode ?? 'unknown'}</dd>
        <dt>Events</dt>
        <dd>{snapshot()?.eventCount ?? 0}</dd>
        <dt>Owners</dt>
        <dd data-testid="devtools-owners">{snapshot()?.ownerCount ?? 0}</dd>
        <dt>Bindings</dt>
        <dd data-testid="devtools-bindings">{snapshot()?.bindingCount ?? 0}</dd>
        <dt>Effects</dt>
        <dd data-testid="devtools-effects">{snapshot()?.effectCount ?? 0}</dd>
        <dt>Signals</dt>
        <dd data-testid="devtools-sources">{snapshot()?.sourceCount ?? 0}</dd>
        <dt>DOM nodes</dt>
        <dd data-testid="devtools-dom-nodes">
          {snapshot()?.domNodeCount ?? 0}
        </dd>
        <dt>Text nodes</dt>
        <dd data-testid="devtools-text-nodes">
          {snapshot()?.textNodeCount ?? 0}
        </dd>
      </dl>
    </div>
  )
}

function MobileSwitch() {
  return (
    <div class="pg-mobile-switch" role="tablist" aria-label="Mobile view">
      <button
        type="button"
        role="tab"
        data-active={mobilePane() === 'editor'}
        onClick={() => setMobilePane('editor')}
      >
        Editor
      </button>
      <button
        type="button"
        role="tab"
        data-active={mobilePane() === 'preview'}
        onClick={() => setMobilePane('preview')}
      >
        Preview
      </button>
    </div>
  )
}

function StatusBar() {
  const errors = () =>
    diagnosticItems().filter(item => item.severity === 'error').length
  return (
    <footer class="pg-statusbar">
      <p data-testid="status">{status()}</p>
      <span
        class="pg-status-dot"
        data-state={errors() > 0 ? 'error' : busy() ? 'busy' : 'ready'}
      />
      <span>{errors()} problems</span>
      <span>{buildMetrics().compileMs.toFixed(1)} ms compile</span>
      <span>{buildMetrics().previewMs.toFixed(1)} ms sandbox</span>
      <span>compiler wasm:0.1.1-beta.20</span>
      <span class="pg-status-spacer" />
      <span data-testid="save-state">
        {dirty() ? 'Saving…' : savedAt() ? 'Saved locally' : 'Not saved yet'}
      </span>
      <span class="pg-status-opaque">opaque sandbox</span>
    </footer>
  )
}

function ExampleDrawer() {
  const current = () => currentExample()
  return (
    <div class="pg-drawer-backdrop" onClick={() => examplesOpen.set(false)}>
      <aside
        class="pg-drawer"
        aria-label="Examples"
        onClick={event => event.stopPropagation()}
      >
        <div class="pg-drawer-heading">
          <div>
            <strong>Examples</strong>
            <span>Start from a working project.</span>
          </div>
          <button
            type="button"
            class="pg-icon-button"
            aria-label="Close examples"
            onClick={() => examplesOpen.set(false)}
          >
            ×
          </button>
        </div>
        <div class="pg-drawer-list">
          <For each={allExamples}>
            {example => (
              <button
                type="button"
                class="pg-example"
                data-active={current()?.id === example.id}
                data-testid={`example-${example.id}`}
                onClick={() => loadExample(example)}
              >
                <span class="pg-example-product">
                  {example.product === 'native-lab' ? 'Native' : 'WebC'}
                </span>
                <strong>{example.title}</strong>
                <span>{example.description}</span>
              </button>
            )}
          </For>
        </div>
        <div class="pg-drawer-footer">
          <button type="button" class="pg-button" onClick={resetCurrentExample}>
            Reset example
          </button>
          <button
            type="button"
            class="pg-button"
            onClick={() => examplesOpen.set(false)}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}

function Toast() {
  const value = () => toast()
  return (
    <button
      type="button"
      class="pg-toast"
      data-kind={value()?.kind}
      data-testid="toast"
      onClick={dismissToast}
    >
      {value()?.message}
    </button>
  )
}
