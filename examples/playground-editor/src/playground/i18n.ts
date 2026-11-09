import { createSignal } from '@zeus-js/zeus'

export type PlaygroundLocale = 'en' | 'zh'

/** Every key is a literal table entry plus the plural-aware keys. */
export type MessageKey = keyof typeof messages.en | PluralKey

export type MessageParams = Readonly<Record<string, string | number>>

const messages = {
  en: {
    'brand.tagline': 'Native TSX · Web Components',
    'products.label': 'Playground products',
    'product.native': 'Native',
    'product.webc': 'WebC',
    'toolbar.examples': 'Examples',
    'toolbar.autoRun': 'Auto',
    'toolbar.autoRunTitle': 'Compile after a short typing pause',
    'toolbar.run': 'Run',
    'toolbar.stop': 'Stop',
    'toolbar.share': 'Share',
    'toolbar.export': 'Export',
    'toolbar.settings': 'Settings',
    'settings.theme': 'Theme',
    'settings.themeLight': 'Light',
    'settings.themeDark': 'Dark',
    'settings.language': 'Language',
    'settings.fontSize': 'Font size',
    'settings.autoRun': 'Auto Run',
    'settings.reset': 'Reset workspace',
    'settings.import': 'Import JSON',
    'editor.aria': 'Editor',
    'results.files': 'Project files',
    'editor.codeAria': 'Code editor',
    'editor.addFile': 'Add file',
    'editor.removeFile': 'Remove file',
    'editor.activePath': 'Active file path; edit to rename',
    'editor.unsaved': 'unsaved',
    'editor.unsavedTitle': 'Draft is being saved locally',
    'results.aria': 'Results',
    'workspace.resize': 'Resize editor and preview',
    'tab.preview': 'Preview',
    'tab.output': 'Output',
    'tab.console': 'Console',
    'tab.problems': 'Problems',
    'tab.inspector': 'Inspector',
    'tab.devtools': 'DevTools',
    'preview.title': 'Preview',
    'preview.frameTitle': 'Zeus playground sandbox',
    'preview.opaque': 'opaque origin',
    'preview.stale': 'Preview is stale',
    'preview.maximize': 'Maximize preview',
    'preview.restore': 'Restore editor',
    'output.title': 'Compiler output',
    'output.pill': 'DOM + SSR',
    'output.dom': 'DOM module',
    'output.ssr': 'SSR module',
    'output.domEmpty': 'Run the project to inspect DOM output.',
    'output.ssrEmpty': 'Run the project to inspect SSR output.',
    'output.raw': 'Source maps and raw diagnostics',
    'console.title': 'Console',
    'console.subtitle': 'Isolated sandbox output',
    'console.errorsOnly': 'Errors only',
    'console.showAll': 'Show all',
    'console.copy': 'Copy',
    'console.clear': 'Clear',
    'console.empty': 'Console output from the preview appears here.',
    'problems.title': 'Problems',
    'problems.summary': '{count} diagnostics from the current build',
    'problems.empty': 'No problems. Your preview is up to date.',
    'inspector.title': 'Component inspector',
    'inspector.subtitle': 'Manifest, declarations and framework consumption',
    'inspector.previewFrameworks': 'Preview React + Vue',
    'inspector.manifestEmpty': 'Run a WebC project to generate the manifest.',
    'inspector.declarationsEmpty':
      'Per-tag DTS appears after a successful compile.',
    'inspector.onlyWebc': 'Inspector is available in WebC Studio.',
    'inspector.shadow': 'Shadow DOM',
    'inspector.light': 'Light DOM',
    'inspector.formAssociated': 'form-associated',
    'inspector.props': 'Props',
    'inspector.events': 'Events',
    'inspector.slots': 'Slots',
    'inspector.defaultSlot': 'default',
    'inspector.manifest': 'Manifest',
    'inspector.declarations': 'Declarations',
    'inspector.hostNote':
      'The same Custom Element implementation is mounted in real React 19 and Vue 3 hosts.',
    'inspector.openHost': 'Open reference host',
    'devtools.title': 'Runtime DevTools',
    'devtools.subtitle': 'Signals, bindings and sandbox inspection',
    'devtools.hmrCount': '{count} HMR modules',
    'devtools.hmr': 'HMR classification',
    'devtools.hmrEmpty': 'Run the project to inspect HMR plans.',
    'devtools.bindings': '{count} bindings',
    'devtools.noLiteralPlan': 'no literal plan',
    'devtools.performance': 'Build performance',
    'devtools.metricCompile': 'WASM compile',
    'devtools.metricRun': 'Sandbox run',
    'devtools.metricRuns': 'Runs',
    'devtools.metricDomBytes': 'DOM bytes',
    'devtools.metricSsrBytes': 'SSR bytes',
    'devtools.mode': 'Mode',
    'devtools.events': 'Events',
    'devtools.owners': 'Owners',
    'devtools.bindingsLabel': 'Bindings',
    'devtools.effects': 'Effects',
    'devtools.signals': 'Signals',
    'devtools.domNodes': 'DOM nodes',
    'devtools.textNodes': 'Text nodes',
    'devtools.onlyNative': 'DevTools are available in Native Lab.',
    'hmr.firstBuild': 'first-build',
    'hmr.unchanged': 'unchanged',
    'hmr.classification.template-structure': 'template-structure',
    'hmr.classification.script-body': 'script-body',
    'hmr.classification.style-only': 'style-only',
    'hmr.classification.unknown': 'unknown',
    'mobile.label': 'Mobile view',
    'mobile.editor': 'Editor',
    'mobile.preview': 'Preview',
    'status.problems': '{count} problems',
    'status.compile': '{ms} ms compile',
    'status.sandbox': '{ms} ms sandbox',
    'status.saving': 'Saving…',
    'status.saved': 'Saved locally',
    'status.notSaved': 'Not saved yet',
    'status.opaque': 'opaque sandbox',
    'status.ready': 'Ready',
    'status.compiling': 'Compiling…',
    'status.autoRunning': 'Auto-running…',
    'status.compiled': 'Compiled {count} modules · {ms} ms',
    'status.compileFailed': 'Compile failed.',
    'status.stopped': 'Stopped',
    'status.exporting': 'Preparing project archive…',
    'status.exported': 'Exported {count} files as ZIP.',
    'status.exportFailed': 'Export failed.',
    'preview.idle': 'Preview will appear after the first run.',
    'preview.compiling': 'Compiling project…',
    'preview.rebuilding': 'Rebuilding preview…',
    'preview.running': 'Running in the opaque sandbox…',
    'preview.ready': 'Preview ready · {ms} ms',
    'preview.readyWithExports': 'Preview ready · {ms} ms · {names}',
    'preview.staleFix': 'Preview is stale — fix the reported problems.',
    'preview.staleRejected':
      'Preview is stale — the compiler rejected this project.',
    'preview.stopped': 'Preview stopped. Run again when ready.',
    'frameworks.idle':
      'Compile a WebC project, then preview it in isolated React and Vue hosts.',
    'frameworks.needCompile': 'Compile a WebC project first.',
    'frameworks.mounting': 'Mounting React and Vue in the opaque sandbox…',
    'frameworks.mounted': 'React and Vue hosts mounted in the opaque sandbox.',
    'drawer.aria': 'Examples',
    'drawer.title': 'Examples',
    'drawer.subtitle': 'Start from a working project.',
    'drawer.close': 'Close',
    'drawer.reset': 'Reset example',
    'toast.consoleCopied': 'Console copied.',
    'toast.clipboardUnavailable': 'Clipboard is unavailable.',
    'toast.saveFailed': 'Draft could not be saved in this browser mode.',
    'toast.workspaceReset': 'Workspace reset.',
    'toast.projectImported': 'Project imported.',
    'toast.exportDownloaded': 'Project ZIP downloaded.',
    'toast.importTooLarge': 'Project JSON is larger than 1.5 MB.',
    'toast.importInvalid': 'Invalid project file.',
    'toast.importFailed': 'Import failed.',
    'toast.shareCopied': 'Share link copied to clipboard.',
    'toast.shareDownloaded':
      'Project too large for a URL — JSON downloaded instead.',
    'share.prompt': 'Copy this share link:',
    'file.invalidPath': 'Use a unique relative path such as src/panel.tsx.',
    'example.native': 'Native',
    'example.webc': 'WebC',
    'product.nativeLab.description':
      'Edit Zeus Native TSX, run Signal / Show / For with Router / Query, and export an installable SPA.',
    'product.webcStudio.description':
      'Edit component TSX to generate CE / Manifest / CEM / DTS live, consumed by React and Vue.',
    'title.nativeLab': 'Native Lab',
    'title.webcStudio': 'WebC Studio',
    'example.nativeHello.title': 'Hello Zeus',
    'example.nativeHello.description':
      'Minimal Native app with render, JSX and one signal.',
    'example.nativeCounter.title': 'Signals Counter',
    'example.nativeCounter.description':
      'Signals, derived state and event handlers.',
    'example.nativeShowFor.title': 'Show + For',
    'example.nativeShowFor.description':
      'Conditional rendering and keyed list updates.',
    'example.nativeProps.title': 'Component Props',
    'example.nativeProps.description':
      'A small component tree with typed props.',
    'example.nativeTodo.title': 'Todo List',
    'example.nativeTodo.description':
      'Forms, local state and list interactions.',
    'example.nativeLifecycle.title': 'Lifecycle + Cleanup',
    'example.nativeLifecycle.description': 'Effects, cleanup and disposal.',
    'example.nativeRouterQuery.title': 'Router + Query',
    'example.nativeRouterQuery.description':
      'The full Native Lab reference project.',
    'example.webcBasic.title': 'Basic Custom Element',
    'example.webcBasic.description':
      'Define a real custom element in one file.',
    'example.webcCounterSlots.title': 'Counter + Slots',
    'example.webcCounterSlots.description':
      'The WebC Studio reference project.',
    'example.webcPropsEvents.title': 'Props + Events',
    'example.webcPropsEvents.description':
      'Typed attributes and a custom event contract.',
    'example.webcShadow.title': 'Shadow DOM',
    'example.webcShadow.description': 'Encapsulated styles in a shadow root.',
    'example.webcSlots.title': 'Light DOM Slots',
    'example.webcSlots.description':
      'Native slot composition for a panel element.',
    'html.title': 'Zeus Playground',
    'html.titleNative': 'Zeus Native Lab',
    'html.titleWebc': 'Zeus WebC Studio',
  },
  zh: {
    'brand.tagline': '原生 TSX · Web Components',
    'products.label': 'Playground 产品',
    'product.native': 'Native',
    'product.webc': 'WebC',
    'toolbar.examples': '示例',
    'toolbar.autoRun': '自动',
    'toolbar.autoRunTitle': '停止输入片刻后自动编译',
    'toolbar.run': '运行',
    'toolbar.stop': '停止',
    'toolbar.share': '分享',
    'toolbar.export': '导出',
    'toolbar.settings': '设置',
    'settings.theme': '主题',
    'settings.themeLight': '亮色',
    'settings.themeDark': '暗色',
    'settings.language': '语言',
    'settings.fontSize': '字号',
    'settings.autoRun': '自动运行',
    'settings.reset': '重置工作区',
    'settings.import': '导入 JSON',
    'editor.aria': '编辑器',
    'results.files': '工程文件',
    'editor.codeAria': '代码编辑器',
    'editor.addFile': '新增文件',
    'editor.removeFile': '删除文件',
    'editor.activePath': '当前文件路径，编辑可重命名',
    'editor.unsaved': '未保存',
    'editor.unsavedTitle': '草稿正在保存到本地',
    'results.aria': '运行结果',
    'workspace.resize': '调整编辑器与预览的宽度',
    'tab.preview': '预览',
    'tab.output': '编译输出',
    'tab.console': '控制台',
    'tab.problems': '问题',
    'tab.inspector': '组件检查',
    'tab.devtools': '调试',
    'preview.title': '预览',
    'preview.frameTitle': 'Zeus Playground 沙箱',
    'preview.opaque': '不透明源',
    'preview.stale': '预览已过期',
    'preview.maximize': '最大化预览',
    'preview.restore': '还原编辑器',
    'output.title': '编译器输出',
    'output.pill': 'DOM + SSR',
    'output.dom': 'DOM 模块',
    'output.ssr': 'SSR 模块',
    'output.domEmpty': '运行工程后可查看 DOM 输出。',
    'output.ssrEmpty': '运行工程后可查看 SSR 输出。',
    'output.raw': 'Source map 与原始诊断',
    'console.title': '控制台',
    'console.subtitle': '隔离沙箱输出',
    'console.errorsOnly': '仅错误',
    'console.showAll': '显示全部',
    'console.copy': '复制',
    'console.clear': '清空',
    'console.empty': '预览沙箱的控制台输出会显示在这里。',
    'problems.title': '问题',
    'problems.summary': '当前构建共有 {count} 条诊断',
    'problems.empty': '没有发现问题，预览已是最新。',
    'inspector.title': '组件检查器',
    'inspector.subtitle': 'Manifest、声明文件与框架消费方式',
    'inspector.previewFrameworks': '在 React + Vue 中预览',
    'inspector.manifestEmpty': '运行 WebC 工程后可生成 manifest。',
    'inspector.declarationsEmpty': '编译成功后会生成每个标签的 DTS。',
    'inspector.onlyWebc': '组件检查器仅在 WebC Studio 中可用。',
    'inspector.shadow': 'Shadow DOM',
    'inspector.light': 'Light DOM',
    'inspector.formAssociated': '表单关联',
    'inspector.props': '属性',
    'inspector.events': '事件',
    'inspector.slots': '插槽',
    'inspector.defaultSlot': '默认',
    'inspector.manifest': 'Manifest',
    'inspector.declarations': '声明文件',
    'inspector.hostNote':
      '同一个 Custom Element 实现会挂载到真实的 React 19 与 Vue 3 宿主中。',
    'inspector.openHost': '打开参考宿主',
    'devtools.title': '运行时调试',
    'devtools.subtitle': 'Signal、绑定与沙箱检查',
    'devtools.hmrCount': '{count} 个 HMR 模块',
    'devtools.hmr': 'HMR 分类',
    'devtools.hmrEmpty': '运行工程后可查看 HMR 计划。',
    'devtools.bindings': '{count} 个绑定',
    'devtools.noLiteralPlan': '无字面量计划',
    'devtools.performance': '构建性能',
    'devtools.metricCompile': 'WASM 编译',
    'devtools.metricRun': '沙箱运行',
    'devtools.metricRuns': '运行次数',
    'devtools.metricDomBytes': 'DOM 字节数',
    'devtools.metricSsrBytes': 'SSR 字节数',
    'devtools.mode': '模式',
    'devtools.events': '事件',
    'devtools.owners': 'Owner 数',
    'devtools.bindingsLabel': '绑定数',
    'devtools.effects': 'Effect 数',
    'devtools.signals': 'Signal 数',
    'devtools.domNodes': 'DOM 节点',
    'devtools.textNodes': '文本节点',
    'devtools.onlyNative': '调试面板仅在 Native Lab 中可用。',
    'hmr.firstBuild': '首次构建',
    'hmr.unchanged': '未变化',
    'hmr.classification.template-structure': '模板结构',
    'hmr.classification.script-body': '脚本主体',
    'hmr.classification.style-only': '仅样式',
    'hmr.classification.unknown': '未知',
    'mobile.label': '移动视图',
    'mobile.editor': '编辑器',
    'mobile.preview': '预览',
    'status.problems': '{count} 个问题',
    'status.compile': '编译 {ms} ms',
    'status.sandbox': '沙箱 {ms} ms',
    'status.saving': '保存中…',
    'status.saved': '已保存到本地',
    'status.notSaved': '尚未保存',
    'status.opaque': '不透明沙箱',
    'status.ready': '就绪',
    'status.compiling': '正在编译…',
    'status.autoRunning': '正在自动运行…',
    'status.compiled': '已编译 {count} 个模块 · {ms} ms',
    'status.compileFailed': '编译失败。',
    'status.compileFailedCount': '编译失败 · {count} 个问题',
    'status.stopped': '已停止',
    'status.exporting': '正在生成工程压缩包…',
    'status.exported': '已导出 {count} 个文件为 ZIP。',
    'status.exportFailed': '导出失败。',
    'preview.idle': '首次运行后将在这里显示预览。',
    'preview.compiling': '正在编译工程…',
    'preview.rebuilding': '正在重建预览…',
    'preview.running': '正在不透明沙箱中运行…',
    'preview.ready': '预览就绪 · {ms} ms',
    'preview.readyWithExports': '预览就绪 · {ms} ms · {names}',
    'preview.staleFix': '预览已过期 —— 请修复报告的问题。',
    'preview.staleRejected': '预览已过期 —— 编译器拒绝了该工程。',
    'preview.stopped': '预览已停止。准备好后再次运行。',
    'frameworks.idle': '编译 WebC 工程后，可在隔离的 React 与 Vue 宿主中预览。',
    'frameworks.needCompile': '请先编译 WebC 工程。',
    'frameworks.mounting': '正在不透明沙箱中挂载 React 与 Vue…',
    'frameworks.mounted': 'React 与 Vue 宿主已在不透明沙箱中挂载。',
    'drawer.aria': '示例',
    'drawer.title': '示例',
    'drawer.subtitle': '从一个可运行的工程开始。',
    'drawer.close': '关闭',
    'drawer.reset': '重置示例',
    'toast.consoleCopied': '控制台内容已复制。',
    'toast.clipboardUnavailable': '剪贴板不可用。',
    'toast.saveFailed': '当前浏览器模式下无法保存草稿。',
    'toast.workspaceReset': '工作区已重置。',
    'toast.projectImported': '工程已导入。',
    'toast.exportDownloaded': '工程 ZIP 已下载。',
    'toast.importTooLarge': '工程 JSON 超过 1.5 MB。',
    'toast.importInvalid': '工程文件无效。',
    'toast.importFailed': '导入失败。',
    'toast.shareCopied': '分享链接已复制到剪贴板。',
    'toast.shareDownloaded': '工程过大无法放进 URL —— 已改为下载 JSON。',
    'share.prompt': '复制此分享链接：',
    'file.invalidPath': '请使用唯一的相对路径，例如 src/panel.tsx。',
    'example.native': 'Native',
    'example.webc': 'WebC',
    'product.nativeLab.description':
      '编辑 Zeus Native TSX，运行 Signal / Show / For 与 Router / Query，再导出可安装 SPA。',
    'product.webcStudio.description':
      '编辑组件 TSX，实时生成 CE/Manifest/CEM/DTS，并由 React 与 Vue 消费同一个 Custom Element。',
    'title.nativeLab': 'Native Lab',
    'title.webcStudio': 'WebC Studio',
    'example.nativeHello.title': 'Hello Zeus',
    'example.nativeHello.description':
      '最小的 Native 应用，包含 render 调用、JSX 与一个 signal。',
    'example.nativeCounter.title': 'Signal 计数器',
    'example.nativeCounter.description': 'Signal、派生状态与事件处理。',
    'example.nativeShowFor.title': 'Show + For',
    'example.nativeShowFor.description': '条件渲染与带 key 的列表更新。',
    'example.nativeProps.title': '组件属性',
    'example.nativeProps.description': '带类型属性的小型组件树。',
    'example.nativeTodo.title': '待办列表',
    'example.nativeTodo.description': '表单、本地状态与列表交互。',
    'example.nativeLifecycle.title': '生命周期与清理',
    'example.nativeLifecycle.description': 'Effect、清理与销毁。',
    'example.nativeRouterQuery.title': 'Router + Query',
    'example.nativeRouterQuery.description': 'Native Lab 的完整参考工程。',
    'example.webcBasic.title': '基础 Custom Element',
    'example.webcBasic.description': '在单个文件中定义一个真正的自定义元素。',
    'example.webcCounterSlots.title': '计数器 + 插槽',
    'example.webcCounterSlots.description': 'WebC Studio 的参考工程。',
    'example.webcPropsEvents.title': '属性 + 事件',
    'example.webcPropsEvents.description':
      '带类型的 attribute 与自定义事件契约。',
    'example.webcShadow.title': 'Shadow DOM',
    'example.webcShadow.description': '在 shadow root 中隔离样式。',
    'example.webcSlots.title': 'Light DOM 插槽',
    'example.webcSlots.description': '为 panel 元素提供原生插槽组合。',
    'html.title': 'Zeus Playground',
    'html.titleNative': 'Zeus Native Lab',
    'html.titleWebc': 'Zeus WebC Studio',
  },
} as const

type PluralKey = keyof typeof englishPlurals

/**
 * English needs a plural form for counted nouns; Chinese does not. Keep the
 * two branches explicit so neither locale renders "1 problems".
 */
const englishPlurals = {
  'status.compileFailedCount': {
    one: 'Compile failed · {count} problem',
    other: 'Compile failed · {count} problems',
  },
} as const

function isPluralKey(key: string): key is PluralKey {
  return key in englishPlurals
}

function compileFailedCount(locale: PlaygroundLocale, count: number): string {
  if (locale === 'zh') {
    return messages.zh['status.compileFailedCount'].replace(
      '{count}',
      String(count),
    )
  }
  const forms = englishPlurals['status.compileFailedCount']
  return (count === 1 ? forms.one : forms.other).replace(
    '{count}',
    String(count),
  )
}

export function translate(
  locale: PlaygroundLocale,
  key: MessageKey,
  params?: MessageParams,
): string {
  if (isPluralKey(key)) {
    return compileFailedCount(locale, Number(params?.count ?? 0))
  }
  const table = messages[locale] as unknown as Record<string, string>
  const template =
    table[key] ?? (messages.en as unknown as Record<string, string>)[key]
  if (template === undefined) return key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

export function isPlaygroundLocale(value: unknown): value is PlaygroundLocale {
  return value === 'en' || value === 'zh'
}

export const [locale, setLocale] = createSignal<PlaygroundLocale>('en')

export function t(key: MessageKey, params?: MessageParams): string {
  return translate(locale(), key, params)
}

/**
 * Runtime state keeps a message descriptor instead of a rendered string so a
 * language switch re-renders status lines, toasts and preview states without a
 * rebuild or reload. Compiler output and other untranslatable text uses the
 * `text` form.
 */
export type UiMessage =
  | { readonly key: MessageKey; readonly params?: MessageParams }
  | { readonly text: string }

export function msg(key: MessageKey, params?: MessageParams): UiMessage {
  return params === undefined ? { key } : { key, params }
}

export function raw(text: string): UiMessage {
  return { text }
}

/** Reactive: reads the locale signal, so callers inside JSX update on switch. */
export function formatMessage(value: UiMessage): string {
  return 'text' in value ? value.text : t(value.key, value.params)
}
