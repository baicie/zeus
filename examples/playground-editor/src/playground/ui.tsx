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
  commitSplit,
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
  previewReady,
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
  setPlaygroundLocale,
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
import {
  createHighlightScheduler,
  type HighlightOutcome,
} from './highlight-scheduler'
import { formatMessage, locale, t, type MessageKey } from './i18n'

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
          <span>{t('brand.tagline')}</span>
        </div>
      </div>
      <nav class="pg-products" aria-label={t('products.label')}>
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
          {t('product.native')}
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
          {t('product.webc')}
        </a>
      </nav>
      <div class="pg-toolbar-actions">
        <button
          type="button"
          class="pg-button quiet"
          data-testid="examples"
          onClick={() => examplesOpen.set(true)}
        >
          {t('toolbar.examples')}
        </button>
        <button
          type="button"
          class="pg-toggle"
          data-testid="auto-run"
          data-active={autoRun()}
          aria-pressed={autoRun()}
          onClick={toggleAutoRun}
          title={t('toolbar.autoRunTitle')}
        >
          <span class="pg-dot" />
          {t('toolbar.autoRun')}
        </button>
        <button
          type="button"
          class="pg-button primary"
          data-testid="compile"
          data-build-sequence={buildSequence()}
          onClick={() => void compile(true)}
        >
          {t('toolbar.run')}
        </button>
        <button
          type="button"
          class="pg-button"
          data-testid="stop"
          onClick={() => void stop()}
          disabled={!busy() && !previewReady()}
        >
          {t('toolbar.stop')}
        </button>
        <button
          type="button"
          class="pg-button quiet"
          data-testid="share"
          onClick={() => void share()}
        >
          {t('toolbar.share')}
        </button>
        <button
          type="button"
          class="pg-button quiet"
          data-testid="export"
          onClick={() => void exportZip()}
        >
          {t('toolbar.export')}
        </button>
        <details class="pg-settings">
          <summary class="pg-button quiet" data-testid="settings">
            {t('toolbar.settings')}
          </summary>
          <div class="pg-popover">
            <label class="pg-field">
              <span>{t('settings.theme')}</span>
              <select
                data-testid="theme-select"
                prop:value={theme()}
                onChange={event => {
                  const select = event.currentTarget as HTMLSelectElement
                  setTheme(select.value === 'dark' ? 'dark' : 'light')
                }}
              >
                <option value="light">{t('settings.themeLight')}</option>
                <option value="dark">{t('settings.themeDark')}</option>
              </select>
            </label>
            <label class="pg-field">
              <span>{t('settings.language')}</span>
              <select
                data-testid="locale-select"
                prop:value={locale()}
                onChange={event => {
                  const select = event.currentTarget as HTMLSelectElement
                  setPlaygroundLocale(select.value === 'zh-CN' ? 'zh-CN' : 'en')
                }}
              >
                <option value="en">English</option>
                <option value="zh-CN">中文</option>
              </select>
            </label>
            <label class="pg-field">
              <span>
                {t('settings.fontSize')} <b>{fontSize()}px</b>
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
              {t('settings.autoRun')}
            </label>
            <button type="button" class="pg-button" onClick={resetProject}>
              {t('settings.reset')}
            </button>
            <label class="pg-button file-import">
              {t('settings.import')}
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
      if (!resizing) return
      resizing = false
      setDragging(false)
      target.releasePointerCapture?.(event.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      // One write on release instead of one per animation frame.
      commitSplit()
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
      <section class="pg-pane pg-editor-pane" aria-label={t('editor.aria')}>
        <FileBar />
        <CodeEditor />
      </section>
      <button
        type="button"
        class="pg-split"
        aria-label={t('workspace.resize')}
        onPointerDown={startResize}
      />
      <section class="pg-pane pg-results-pane" aria-label={t('results.aria')}>
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
      <div class="pg-file-tabs" role="tablist" aria-label={t('results.files')}>
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
          aria-label={t('editor.addFile')}
          onClick={() => addFile()}
        >
          +
        </button>
        <button
          type="button"
          class="pg-icon-button"
          data-testid="remove-file"
          aria-label={t('editor.removeFile')}
          disabled={activePath() === files()[0]?.path || files().length === 1}
          onClick={removeActiveFile}
        >
          −
        </button>
      </div>
      <div class="pg-file-meta">
        <input
          aria-label={t('editor.activePath')}
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
          <span class="pg-unsaved" title={t('editor.unsavedTitle')}>
            {t('editor.unsaved')}
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
    handle.setAriaLabel(t('editor.codeAria'))
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
        ariaLabel: t('editor.codeAria'),
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
    locale()
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
    { id: 'preview' as const, label: t('tab.preview') },
    { id: 'output' as const, label: t('tab.output') },
    {
      id: 'console' as const,
      label: t('tab.console'),
      count: consoleEntries().length,
    },
    {
      id: 'problems' as const,
      label: t('tab.problems'),
      count: diagnosticItems().filter(item => item.severity === 'error').length,
    },
    { id: 'inspector' as const, label: t('tab.inspector') },
    { id: 'devtools' as const, label: t('tab.devtools') },
  ]
  return (
    <div class="pg-result-tabs" role="tablist" aria-label={t('results.aria')}>
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
        aria-label={t(
          previewMaximized() ? 'preview.restore' : 'preview.maximize',
        )}
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
          <strong>{t('preview.title')}</strong>
          <span class="pg-opaque-badge">{t('preview.opaque')}</span>
        </div>
        <Show when={stale()}>
          <span class="pg-stale" data-testid="stale-preview">
            {t('preview.stale')}
          </span>
        </Show>
      </div>
      <p class="pg-preview-status" data-testid="preview-status">
        {formatMessage(previewStatus())}
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

/**
 * Compiler output is plain text; render it through the shared token palette so
 * the Output tab reads like the editor. `innerHTML` is safe here because the
 * only source is the compiler's own module code, and every token is escaped
 * before it is inserted.
 *
 * The highlighter is loaded on demand: it pulls in `@codemirror/lang-javascript`
 * and, transitively, `@codemirror/view`, `state`, `language`, `autocomplete` and
 * `@lezer/javascript` — about 370 KB of minified code that the shell, the editor
 * and the preview never touch. None of it belongs on the critical path of a page
 * whose first paint is the editor.
 *
 * The three load states live in `highlight-scheduler.ts`: while the chunk is in
 * flight, and if it fails to load, the panel shows escaped plain text — readable,
 * and exactly what the highlighter falls back to on its own. It is never blank,
 * a failed load never becomes an unhandled rejection, and a result that arrives
 * after the code changed (or after the element was removed) is discarded.
 */
function HighlightedCode(props: {
  testId: string
  code: string
  empty: string
}) {
  let element: HTMLElement | undefined
  // One scheduler per mounted element, so two Output panels cannot interleave
  // their results.
  let schedule: ((code: string) => void) | undefined

  const write = (outcome: HighlightOutcome): void => {
    const target = element
    if (!target) return
    if (target.innerHTML !== outcome.html) target.innerHTML = outcome.html
    if (outcome.state === 'ready') {
      target.dataset.highlighted = 'true'
    } else {
      delete target.dataset.highlighted
    }
    if (outcome.state === 'failed' && outcome.error) {
      console.warn(
        `[playground] syntax highlighting unavailable: ${outcome.error}`,
      )
    }
  }

  createEffect(() => {
    const code = props.code
    if (!element) return
    if (!code) {
      element.textContent = props.empty
      delete element.dataset.highlighted
      return
    }
    schedule ??= createHighlightScheduler({ onOutcome: write })
    schedule(code)
  })

  return (
    <code
      data-testid={props.testId}
      ref={next => {
        element = next ?? undefined
      }}
    />
  )
}

function OutputPanel() {
  return (
    <section class="pg-result-panel" data-active={activeTab() === 'output'}>
      <div class="pg-panel-heading">
        <div>
          <strong>{t('output.title')}</strong>
          <span>{formatMessage(status())}</span>
        </div>
        <span class="pg-pill">{t('output.pill')}</span>
      </div>
      <h3>{t('output.dom')}</h3>
      <pre class="pg-code-output">
        <HighlightedCode
          testId="dom-output"
          code={domOutput()}
          empty={t('output.domEmpty')}
        />
      </pre>
      <h3>{t('output.ssr')}</h3>
      <pre class="pg-code-output">
        <HighlightedCode
          testId="ssr-output"
          code={ssrOutput()}
          empty={t('output.ssrEmpty')}
        />
      </pre>
      <details class="pg-raw-diagnostics">
        <summary>{t('output.raw')}</summary>
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
          <strong>{t('console.title')}</strong>
          <span>{t('console.subtitle')}</span>
        </div>
        <div class="pg-panel-actions">
          <button type="button" class="pg-button small" onClick={filterConsole}>
            {t(
              consoleFilter() === 'all'
                ? 'console.errorsOnly'
                : 'console.showAll',
            )}
          </button>
          <button type="button" class="pg-button small" onClick={copyConsole}>
            {t('console.copy')}
          </button>
          <button type="button" class="pg-button small" onClick={clearConsole}>
            {t('console.clear')}
          </button>
        </div>
      </div>
      <Show
        when={entries().length > 0}
        fallback={<p class="pg-empty">{t('console.empty')}</p>}
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
          <strong>{t('problems.title')}</strong>
          <span>
            {t('problems.summary', { count: diagnosticItems().length })}
          </span>
        </div>
        <span class="pg-pill">{formatMessage(status())}</span>
      </div>
      <Show
        when={diagnosticItems().length > 0}
        fallback={<p class="pg-empty">{t('problems.empty')}</p>}
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
        fallback={<p class="pg-empty">{t('inspector.onlyWebc')}</p>}
      >
        <div class="pg-panel-heading">
          <div>
            <strong>{t('inspector.title')}</strong>
            <span>{t('inspector.subtitle')}</span>
          </div>
          <button
            type="button"
            class="pg-button small"
            data-testid="preview-frameworks"
            onClick={() => void previewFrameworks()}
          >
            {t('inspector.previewFrameworks')}
          </button>
        </div>
        <p class="pg-note" data-testid="framework-preview-status">
          {formatMessage(frameworkPreviewStatus())}
        </p>
        <h3>{t('inspector.manifest')}</h3>
        <pre class="pg-code-output">
          <code data-testid="webc-manifest">
            {webcManifest() || t('inspector.manifestEmpty')}
          </code>
        </pre>
        <h3>{t('inspector.declarations')}</h3>
        <pre class="pg-code-output">
          <code data-testid="webc-declarations">
            {webcDeclarations() || t('inspector.declarationsEmpty')}
          </code>
        </pre>
        <div data-testid="webc-inspector" class="pg-inspector">
          <For each={webcInspector()}>
            {component => (
              <article class="pg-inspector-card">
                <h3>&lt;{component.tag}&gt;</h3>
                <p>
                  {t(component.shadow ? 'inspector.shadow' : 'inspector.light')}
                  {component.formAssociated
                    ? ` · ${t('inspector.formAssociated')}`
                    : ''}
                </p>
                <h4>{t('inspector.props')}</h4>
                <ul>
                  <For each={component.props}>
                    {prop => (
                      <li>
                        {prop.name}: {prop.type}
                      </li>
                    )}
                  </For>
                </ul>
                <h4>{t('inspector.events')}</h4>
                <ul>
                  <For each={component.events}>
                    {event => <li>{event.name}</li>}
                  </For>
                </ul>
                <h4>{t('inspector.slots')}</h4>
                <ul>
                  <For each={component.slots}>
                    {slot => <li>{slot || t('inspector.defaultSlot')}</li>}
                  </For>
                </ul>
              </article>
            )}
          </For>
        </div>
        <p class="pg-note">
          {t('inspector.hostNote')}
          <a href="/host.html" target="_blank" rel="noreferrer">
            {t('inspector.openHost')}
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
        fallback={<p class="pg-empty">{t('devtools.onlyNative')}</p>}
      >
        <div class="pg-panel-heading">
          <div>
            <strong>{t('devtools.title')}</strong>
            <span>{t('devtools.subtitle')}</span>
          </div>
          <span class="pg-pill" data-testid="devtools-hmr-count">
            {t('devtools.hmrCount', { count: hmrModules().length })}
          </span>
        </div>
        <div data-testid="runtime-devtools">
          <DevtoolsSnapshot />
        </div>
        <h3>{t('devtools.hmr')}</h3>
        <div class="pg-hmr" data-testid="hmr-list">
          <Show
            when={hmrModules().length > 0}
            fallback={<p class="pg-empty">{t('devtools.hmrEmpty')}</p>}
          >
            <For each={hmrModules()}>
              {module => (
                <article class="pg-hmr-row">
                  <strong>{module.path}</strong>
                  <span class="pg-pill" data-testid={`hmr-kind-${module.path}`}>
                    {module.hmr.initial
                      ? t('hmr.firstBuild')
                      : module.hmr.classification?.kind === 'unknown'
                        ? t('hmr.unchanged')
                        : t(
                            hmrKindKey(
                              module.hmr.classification?.kind ?? 'unknown',
                            ),
                          )}
                  </span>
                  <span>
                    {module.hmr.plan
                      ? t('devtools.bindings', {
                          count: module.hmr.plan.bindings.length,
                        })
                      : t('devtools.noLiteralPlan')}
                  </span>
                </article>
              )}
            </For>
          </Show>
        </div>
        <h3>{t('devtools.performance')}</h3>
        <dl class="pg-metrics" data-testid="build-metrics">
          <dt>{t('devtools.metricCompile')}</dt>
          <dd>{buildMetrics().compileMs.toFixed(1)} ms</dd>
          <dt>{t('devtools.metricRun')}</dt>
          <dd>{buildMetrics().previewMs.toFixed(1)} ms</dd>
          <dt>{t('devtools.metricRuns')}</dt>
          <dd>{buildMetrics().runs}</dd>
          <dt>{t('devtools.metricDomBytes')}</dt>
          <dd>{buildMetrics().domBytes}</dd>
          <dt>{t('devtools.metricSsrBytes')}</dt>
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
        <dt>{t('devtools.mode')}</dt>
        <dd data-testid="devtools-mode">{snapshot()?.mode ?? 'unknown'}</dd>
        <dt>{t('devtools.events')}</dt>
        <dd>{snapshot()?.eventCount ?? 0}</dd>
        <dt>{t('devtools.owners')}</dt>
        <dd data-testid="devtools-owners">{snapshot()?.ownerCount ?? 0}</dd>
        <dt>{t('devtools.bindingsLabel')}</dt>
        <dd data-testid="devtools-bindings">{snapshot()?.bindingCount ?? 0}</dd>
        <dt>{t('devtools.effects')}</dt>
        <dd data-testid="devtools-effects">{snapshot()?.effectCount ?? 0}</dd>
        <dt>{t('devtools.signals')}</dt>
        <dd data-testid="devtools-sources">{snapshot()?.sourceCount ?? 0}</dd>
        <dt>{t('devtools.domNodes')}</dt>
        <dd data-testid="devtools-dom-nodes">
          {snapshot()?.domNodeCount ?? 0}
        </dd>
        <dt>{t('devtools.textNodes')}</dt>
        <dd data-testid="devtools-text-nodes">
          {snapshot()?.textNodeCount ?? 0}
        </dd>
      </dl>
    </div>
  )
}

function MobileSwitch() {
  return (
    <div class="pg-mobile-switch" role="tablist" aria-label={t('mobile.label')}>
      <button
        type="button"
        role="tab"
        data-active={mobilePane() === 'editor'}
        onClick={() => setMobilePane('editor')}
      >
        {t('mobile.editor')}
      </button>
      <button
        type="button"
        role="tab"
        data-active={mobilePane() === 'preview'}
        onClick={() => setMobilePane('preview')}
      >
        {t('mobile.preview')}
      </button>
    </div>
  )
}

function hmrKindKey(kind: string): MessageKey {
  if (
    kind === 'template-structure' ||
    kind === 'script-body' ||
    kind === 'style-only'
  ) {
    return `hmr.classification.${kind}` as MessageKey
  }
  return 'hmr.classification.unknown'
}

function StatusBar() {
  const errors = () =>
    diagnosticItems().filter(item => item.severity === 'error').length
  return (
    <footer class="pg-statusbar">
      <p data-testid="status">{formatMessage(status())}</p>
      <span
        class="pg-status-dot"
        data-state={errors() > 0 ? 'error' : busy() ? 'busy' : 'ready'}
      />
      <span>{t('status.problems', { count: errors() })}</span>
      <span>
        {t('status.compile', { ms: buildMetrics().compileMs.toFixed(1) })}
      </span>
      <span>
        {t('status.sandbox', { ms: buildMetrics().previewMs.toFixed(1) })}
      </span>
      <span>compiler wasm:0.1.1-beta.20</span>
      <span class="pg-status-spacer" />
      <span data-testid="save-state">
        {dirty()
          ? t('status.saving')
          : savedAt()
            ? t('status.saved')
            : t('status.notSaved')}
      </span>
      <span class="pg-status-opaque">{t('status.opaque')}</span>
    </footer>
  )
}

function ExampleDrawer() {
  const current = () => currentExample()
  return (
    <div class="pg-drawer-backdrop" onClick={() => examplesOpen.set(false)}>
      <aside
        class="pg-drawer"
        aria-label={t('drawer.aria')}
        onClick={event => event.stopPropagation()}
      >
        <div class="pg-drawer-heading">
          <div>
            <strong>{t('drawer.title')}</strong>
            <span>{t('drawer.subtitle')}</span>
          </div>
          <button
            type="button"
            class="pg-icon-button"
            aria-label={t('drawer.close')}
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
                  {t(
                    example.product === 'native-lab'
                      ? 'example.native'
                      : 'example.webc',
                  )}
                </span>
                <strong>{t(example.titleKey)}</strong>
                <span>{t(example.descriptionKey)}</span>
              </button>
            )}
          </For>
        </div>
        <div class="pg-drawer-footer">
          <button type="button" class="pg-button" onClick={resetCurrentExample}>
            {t('drawer.reset')}
          </button>
          <button
            type="button"
            class="pg-button"
            onClick={() => examplesOpen.set(false)}
          >
            {t('drawer.close')}
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
      {value() ? formatMessage(value()!.message) : ''}
    </button>
  )
}
