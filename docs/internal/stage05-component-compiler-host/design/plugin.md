下面给一版**最终打包设计**，按你现在的要求收口：

```txt
1. 不需要兼容 outputs，因为尚未发布。
2. zeus() 主插件只负责 compiler-host。
3. wc / react / vue / css 都作为 zeus.plugins 传入。
4. root 默认由 Vite config.root 或 process.cwd() 自动获取。
5. components.include / exclude 有默认值。
6. dts 默认 auto，通过 package.json / tsconfig / TS 源码判断。
7. wcDir / reactDir / vueDir 不放 zeus.output，全交给各自插件。
8. react/vue 不再传 wcOutDir，通过虚拟模块依赖 wc 输出。
9. 新增 output-css 插件，替代手写 generateBundle emitFile。
```

---

# 1. 最终推荐配置

## 极简版

```ts
import zeus from '@zeus-js/bundler-plugin/vite'
import css from '@zeus-js/output-css'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    zeus({
      plugins: [css(), wc(), react(), vue()],
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
    },
  },
})
```

这版默认会做：

```txt
root:
  Vite: config.root
  Rollup/Rolldown: process.cwd()

components.include:
  src/**/*.{ts,tsx,js,jsx}
  components/**/*.{ts,tsx,js,jsx}

components.exclude:
  **/*.test.*
  **/*.spec.*
  **/__tests__/**
  **/*.d.ts
  src/shared/**
  node_modules/**
  dist/**

css:
  input auto-detect
  output styles.css
  processor auto

wc:
  output dist/wc
  manifest zeus.components.json
  customElements custom-elements.json
  dts auto
  jsxDts auto

react:
  output dist/react
  dts auto
  自动 import wc 虚拟模块

vue:
  output dist/vue
  dts auto
  globalDts auto
  自动 import wc 虚拟模块
```

---

## 显式版

```ts
import zeus from '@zeus-js/bundler-plugin/vite'
import css from '@zeus-js/output-css'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    zeus({
      /**
       * 可省略。
       *
       * @default
       * - Vite: config.root
       * - Rollup/Rolldown: process.cwd()
       */
      // root: __dirname,

      /**
       * 可省略。
       *
       * @default
       * include:
       *   ['src/**/*.{ts,tsx,js,jsx}', 'components/**/*.{ts,tsx,js,jsx}']
       *
       * exclude:
       *   [
       *     '**/*.test.*',
       *     '**/*.spec.*',
       *     '**/__tests__/**',
       *     '**/*.d.ts',
       *     'src/shared/**',
       *     'node_modules/**',
       *     'dist/**'
       *   ]
       */
      components: {
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/shared/**'],
      },

      /**
       * @default 'auto'
       *
       * auto 判断：
       * - package.json 有 types / typings / exports.*.types
       * - 或 package.json 依赖 typescript
       * - 或存在 tsconfig.json
       * - 或扫描到 .ts/.tsx 组件源码
       */
      dts: 'auto',

      /**
       * component-host 插件列表。
       *
       * 不再使用 outputs。
       */
      plugins: [
        css({
          /**
           * @default auto-detect:
           * - src/styles.css
           * - src/style.css
           * - src/index.css
           * - src/styles.scss
           * - src/style.scss
           */
          input: 'src/styles.css',

          /**
           * @default 'styles.css'
           */
          fileName: 'styles.css',

          /**
           * @default 'auto'
           *
           * auto:
           * - .scss/.sass -> sass
           * - .less -> less
           * - postcss.config.* / tailwind.config.* -> postcss
           * - otherwise -> copy
           */
          processor: 'auto',
        }),

        wc({
          /**
           * @default 'wc'
           */
          outDir: 'wc',

          /**
           * @default 'zeus.components.json'
           */
          manifestFile: 'zeus.components.json',

          /**
           * @default 'custom-elements.json'
           */
          customElementsFile: 'custom-elements.json',

          /**
           * @default 'auto'
           */
          dts: 'auto',

          /**
           * @default 'auto'
           */
          jsxDts: 'auto',
        }),

        react({
          /**
           * @default 'react'
           */
          outDir: 'react',

          /**
           * @default 'auto'
           */
          dts: 'auto',

          /**
           * @default 'props'
           */
          namedSlots: 'props',
        }),

        vue({
          /**
           * @default 'vue'
           */
          outDir: 'vue',

          /**
           * @default 'auto'
           */
          dts: 'auto',

          /**
           * @default 'auto'
           */
          globalDts: 'auto',
        }),
      ],
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
    },
  },
})
```

---

# 2. 架构模型

最终心智模型应该是：

```txt
Vite / Rollup / Rolldown
  ↓
zeus() 主插件
  ↓
component analyzer
  ↓
ComponentManifest
  ↓
component-host plugins
  ├─ css()
  ├─ wc()
  ├─ react()
  ├─ vue()
  └─ icons()
```

其中：

```txt
zeus()：
  负责 root、扫描、analyzer、compiler transform、虚拟模块注册、插件调度

css()：
  负责样式输入、预处理、输出 styles.css

wc()：
  负责 Web Component 输出、manifest、custom-elements、wc d.ts

react()：
  负责 React wrapper 输出、React d.ts

vue()：
  负责 Vue wrapper 输出、Vue d.ts / global.d.ts
```

---

# 3. 主插件类型设计

## `packages/web-c/bundler-plugin/src/types.ts`

```ts
import type { OutputBundle, PluginContext } from 'rollup'
import type { ComponentManifest } from '@zeus-js/component-analyzer'

export type DtsMode = boolean | 'auto'

export interface ZeusBundlerPluginOptions {
  /**
   * Project root.
   *
   * @default
   * - Vite: resolved config.root
   * - Rollup/Rolldown: process.cwd()
   */
  root?: string | (() => string)

  /**
   * Component source scan options.
   *
   * @default
   * include:
   *   ['src/**/*.{ts,tsx,js,jsx}', 'components/**/*.{ts,tsx,js,jsx}']
   *
   * exclude:
   *   [
   *     '**/*.test.*',
   *     '**/*.spec.*',
   *     '**/__tests__/**',
   *     '**/*.d.ts',
   *     'src/shared/**',
   *     'node_modules/**',
   *     'dist/**'
   *   ]
   */
  components?: {
    include?: string[]
    exclude?: string[]
  }

  /**
   * Declaration generation mode.
   *
   * @default 'auto'
   */
  dts?: DtsMode

  /**
   * Compiler options.
   */
  compiler?: ZeusCompilerOptions

  /**
   * Print analyzer diagnostics.
   *
   * @default true
   */
  diagnostics?: boolean | 'verbose'

  /**
   * Component-host plugins.
   */
  plugins?: ZeusComponentPlugin[]
}

export interface ZeusCompilerOptions {
  moduleName?: string
  generate?: 'dom'
  hydratable?: boolean
  delegateEvents?: boolean
}

export interface ZeusBuildContext {
  root: string
  manifest: ComponentManifest
  diagnostics: ZeusDiagnostic[]

  dts: ResolvedDts

  outputs: ZeusOutputRegistry

  emitFile: PluginContext['emitFile']
  warn: PluginContext['warn']
  error: PluginContext['error']
  addWatchFile: PluginContext['addWatchFile']

  meta: {
    watchMode: boolean
  }
}

export interface ZeusComponentPlugin {
  name: string

  /**
   * Register output dirs / externals / plugin metadata.
   *
   * This hook runs before virtualModules().
   */
  setup?(ctx: ZeusBuildContext): void | Promise<void>

  buildStart?(ctx: ZeusBuildContext): void | Promise<void>

  virtualModules?(
    ctx: ZeusBuildContext,
  ): ZeusVirtualModule[] | Promise<ZeusVirtualModule[]>

  generateBundle?(
    ctx: ZeusBuildContext,
    bundle: OutputBundle,
  ): ZeusOutputFile[] | Promise<ZeusOutputFile[]>

  /**
   * Vite adapter can use this to auto externalize framework deps.
   */
  external?: string[]
}

export interface ZeusVirtualModule {
  id: string
  code: string
  fileName?: string
}

export type ZeusOutputFile =
  | {
      type: 'asset'
      fileName: string
      source: string | Uint8Array
    }
  | {
      type: 'chunk'
      id: string
      fileName: string
    }

export type ZeusOutputKind =
  | 'wc'
  | 'react'
  | 'vue'
  | 'icons-react'
  | 'icons-vue'
  | 'icons-wc'
  | 'asset'

export interface ZeusOutputRegistry {
  register(kind: ZeusOutputKind, options: ZeusOutputRegistration): void
  has(kind: ZeusOutputKind): boolean
  get(kind: ZeusOutputKind): RequiredZeusOutputRegistration
  getDir(kind: ZeusOutputKind): string
  getFileName(kind: ZeusOutputKind, tag: string): string
  join(kind: ZeusOutputKind, fileName: string): string
}

export interface ZeusOutputRegistration {
  outDir?: string
  stripPrefix?: string | false
  fileName?: (tag: string, kind: ZeusOutputKind) => string
}

export interface RequiredZeusOutputRegistration {
  outDir: string
  stripPrefix: string | false
  fileName?: (tag: string, kind: ZeusOutputKind) => string
}

export interface ResolvedDts {
  enabled: boolean
  mode: DtsMode
  reason: DtsAutoReason[]
}

export type DtsAutoReason =
  | 'explicit-enabled'
  | 'explicit-disabled'
  | 'package-types-field'
  | 'typescript-dependency'
  | 'tsconfig'
  | 'typescript-source'

export interface ZeusDiagnostic {
  level: 'warning' | 'error'
  message: string
  file?: string
}
```

---

# 4. 默认扫描规则

## `packages/web-c/bundler-plugin/src/defaults.ts`

```ts
export const DEFAULT_COMPONENT_INCLUDE = [
  'src/**/*.{ts,tsx,js,jsx}',
  'components/**/*.{ts,tsx,js,jsx}',
]

export const DEFAULT_COMPONENT_EXCLUDE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/*.d.ts',
  'src/shared/**',
  'node_modules/**',
  'dist/**',
]

export function resolveComponentInclude(include?: string[]): string[] {
  return include?.length ? include : DEFAULT_COMPONENT_INCLUDE
}

export function resolveComponentExclude(exclude?: string[]): string[] {
  return exclude?.length ? exclude : DEFAULT_COMPONENT_EXCLUDE
}
```

---

# 5. dts auto 设计

## `packages/web-c/bundler-plugin/src/dts.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'

import type { DtsAutoReason, DtsMode, ResolvedDts } from './types'

export interface ResolveDtsOptions {
  root: string
  mode?: DtsMode
  include: string[]
  exclude: string[]
}

export async function resolveDts(
  options: ResolveDtsOptions,
): Promise<ResolvedDts> {
  const mode = options.mode ?? 'auto'

  if (mode === true) {
    return {
      enabled: true,
      mode,
      reason: ['explicit-enabled'],
    }
  }

  if (mode === false) {
    return {
      enabled: false,
      mode,
      reason: ['explicit-disabled'],
    }
  }

  const reason: DtsAutoReason[] = []

  if (await packageDeclaresTypes(options.root)) {
    reason.push('package-types-field')
  }

  if (await hasTypeScriptDependency(options.root)) {
    reason.push('typescript-dependency')
  }

  if (await fileExists(path.join(options.root, 'tsconfig.json'))) {
    reason.push('tsconfig')
  }

  if (
    await hasTypeScriptSource({
      root: options.root,
      include: options.include,
      exclude: options.exclude,
    })
  ) {
    reason.push('typescript-source')
  }

  return {
    enabled: reason.length > 0,
    mode,
    reason,
  }
}

async function hasTypeScriptDependency(root: string): Promise<boolean> {
  const pkg = await readPackageJson(root)
  if (!pkg) return false

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  }

  return Boolean(deps.typescript)
}

async function packageDeclaresTypes(root: string): Promise<boolean> {
  const pkg = await readPackageJson(root)
  if (!pkg) return false

  if (pkg.types || pkg.typings) return true

  return hasTypesInExports(pkg.exports)
}

function hasTypesInExports(value: unknown): boolean {
  if (!value) return false

  if (typeof value !== 'object') {
    return false
  }

  if ('types' in value) {
    return true
  }

  return Object.values(value as Record<string, unknown>).some(hasTypesInExports)
}

async function hasTypeScriptSource(options: {
  root: string
  include: string[]
  exclude: string[]
}): Promise<boolean> {
  const files = await fg(options.include, {
    cwd: options.root,
    onlyFiles: true,
    absolute: false,
    ignore: options.exclude,
  })

  return files.some(file => file.endsWith('.ts') || file.endsWith('.tsx'))
}

async function readPackageJson(root: string): Promise<any | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(root, 'package.json'), 'utf-8'),
    )
  } catch {
    return null
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}
```

## 插件级 dts 解析

```ts
// packages/web-c/bundler-plugin/src/pluginOptions.ts

import type { DtsMode, ZeusBuildContext } from './types'

export function resolvePluginDts(
  value: DtsMode | undefined,
  ctx: ZeusBuildContext,
): boolean {
  if (value === true) return true
  if (value === false) return false

  return ctx.dts.enabled
}
```

---

# 6. 输出注册表

## `packages/web-c/bundler-plugin/src/outputRegistry.ts`

```ts
import path from 'node:path'

import type {
  RequiredZeusOutputRegistration,
  ZeusOutputKind,
  ZeusOutputRegistration,
  ZeusOutputRegistry,
} from './types'

export function createOutputRegistry(): ZeusOutputRegistry {
  const map = new Map<ZeusOutputKind, RequiredZeusOutputRegistration>()

  return {
    register(kind, options) {
      map.set(kind, normalizeRegistration(kind, options))
    },

    has(kind) {
      return map.has(kind)
    },

    get(kind) {
      const current = map.get(kind)

      if (!current) {
        throw new Error(`[zeus] output kind "${kind}" is not registered.`)
      }

      return current
    },

    getDir(kind) {
      return this.get(kind).outDir
    },

    getFileName(kind, tag) {
      const current = this.get(kind)

      if (current.fileName) {
        return current.fileName(tag, kind)
      }

      return `${normalizeTagName(tag, current.stripPrefix)}.js`
    },

    join(kind, fileName) {
      return path.posix.join(this.getDir(kind), fileName)
    },
  }
}

function normalizeRegistration(
  kind: ZeusOutputKind,
  options: ZeusOutputRegistration,
): RequiredZeusOutputRegistration {
  return {
    outDir: options.outDir ?? defaultDir(kind),
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
  }
}

function defaultDir(kind: ZeusOutputKind): string {
  switch (kind) {
    case 'wc':
      return 'wc'
    case 'react':
      return 'react'
    case 'vue':
      return 'vue'
    case 'icons-react':
      return 'icons/react'
    case 'icons-vue':
      return 'icons/vue'
    case 'icons-wc':
      return 'icons/wc'
    case 'asset':
      return ''
  }
}

function normalizeTagName(tag: string, stripPrefix: string | false): string {
  if (stripPrefix && tag.startsWith(stripPrefix)) {
    return tag.slice(stripPrefix.length)
  }

  return tag
}
```

这里的重点是：**React/Vue 不再需要知道 WC 的 outDir**。它们直接 import `zeus:wc:${tag}` 虚拟模块，由 Rollup/Vite 自己生成最终相对路径。

---

# 7. Rollup 主插件草案

## `packages/web-c/bundler-plugin/src/rollup.ts`

```ts
import { analyzeComponents } from '@zeus-js/component-analyzer'

import { resolveComponentExclude, resolveComponentInclude } from './defaults'
import { formatDiagnostic, hasErrorDiagnostics } from './diagnostics'
import { resolveDts } from './dts'
import { createFilter } from './filter'
import { createOutputRegistry } from './outputRegistry'
import { transformZeus } from './transform'
import { VirtualModuleRegistry } from './virtual'

import type {
  ZeusBuildContext,
  ZeusBundlerPluginOptions,
  ZeusOutputFile,
  ZeusVirtualModule,
} from './types'
import type { Plugin, PluginContext } from 'rollup'

export function createZeusPlugin(
  options: ZeusBundlerPluginOptions = {},
): Plugin {
  const shouldTransform = createFilter(options)
  const virtualModules = new VirtualModuleRegistry()

  let ctx: ZeusBuildContext | undefined

  return {
    name: 'zeus-bundler-plugin',

    async buildStart() {
      virtualModules.clear()

      const root = resolveRoot(options.root)
      const include = resolveComponentInclude(options.components?.include)
      const exclude = resolveComponentExclude(options.components?.exclude)

      const dts = await resolveDts({
        root,
        mode: options.dts,
        include,
        exclude,
      })

      const result = await analyzeComponents({
        root,
        include,
        exclude,
      })

      for (const diagnostic of result.diagnostics) {
        const message = formatDiagnostic(diagnostic)

        if (diagnostic.level === 'error') {
          this.error(message)
        } else if (options.diagnostics !== false) {
          this.warn(message)
        }
      }

      if (hasErrorDiagnostics(result.diagnostics)) {
        this.error('[zeus] component analyzer failed.')
      }

      if (options.diagnostics === 'verbose') {
        this.warn(
          `[zeus] dts ${dts.enabled ? 'enabled' : 'disabled'}: ${
            dts.reason.join(', ') || 'no signal'
          }`,
        )
      }

      const outputs = createOutputRegistry()

      ctx = {
        root,
        manifest: result.manifest,
        diagnostics: result.diagnostics,
        dts,
        outputs,
        emitFile: this.emitFile.bind(this),
        warn: this.warn.bind(this),
        error: this.error.bind(this),
        addWatchFile: this.addWatchFile.bind(this),
        meta: {
          watchMode: this.meta.watchMode,
        },
      }

      for (const plugin of options.plugins ?? []) {
        await plugin.setup?.(ctx)
      }

      for (const plugin of options.plugins ?? []) {
        await plugin.buildStart?.(ctx)
      }

      for (const plugin of options.plugins ?? []) {
        const modules = await plugin.virtualModules?.(ctx)

        if (!modules) continue

        for (const mod of modules) {
          virtualModules.set(mod.id, mod.code, mod.fileName)
        }

        emitVirtualEntries(modules, this)
      }
    },

    resolveId(id, importer) {
      const resolved = virtualModules.resolve(id, importer)

      if (resolved) {
        return {
          id: resolved,
          moduleSideEffects: 'no-treeshake',
        }
      }

      return null
    },

    load(id) {
      return virtualModules.load(id)
    },

    async transform(code, id) {
      if (!shouldTransform(id)) {
        return null
      }

      return await transformZeus({
        id,
        code,
        compiler: options.compiler,
        sourcemap: true,
      })
    },

    async generateBundle(_, bundle) {
      if (!ctx) return

      for (const plugin of options.plugins ?? []) {
        const files = await plugin.generateBundle?.(ctx, bundle)

        if (!files) continue

        for (const file of files) {
          emitOutputFile(this, file)
        }
      }
    },
  }
}

function resolveRoot(root: string | (() => string) | undefined): string {
  if (typeof root === 'function') {
    return root()
  }

  return root ?? process.cwd()
}

function emitVirtualEntries(
  modules: ZeusVirtualModule[],
  ctx: PluginContext,
): void {
  for (const mod of modules) {
    if (!mod.fileName) continue

    ctx.emitFile({
      type: 'chunk',
      id: mod.id,
      fileName: mod.fileName,
    })
  }
}

function emitOutputFile(ctx: PluginContext, file: ZeusOutputFile): void {
  if (file.type === 'asset') {
    ctx.emitFile({
      type: 'asset',
      fileName: file.fileName,
      source: file.source,
    })
    return
  }

  ctx.emitFile({
    type: 'chunk',
    id: file.id,
    fileName: file.fileName,
  })
}
```

---

# 8. Vite 适配器草案

## `packages/web-c/bundler-plugin/src/vite.ts`

```ts
import { createRequire } from 'node:module'
import path from 'node:path'

import { createZeusPlugin } from './rollup'

import type { ZeusBundlerPluginOptions } from './types'
import type { Plugin, UserConfig, ResolvedConfig } from 'vite'

export function createZeusVitePlugin(
  options: ZeusBundlerPluginOptions = {},
): Plugin {
  let resolvedConfig: ResolvedConfig | undefined

  const rollupPlugin = createZeusPlugin({
    ...options,
    root: () => resolvedConfig?.root ?? process.cwd(),
  }) as Plugin

  return {
    ...rollupPlugin,
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    async config(userConfig) {
      const runtimeDomEntry = resolveRuntimeDOMEntry(userConfig.root)
      const externals = collectPluginExternals(options)

      return {
        esbuild: {
          jsx: 'preserve',
        },

        resolve: {
          alias: runtimeDomEntry
            ? {
                '@zeus-js/runtime-dom': runtimeDomEntry,
              }
            : undefined,

          dedupe: [
            '@zeus-js/signal',
            '@zeus-js/runtime-dom',
            '@zeus-js/zeus',
            '@zeus-js/component-dts',
          ],
        },

        build: {
          rollupOptions: {
            external: externals.length ? externals : undefined,
          },
        },
      } satisfies UserConfig
    },

    configResolved(config) {
      resolvedConfig = config
    },
  }
}

function collectPluginExternals(options: ZeusBundlerPluginOptions): string[] {
  const set = new Set<string>()

  for (const plugin of options.plugins ?? []) {
    for (const dep of plugin.external ?? []) {
      set.add(dep)
    }
  }

  return Array.from(set)
}

function resolveRuntimeDOMEntry(root: string | undefined): string | undefined {
  const projectRoot = path.resolve(process.cwd(), root ?? '.')
  const requireFromProject = createRequire(
    path.join(projectRoot, 'package.json'),
  )

  try {
    return requireFromProject.resolve(
      '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js',
    )
  } catch {}

  try {
    const zeusEntry = requireFromProject.resolve('@zeus-js/zeus')
    const requireFromZeus = createRequire(zeusEntry)

    return requireFromZeus.resolve(
      '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js',
    )
  } catch {
    return undefined
  }
}

export default createZeusVitePlugin
export { createZeusVitePlugin as zeus }
```

> 注意：如果用户自己已经配置了 `build.rollupOptions.external`，实际实现里需要做 merge，而不是直接覆盖。这里是草案。

---

# 9. output-css 插件

新增：

```txt
packages/web-c/output-css
```

## `types.ts`

```ts
export type CssProcessor = 'auto' | 'copy' | 'postcss' | 'sass' | 'less'

export interface OutputCssOptions {
  /**
   * CSS input file.
   *
   * @default auto-detect:
   * - src/styles.css
   * - src/style.css
   * - src/index.css
   * - src/styles.scss
   * - src/style.scss
   */
  input?: string

  /**
   * Output CSS file name.
   *
   * @default 'styles.css'
   */
  fileName?: string

  /**
   * Multiple CSS entries.
   */
  files?: CssEntry[]

  /**
   * CSS processor.
   *
   * @default 'auto'
   */
  processor?: CssProcessor

  /**
   * Minify CSS.
   *
   * @default false
   */
  minify?: boolean

  /**
   * Add CSS file to watch list.
   *
   * @default true
   */
  watch?: boolean
}

export interface CssEntry {
  input: string
  fileName?: string
  processor?: CssProcessor
}

export interface NormalizedCssEntry {
  input: string
  fileName: string
  processor: CssProcessor
}

export interface NormalizedOutputCssOptions {
  files: NormalizedCssEntry[]
  minify: boolean
  watch: boolean
}
```

## `index.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

import { processCssEntry } from './processCss'

import type {
  CssEntry,
  OutputCssOptions,
  NormalizedCssEntry,
  NormalizedOutputCssOptions,
} from './types'
import type {
  ZeusComponentPlugin,
  ZeusOutputFile,
} from '@zeus-js/bundler-plugin'

export default function css(
  options: OutputCssOptions | string = {},
): ZeusComponentPlugin {
  const raw = typeof options === 'string' ? { input: options } : options

  let normalized: NormalizedOutputCssOptions | undefined

  return {
    name: 'zeus-output-css',

    async buildStart(ctx) {
      normalized = await normalizeOptions(raw, ctx.root)

      if (normalized.watch) {
        for (const file of normalized.files) {
          ctx.addWatchFile(path.resolve(ctx.root, file.input))
        }
      }
    },

    async generateBundle(ctx): Promise<ZeusOutputFile[]> {
      const current = normalized ?? (await normalizeOptions(raw, ctx.root))
      const files: ZeusOutputFile[] = []

      for (const entry of current.files) {
        const result = await processCssEntry(entry, current, ctx.root)

        files.push({
          type: 'asset',
          fileName: entry.fileName,
          source: result.css,
        })
      }

      return files
    },
  }
}

async function normalizeOptions(
  options: OutputCssOptions,
  root: string,
): Promise<NormalizedOutputCssOptions> {
  return {
    files: await normalizeEntries(options, root),
    minify: options.minify ?? false,
    watch: options.watch ?? true,
  }
}

async function normalizeEntries(
  options: OutputCssOptions,
  root: string,
): Promise<NormalizedCssEntry[]> {
  if (options.files?.length) {
    return options.files.map(file => normalizeEntry(file, options))
  }

  const input = options.input ?? (await detectDefaultCssInput(root))

  return [
    normalizeEntry(
      {
        input,
        fileName: options.fileName,
        processor: options.processor,
      },
      options,
    ),
  ]
}

function normalizeEntry(
  entry: CssEntry,
  options: OutputCssOptions,
): NormalizedCssEntry {
  return {
    input: entry.input,
    fileName: entry.fileName ?? options.fileName ?? 'styles.css',
    processor: entry.processor ?? options.processor ?? 'auto',
  }
}

async function detectDefaultCssInput(root: string): Promise<string> {
  const candidates = [
    'src/styles.css',
    'src/style.css',
    'src/index.css',
    'src/styles.scss',
    'src/style.scss',
  ]

  for (const candidate of candidates) {
    try {
      await fs.access(path.resolve(root, candidate))
      return candidate
    } catch {}
  }

  throw new Error(
    `[zeus-output-css] CSS input is required. Tried: ${candidates.join(', ')}`,
  )
}
```

## `processCss.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { detectCssProcessor } from './detect'

import type { NormalizedCssEntry, NormalizedOutputCssOptions } from './types'

export interface ProcessCssResult {
  css: string
}

export async function processCssEntry(
  entry: NormalizedCssEntry,
  options: NormalizedOutputCssOptions,
  root: string,
): Promise<ProcessCssResult> {
  const input = path.resolve(root, entry.input)
  const raw = await fs.readFile(input, 'utf-8')

  const processor =
    entry.processor === 'auto'
      ? await detectCssProcessor(input, root)
      : entry.processor

  let css = raw

  if (processor === 'sass') {
    css = await processSass(input)
  } else if (processor === 'less') {
    css = await processLess(input, raw)
  } else if (processor === 'postcss') {
    css = await processPostcss(input, raw, root)
  }

  if (options.minify) {
    css = await minifyCss(input, css)
  }

  return { css }
}

async function processSass(input: string): Promise<string> {
  const sass = await importOptional<typeof import('sass')>(
    'sass',
    'Install "sass" to process .scss/.sass files.',
  )

  const result = await sass.compileStringAsync(
    await fs.readFile(input, 'utf-8'),
    {
      url: pathToFileURL(input),
      loadPaths: [path.dirname(input)],
    },
  )

  return result.css
}

async function processLess(input: string, source: string): Promise<string> {
  const less = await importOptional<typeof import('less')>(
    'less',
    'Install "less" to process .less files.',
  )

  const result = await less.render(source, {
    filename: input,
  })

  return result.css
}

async function processPostcss(
  input: string,
  source: string,
  root: string,
): Promise<string> {
  const postcss = await importOptional<typeof import('postcss')>(
    'postcss',
    'Install "postcss" to process CSS with PostCSS.',
  )

  const loadConfig = await importOptional<any>(
    'postcss-load-config',
    'Install "postcss-load-config" to load PostCSS config.',
  )

  const config = await loadConfig.default({}, root)

  const result = await postcss.default(config.plugins).process(source, {
    from: input,
    map: false,
  })

  return result.css
}

async function minifyCss(input: string, source: string): Promise<string> {
  try {
    const lightningcss = await import('lightningcss')

    const result = lightningcss.transform({
      filename: input,
      code: Buffer.from(source),
      minify: true,
    })

    return result.code.toString()
  } catch {
    return source
  }
}

async function importOptional<T>(name: string, message: string): Promise<T> {
  try {
    return (await import(name)) as T
  } catch {
    throw new Error(`[zeus-output-css] ${message}`)
  }
}
```

---

# 10. output-wc 插件

## `types.ts`

```ts
import type { DtsMode } from '@zeus-js/bundler-plugin'

export interface OutputWCOptions {
  /**
   * Web Component output directory.
   *
   * @default 'wc'
   */
  outDir?: string

  /**
   * Strip tag prefix for file name.
   *
   * Example:
   * z-button -> button.js
   *
   * @default false
   */
  stripPrefix?: string | false

  /**
   * Custom file name.
   */
  fileName?: (tag: string) => string

  /**
   * Component manifest file.
   *
   * @default 'zeus.components.json'
   */
  manifestFile?: string | false

  /**
   * Custom Elements Manifest file.
   *
   * @default 'custom-elements.json'
   */
  customElementsFile?: string | false

  /**
   * Generate WC d.ts.
   *
   * @default 'auto'
   */
  dts?: DtsMode

  /**
   * Generate JSX IntrinsicElements d.ts.
   *
   * @default 'auto'
   */
  jsxDts?: DtsMode

  /**
   * Generate wc/index.js.
   *
   * @default true
   */
  index?: boolean
}
```

## `index.ts` 核心

```ts
import { generateWCDtsFiles } from '@zeus-js/component-dts'
import { resolvePluginDts } from '@zeus-js/bundler-plugin'

import { generateWCEntry } from './generateEntry'
import { generateWCIndex } from './generateIndex'
import { generateZeusComponentsManifest } from './generateManifest'
import { generateCustomElementsJson } from './generateCustomElementsJson'

import type {
  ZeusComponentPlugin,
  ZeusOutputFile,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'
import type { OutputWCOptions } from './types'

export default function wc(options: OutputWCOptions = {}): ZeusComponentPlugin {
  const normalized = {
    outDir: options.outDir ?? 'wc',
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    manifestFile: options.manifestFile ?? 'zeus.components.json',
    customElementsFile: options.customElementsFile ?? 'custom-elements.json',
    dts: options.dts ?? 'auto',
    jsxDts: options.jsxDts ?? 'auto',
    index: options.index ?? true,
  }

  return {
    name: 'zeus-output-wc',

    setup(ctx) {
      ctx.outputs.register('wc', {
        outDir: normalized.outDir,
        stripPrefix: normalized.stripPrefix,
        fileName: normalized.fileName
          ? tag => normalized.fileName!(tag)
          : undefined,
      })
    },

    virtualModules(ctx): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:wc:${component.tag}`,
          fileName: ctx.outputs.join(
            'wc',
            ctx.outputs.getFileName('wc', component.tag),
          ),
          code: generateWCEntry({
            root: ctx.root,
            component,
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:wc:index',
          fileName: ctx.outputs.join('wc', 'index.js'),
          code: generateWCIndex({
            components: ctx.manifest.components,
          }),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (normalized.manifestFile) {
        files.push({
          type: 'asset',
          fileName: normalized.manifestFile,
          source: generateZeusComponentsManifest(ctx.manifest),
        })
      }

      if (normalized.customElementsFile) {
        files.push({
          type: 'asset',
          fileName: normalized.customElementsFile,
          source: generateCustomElementsJson({
            manifest: ctx.manifest,
            getModulePath: component =>
              ctx.outputs.join(
                'wc',
                ctx.outputs.getFileName('wc', component.tag),
              ),
          }),
        })
      }

      const dts = resolvePluginDts(normalized.dts, ctx)
      const jsxDts = resolvePluginDts(normalized.jsxDts, ctx)

      if (dts || jsxDts) {
        const dtsFiles = generateWCDtsFiles(ctx.manifest, {
          outDir: normalized.outDir,
          stripPrefix: normalized.stripPrefix,
          fileName: tag =>
            ctx.outputs.getFileName('wc', tag).replace(/\.js$/, ''),
          perComponent: true,
          index: dts,
          jsx: jsxDts,
        })

        for (const file of dtsFiles) {
          files.push({
            type: 'asset',
            fileName: file.fileName,
            source: file.source,
          })
        }
      }

      return files
    },
  }
}
```

---

# 11. React wrapper 插件

## `types.ts`

```ts
import type { DtsMode } from '@zeus-js/bundler-plugin'

export interface OutputReactWrapperOptions {
  /**
   * React wrapper output directory.
   *
   * @default 'react'
   */
  outDir?: string

  /**
   * Strip tag prefix for file name.
   *
   * @default false
   */
  stripPrefix?: string | false

  /**
   * Custom file name.
   */
  fileName?: (tag: string) => string

  /**
   * Generate react/index.d.ts.
   *
   * @default 'auto'
   */
  dts?: DtsMode

  /**
   * Generate react/index.js.
   *
   * @default true
   */
  index?: boolean

  /**
   * Named slot strategy.
   *
   * @default 'props'
   */
  namedSlots?: 'props' | 'none'
}
```

## React wrapper 生成重点

```ts
// generateReactWrapper.ts

export function generateReactWrapper(input: {
  component: ComponentRecord
  namedSlots: 'props' | 'none'
}): string {
  const { component, namedSlots } = input

  const propNames = Object.keys(component.props)
  const eventNames = Object.keys(component.events)
  const slotNames =
    namedSlots === 'props'
      ? Object.keys(component.slots).filter(name => name !== 'default')
      : []

  return `
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import ${JSON.stringify(`zeus:wc:${component.tag}`)};

export const ${component.name} = forwardRef(function ${component.name}(props, ref) {
  const {
    children,
    className,
    style,
    ${[...propNames, ...eventNames.map(toReactEventProp), ...slotNames].join(
      ',\n    ',
    )}
    ,
    ...rest
  } = props;

  const innerRef = useRef(null);

  useImperativeHandle(ref, () => innerRef.current);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    ${propNames.map(name => `el.${name} = ${name};`).join('\n    ')}
  }, [${propNames.join(', ')}]);

  ${eventNames.map(generateReactEventEffect).join('\n')}

  const slotChildren = [];

  ${slotNames.map(generateNamedSlot).join('\n')}

  if (children != null) {
    slotChildren.push(children);
  }

  return React.createElement(
    ${JSON.stringify(component.tag)},
    {
      ...rest,
      ref: innerRef,
      className,
      style,
    },
    ...slotChildren,
  );
});

function createNamedSlot(name, value) {
  if (value == null || value === false) return null;

  if (
    React.isValidElement(value) &&
    value.type !== React.Fragment
  ) {
    return React.cloneElement(value, {
      ...value.props,
      slot: name,
    });
  }

  return React.createElement(
    'span',
    {
      slot: name,
      style: { display: 'contents' },
    },
    value,
  );
}
`.trimStart()
}

function generateReactEventEffect(eventName: string): string {
  const propName = toReactEventProp(eventName)

  return `
  useEffect(() => {
    const el = innerRef.current;
    if (!el || !${propName}) return;

    const handler = event => {
      ${propName}(event);
    };

    el.addEventListener(${JSON.stringify(eventName)}, handler);

    return () => {
      el.removeEventListener(${JSON.stringify(eventName)}, handler);
    };
  }, [${propName}]);
`
}

function generateNamedSlot(name: string): string {
  return `
  {
    const node = createNamedSlot(${JSON.stringify(name)}, ${name});
    if (node != null) slotChildren.push(node);
  }
`
}

function toReactEventProp(eventName: string): string {
  return (
    'on' +
    eventName
      .split('-')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  )
}
```

## `index.ts`

```ts
import { generateReactDts } from '@zeus-js/component-dts'
import { resolvePluginDts } from '@zeus-js/bundler-plugin'

import { generateReactWrapper } from './generateReactWrapper'
import { generateReactIndex } from './generateReactIndex'

import type {
  ZeusComponentPlugin,
  ZeusOutputFile,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'
import type { OutputReactWrapperOptions } from './types'

export default function reactWrapper(
  options: OutputReactWrapperOptions = {},
): ZeusComponentPlugin {
  const normalized = {
    outDir: options.outDir ?? 'react',
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    dts: options.dts ?? 'auto',
    index: options.index ?? true,
    namedSlots: options.namedSlots ?? 'props',
  }

  return {
    name: 'zeus-output-react-wrapper',
    external: ['react'],

    setup(ctx) {
      ctx.outputs.register('react', {
        outDir: normalized.outDir,
        stripPrefix: normalized.stripPrefix,
        fileName: normalized.fileName
          ? tag => normalized.fileName!(tag)
          : undefined,
      })
    },

    virtualModules(ctx): ZeusVirtualModule[] {
      if (!ctx.outputs.has('wc')) {
        ctx.error('[zeus-output-react-wrapper] react() requires wc() plugin.')
      }

      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:react:${component.tag}`,
          fileName: ctx.outputs.join(
            'react',
            ctx.outputs.getFileName('react', component.tag),
          ),
          code: generateReactWrapper({
            component,
            namedSlots: normalized.namedSlots,
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:react:index',
          fileName: ctx.outputs.join('react', 'index.js'),
          code: generateReactIndex(ctx.manifest.components, {
            getFileName: tag => ctx.outputs.getFileName('react', tag),
          }),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      if (!resolvePluginDts(normalized.dts, ctx)) {
        return []
      }

      return [
        {
          type: 'asset',
          fileName: ctx.outputs.join('react', 'index.d.ts'),
          source: generateReactDts(ctx.manifest),
        },
      ]
    },
  }
}
```

---

# 12. Vue wrapper 插件

Vue 的关键修正：

```txt
1. 不再传 wcOutDir
2. 生成代码 import "zeus:wc:<tag>"
3. prop sync 无条件同步，避免 undefined 清理失败
4. vue 插件声明 external: ['vue']
```

## `generateVueWrapper.ts` prop sync

```ts
function generateVuePropSyncLines(propNames: string[]): string {
  if (!propNames.length) {
    return '// no props to sync'
  }

  return propNames.map(name => `el.${name} = props.${name};`).join('\n      ')
}
```

## 入口核心

```ts
export default function vueWrapper(
  options: OutputVueWrapperOptions = {},
): ZeusComponentPlugin {
  const normalized = {
    outDir: options.outDir ?? 'vue',
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    dts: options.dts ?? 'auto',
    globalDts: options.globalDts ?? 'auto',
    index: options.index ?? true,
  }

  return {
    name: 'zeus-output-vue-wrapper',
    external: ['vue'],

    setup(ctx) {
      ctx.outputs.register('vue', {
        outDir: normalized.outDir,
        stripPrefix: normalized.stripPrefix,
        fileName: normalized.fileName
          ? tag => normalized.fileName!(tag)
          : undefined,
      })
    },

    virtualModules(ctx) {
      if (!ctx.outputs.has('wc')) {
        ctx.error('[zeus-output-vue-wrapper] vue() requires wc() plugin.')
      }

      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:vue:${component.tag}`,
          fileName: ctx.outputs.join(
            'vue',
            ctx.outputs.getFileName('vue', component.tag),
          ),
          code: generateVueWrapper({
            component,
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:vue:index',
          fileName: ctx.outputs.join('vue', 'index.js'),
          code: generateVueIndex(ctx.manifest.components, {
            getFileName: tag => ctx.outputs.getFileName('vue', tag),
          }),
        })
      }

      return modules
    },

    generateBundle(ctx) {
      const files: ZeusOutputFile[] = []

      if (resolvePluginDts(normalized.dts, ctx)) {
        files.push({
          type: 'asset',
          fileName: ctx.outputs.join('vue', 'index.d.ts'),
          source: generateVueDts(ctx.manifest),
        })
      }

      if (resolvePluginDts(normalized.globalDts, ctx)) {
        files.push({
          type: 'asset',
          fileName: ctx.outputs.join('vue', 'global.d.ts'),
          source: generateVueGlobalDts(ctx.manifest),
        })
      }

      return files
    },
  }
}
```

---

# 13. preset：组件库默认配置

新增：

```txt
packages/web-c/preset-component-library
```

## 使用

```ts
import zeus from '@zeus-js/bundler-plugin/vite'
import { componentLibrary } from '@zeus-js/preset-component-library'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    zeus({
      plugins: componentLibrary(),
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
    },
  },
})
```

## `index.ts`

```ts
import css from '@zeus-js/output-css'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'

import type { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

export interface ComponentLibraryPresetOptions {
  styles?: string | false
  targets?: ComponentLibraryTarget[]
  dts?: DtsMode
  jsxDts?: DtsMode
  manifest?: boolean
  customElements?: boolean
}

export type ComponentLibraryTarget = 'wc' | 'react' | 'vue'

export function componentLibrary(
  options: ComponentLibraryPresetOptions = {},
): ZeusComponentPlugin[] {
  const targets = options.targets ?? ['wc', 'react', 'vue']
  const plugins: ZeusComponentPlugin[] = []

  if (options.styles !== false) {
    plugins.push(
      css({
        input: typeof options.styles === 'string' ? options.styles : undefined,
      }),
    )
  }

  if (targets.includes('wc')) {
    plugins.push(
      wc({
        dts: options.dts ?? 'auto',
        jsxDts: options.jsxDts ?? 'auto',
        manifestFile:
          options.manifest === false ? false : 'zeus.components.json',
        customElementsFile:
          options.customElements === false ? false : 'custom-elements.json',
      }),
    )
  }

  if (targets.includes('react')) {
    plugins.push(
      react({
        dts: options.dts ?? 'auto',
      }),
    )
  }

  if (targets.includes('vue')) {
    plugins.push(
      vue({
        dts: options.dts ?? 'auto',
        globalDts: options.dts ?? 'auto',
      }),
    )
  }

  return plugins
}

export { css, wc, react, vue }
```

---

# 14. 最终产物结构

使用：

```ts
zeus({
  plugins: [css(), wc(), react(), vue()],
})
```

默认输出：

```txt
dist/
  styles.css

  wc/
    z-button.js
    z-switch.js
    z-checkbox.js
    z-icon.js
    z-tabs.js
    z-tab-list.js
    z-tab-trigger.js
    z-tab-panel.js
    z-dialog.js
    z-dialog-trigger.js
    z-dialog-content.js
    z-dialog-title.js
    z-dialog-description.js
    index.js
    index.d.ts
    jsx.d.ts

  react/
    z-button.js
    z-switch.js
    z-checkbox.js
    z-icon.js
    z-tabs.js
    z-tab-list.js
    z-tab-trigger.js
    z-tab-panel.js
    z-dialog.js
    z-dialog-trigger.js
    z-dialog-content.js
    z-dialog-title.js
    z-dialog-description.js
    index.js
    index.d.ts

  vue/
    z-button.js
    z-switch.js
    z-checkbox.js
    z-icon.js
    z-tabs.js
    z-tab-list.js
    z-tab-trigger.js
    z-tab-panel.js
    z-dialog.js
    z-dialog-trigger.js
    z-dialog-content.js
    z-dialog-title.js
    z-dialog-description.js
    index.js
    index.d.ts
    global.d.ts

  zeus.components.json
  custom-elements.json
```

---

# 15. examples/headless 最终配置

```ts
import zeus from '@zeus-js/bundler-plugin/vite'
import { componentLibrary } from '@zeus-js/preset-component-library'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    zeus({
      plugins: componentLibrary(),
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
    },
  },
})
```

或者不使用 preset：

```ts
import zeus from '@zeus-js/bundler-plugin/vite'
import css from '@zeus-js/output-css'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    zeus({
      plugins: [css(), wc(), react(), vue()],
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
    },
  },
})
```

---

# 16. 测试计划

必须补这些测试：

```txt
bundler-plugin:
  [ ] 默认 include/exclude 生效
  [ ] root 在 Vite 下取 config.root
  [ ] dts auto: package types
  [ ] dts auto: typescript dependency
  [ ] dts auto: tsconfig
  [ ] dts auto: ts/tsx source
  [ ] dts false 强制关闭
  [ ] plugins 生命周期顺序 setup -> buildStart -> virtualModules -> generateBundle

output-css:
  [ ] css() 自动发现 src/styles.css
  [ ] css('src/styles.css') 输出 styles.css
  [ ] processor copy
  [ ] processor auto + postcss config
  [ ] watch addWatchFile

output-wc:
  [ ] 默认 outDir wc
  [ ] manifest/custom-elements 默认输出
  [ ] dts follow auto
  [ ] jsxDts follow auto

output-react-wrapper:
  [ ] 默认 outDir react
  [ ] import zeus:wc:<tag>
  [ ] 无 wc() 时 error
  [ ] dts follow auto
  [ ] named slots props

output-vue-wrapper:
  [ ] 默认 outDir vue
  [ ] import zeus:wc:<tag>
  [ ] 无 wc() 时 error
  [ ] prop sync 无条件同步
  [ ] globalDts follow auto

preset-component-library:
  [ ] 默认返回 css/wc/react/vue
  [ ] targets: ['wc'] 只返回 css + wc
  [ ] styles: false 不返回 css
```

---

# 17. 推荐提交顺序

```bash
# 1. 主插件 types/defaults/dts/output registry
git add packages/web-c/bundler-plugin/src/types.ts \
        packages/web-c/bundler-plugin/src/defaults.ts \
        packages/web-c/bundler-plugin/src/dts.ts \
        packages/web-c/bundler-plugin/src/outputRegistry.ts \
        packages/web-c/bundler-plugin/src/pluginOptions.ts
git commit -m "feat(bundler-plugin): stabilize component host plugin api"

# 2. rollup/vite 主插件改造
git add packages/web-c/bundler-plugin/src/rollup.ts \
        packages/web-c/bundler-plugin/src/vite.ts
git commit -m "feat(bundler-plugin): use plugins api and dts auto detection"

# 3. output-css
git add packages/web-c/output-css
git commit -m "feat(output-css): add css asset output plugin"

# 4. wc/react/vue 改造
git add packages/web-c/output-wc \
        packages/web-c/output-react-wrapper \
        packages/web-c/output-vue-wrapper
git commit -m "refactor(web-c): move output dirs into output plugins"

# 5. preset
git add packages/web-c/preset-component-library
git commit -m "feat(preset): add component library preset"

# 6. examples/headless 配置简化
git add examples/headless/vite.config.ts
git commit -m "example(headless): simplify compiler host packaging config"

# 7. tests
git add packages/web-c/**/__tests__
git commit -m "test(web-c): cover component host packaging defaults"
```

---

# 18. 最终结论

这版最终设计的核心是：

```txt
去掉 outputs。
去掉 root 必填。
去掉 components 必填。
去掉 wcOutDir。
去掉全局 wcDir/reactDir/vueDir。
去掉手写 CSS emit 插件。
dts 默认 auto。
```

用户最终只需要理解：

```txt
zeus() 是主插件。
plugins 里放输出插件。
css/wc/react/vue 各自有合理默认值。
TypeScript 项目会自动生成 d.ts。
React/Vue wrapper 会自动依赖 WC 输出。
```

这会比当前配置明显更适合长期维护，也更符合你想做的“可插拔多输出组件编译器”的方向。
