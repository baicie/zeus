## 总体方案

结合你现在 `feat/bundle/rollup-down` 分支的实现，我建议最终收口成：

```txt
用户侧：
  Rollup   -> zeus() 或 defineZeusRollupConfig()
  Rolldown -> zeus() 或 defineZeusRolldownConfig()

内部侧：
  core.ts      -> 通用插件主体
  rollup.ts    -> Rollup adapter，默认帮用户处理 TS/TSX
  rolldown.ts  -> Rolldown adapter，默认不额外转 TS，交给 Rolldown internalTransform
  vite.ts      -> Vite adapter，继续处理 jsx preserve / alias / dedupe
```

核心原则是：**用户使用 TS/TSX 写组件时，不应该被迫理解 Babel、esbuild、node-resolve、JSX preserve、dts auto、virtual module 这些细节**。

---

## 1. 当前代码里的关键事实

现在 `@zeus-js/bundler-plugin` 已经暴露了 `./vite`、`./rollup`、`./rolldown`、`./manifest` 这些入口，并且 `buildOptions.additionalEntries` 也已经把这些入口作为独立构建产物输出了，这个方向是对的。

当前 `src/rolldown.ts` 只是直接 re-export `./rollup`：

```ts
export { default, zeus } from './rollup'
```

这说明现在 Rollup / Rolldown 已经复用同一套实现，但语义上还不够干净。

当前 `rollup.ts` 的主插件逻辑已经比较完整，包括 `buildStart`、`resolveId`、`load`、`transform`、`generateBundle`，并且已经完成了组件扫描、diagnostics、虚拟模块注册、Zeus JSX transform、component-host plugin 调度。

但当前 `transformZeus()` 只是让 Babel 能解析 TypeScript / JSX：

```ts
parserOpts: {
  sourceType: 'module',
  plugins: ['typescript', 'jsx'],
}
```

它没有真正擦除 TypeScript 类型。 这就是 Rollup 用户写 TS/TSX 组件时最大的隐患。

Rolldown 这边不一样。官方文档说明 Rolldown 的插件 API 基本兼容 Rollup，并且它的 internal transform 会在插件 `transform` hook 之后把 TypeScript / JSX 转成 JavaScript，所以 Rolldown 插件只需要能处理 TS/JSX 输入即可。([Rolldown][1])

---

## 2. 用户最终使用方式

### Rollup：极简配置

```ts
// rollup.config.ts
import { defineConfig } from 'rollup'
import zeus from '@zeus-js/bundler-plugin/rollup'

export default defineConfig({
  input: 'src/index.ts',

  plugins: [zeus()],

  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
  },
})
```

### Rollup：更低心智版本

建议额外提供 `defineZeusRollupConfig()`：

```ts
// rollup.config.ts
import { defineZeusRollupConfig } from '@zeus-js/bundler-plugin/rollup'

export default defineZeusRollupConfig()
```

默认等价于：

```ts
{
  input: 'src/index.ts',
  plugins: [zeus()],
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
  },
}
```

---

### Rolldown：极简配置

```ts
// rolldown.config.ts
import { defineConfig } from 'rolldown'
import zeus from '@zeus-js/bundler-plugin/rolldown'

export default defineConfig({
  input: 'src/index.ts',

  plugins: [zeus()],

  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
  },
})
```

### Rolldown：更低心智版本

```ts
// rolldown.config.ts
import { defineZeusRolldownConfig } from '@zeus-js/bundler-plugin/rolldown'

export default defineZeusRolldownConfig()
```

---

## 3. 设计重点

### 3.1 默认扫描规则继续保留

你当前默认 include / exclude 已经合理：

```ts
include:
  src/**/*.{ts,tsx,js,jsx}
  components/**/*.{ts,tsx,js,jsx}

exclude:
  **/*.test.*
  **/*.spec.*
  **/__tests__/**
  **/*.d.ts
  src/shared/**
  node_modules/**
  dist/**
```

这些默认值能覆盖普通组件库项目，不需要让用户手写。

---

### 3.2 Rollup adapter 默认处理 TS/TSX

Rollup 本身需要插件参与 transpile、resolve 等行为，Rollup 官方也把“通过插件定制转译、查找模块”等作为插件系统的用途。([rollupjs.org][2])

所以 Rollup 入口应该默认做两件事：

```txt
1. transform 阶段：Zeus compiler 处理 JSX，然后 Babel preset-typescript 擦除 TS 类型。
2. resolveId 阶段：补充相对路径 .ts / .tsx / .js / .jsx / index.tsx 解析。
```

这样用户不用安装：

```txt
rollup-plugin-esbuild
@rollup/plugin-node-resolve
@rollup/plugin-typescript
```

至少在组件源码的基础场景下，`zeus()` 就能工作。

---

### 3.3 Rolldown adapter 不额外擦除 TS

Rolldown 官方文档明确说明 internal transform 会在插件 `transform` hook 后处理 TS/JSX。([Rolldown][1])

所以 Rolldown 下：

```txt
Zeus transform:
  负责识别组件、编译 Zeus JSX、返回仍可被 Rolldown internalTransform 继续处理的代码。

Rolldown internalTransform:
  负责最终 TS/JSX -> JS。
```

也就是说：

```ts
zeus({
  transpile: false,
})
```

应该是 Rolldown 默认行为。

---

## 4. 文件结构调整

建议调整为：

```txt
packages/web-c/bundler-plugin/src/
  core.ts
  rollup.ts
  rolldown.ts
  vite.ts
  external.ts
  transform.ts
  types.ts
  defaults.ts
  virtual.ts
  outputPlugins/
    manifest.ts
```

变化点：

```txt
core.ts:
  承接现在 rollup.ts 的通用主体逻辑。

rollup.ts:
  只负责 Rollup adapter、Rollup 默认配置、defineZeusRollupConfig。

rolldown.ts:
  只负责 Rolldown adapter、defineZeusRolldownConfig。

external.ts:
  从 vite.ts 里拆出 mergeExternal，避免主入口间接依赖 vite。

types.ts:
  不再强依赖 rollup 类型，避免 Rolldown-only 用户也被迫解析 rollup 类型。
```

现在 `types.ts` 直接 import 了 `rollup` 的 `OutputBundle`、`PluginContext`、`ExternalOption`。 这个要改掉。

---

## 5. 类型设计草案

```ts
// packages/web-c/bundler-plugin/src/types.ts
import type { CompilerOptions } from '@zeus-js/compiler'
import type {
  AnalyzerDiagnostic,
  ComponentManifest,
} from '@zeus-js/component-analyzer'

export type MaybePromise<T> = T | Promise<T>

export type DtsMode = boolean | 'auto'

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

export type RootOption = string | (() => string)

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

export interface ZeusVirtualModule {
  id: string
  code: string
  fileName?: string
}

export interface ZeusOutputAsset {
  type: 'asset'
  fileName: string
  source: string | Uint8Array
}

export interface ZeusOutputChunk {
  type: 'chunk'
  id: string
  fileName?: string
}

export type ZeusOutputFile = ZeusOutputAsset | ZeusOutputChunk

export interface ZeusBuildContext {
  root: string
  manifest: ComponentManifest
  diagnostics: AnalyzerDiagnostic[]

  dts: ResolvedDts
  outputs: ZeusOutputRegistry

  emitFile: (file: unknown) => string
  warn: (message: string | Error) => void
  error: (message: string | Error) => never
  addWatchFile: (id: string) => void

  meta: {
    watchMode: boolean
  }
}

export type ZeusOutputBundle = Record<string, unknown>

export interface ZeusComponentPlugin {
  name: string

  setup?(ctx: ZeusBuildContext): MaybePromise<void>

  buildStart?(ctx: ZeusBuildContext): MaybePromise<void>

  virtualModules?(
    ctx: ZeusBuildContext,
  ): MaybePromise<ZeusVirtualModule[] | void>

  generateBundle?(
    ctx: ZeusBuildContext,
    bundle: ZeusOutputBundle,
  ): MaybePromise<ZeusOutputFile[] | void>

  external?: string[]
}

export type ZeusTranspileMode = boolean | 'auto'

export interface ZeusBundlerPluginOptions {
  root?: RootOption

  components?: {
    include?: string[]
    exclude?: string[]
  }

  dts?: DtsMode

  compiler?: Partial<CompilerOptions>

  diagnostics?: boolean | 'verbose'

  plugins?: ZeusComponentPlugin[]

  /**
   * @default
   * - rollup: true
   * - rolldown: false
   * - vite: false
   */
  transpile?: ZeusTranspileMode

  /**
   * Rollup adapter only.
   *
   * @default ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
   */
  resolveExtensions?: string[] | false
}
```

---

## 6. core.ts 代码草案

```ts
// packages/web-c/bundler-plugin/src/core.ts
import fs from 'node:fs'
import path from 'node:path'

import { analyzeComponents } from '@zeus-js/component-analyzer'
import fg from 'fast-glob'

import { createComponentTransformFilter } from './componentTransformFilter'
import { resolveComponentExclude, resolveComponentInclude } from './defaults'
import { formatDiagnostic, hasErrorDiagnostics } from './diagnostics'
import { resolveDts } from './dts'
import { createOutputRegistry } from './outputRegistry'
import { transformZeus } from './transform'
import { VirtualModuleRegistry } from './virtual'

import type {
  ZeusBuildContext,
  ZeusBundlerPluginOptions,
  ZeusOutputBundle,
  ZeusOutputFile,
  ZeusVirtualModule,
} from './types'

export type ZeusBundlerTarget = 'vite' | 'rollup' | 'rolldown'

export interface CreateZeusBundlerPluginOptions {
  target: ZeusBundlerTarget
}

export function createZeusBundlerPlugin(
  options: ZeusBundlerPluginOptions = {},
  createOptions: CreateZeusBundlerPluginOptions,
) {
  const target = createOptions.target

  let shouldTransform = (_id: string) => false
  let ctx: ZeusBuildContext | undefined
  let root = process.cwd()

  const virtualModules = new VirtualModuleRegistry()

  return {
    name: resolvePluginName(target),

    async buildStart() {
      virtualModules.clear()

      root = resolveRoot(options.root)

      const include = resolveComponentInclude(options.components?.include)
      const exclude = resolveComponentExclude(options.components?.exclude)

      shouldTransform = createComponentTransformFilter({
        root,
        include,
        exclude,
      })

      const dts = await resolveDts({
        root,
        mode: options.dts,
        include,
        exclude,
      })

      const manifestResult = await createManifest(root, include, exclude)

      for (const file of await collectWatchFiles(root, include, exclude)) {
        this.addWatchFile(file)
      }

      const diagnostics = manifestResult.diagnostics

      for (const diagnostic of diagnostics) {
        const message = formatDiagnostic(diagnostic)

        if (diagnostic.level === 'error') {
          this.error(message)
        } else if (options.diagnostics !== false) {
          this.warn(message)
        }
      }

      if (hasErrorDiagnostics(diagnostics)) {
        this.error('[zeus] component analyzer failed.')
      }

      if (options.diagnostics === 'verbose') {
        this.warn(
          `[zeus] dts ${dts.enabled ? 'enabled' : 'disabled'}: ${
            dts.reason.join(', ') || 'no signal'
          }`,
        )
      }

      ctx = {
        root,
        manifest: manifestResult.manifest,
        diagnostics,
        dts,
        outputs: createOutputRegistry(),
        emitFile: this.emitFile.bind(this),
        warn: this.warn.bind(this),
        error: this.error.bind(this),
        addWatchFile: this.addWatchFile.bind(this),
        meta: {
          watchMode: this.meta.watchMode,
        },
      }

      const plugins = options.plugins ?? []

      for (const plugin of plugins) {
        await plugin.setup?.(ctx)
      }

      for (const plugin of plugins) {
        await plugin.buildStart?.(ctx)
      }

      for (const plugin of plugins) {
        const modules = await plugin.virtualModules?.(ctx)

        if (!modules) continue

        for (const mod of modules) {
          virtualModules.set(mod.id, mod.code, mod.fileName)
        }

        emitVirtualEntries(modules, this)
      }
    },

    resolveId(id: string, importer?: string) {
      const resolvedVirtual = virtualModules.resolve(id, importer)

      if (resolvedVirtual) {
        return {
          id: resolvedVirtual,
          moduleSideEffects: 'no-treeshake',
        }
      }

      if (target === 'rollup') {
        const resolvedTs = resolveTsLikeImport(id, importer, {
          root,
          extensions: options.resolveExtensions,
        })

        if (resolvedTs) {
          return resolvedTs
        }
      }

      return null
    },

    load(id: string) {
      return virtualModules.load(id)
    },

    async transform(code: string, id: string) {
      if (!shouldTransform(id)) {
        return null
      }

      return await transformZeus({
        id,
        code,
        compiler: options.compiler,
        sourcemap: true,
        transpile: resolveTranspile(options.transpile, target),
      })
    },

    async generateBundle(_: unknown, bundle: ZeusOutputBundle) {
      if (!ctx) return

      const plugins = options.plugins ?? []

      for (const plugin of plugins) {
        const files = await plugin.generateBundle?.(ctx, bundle)

        if (!files) continue

        for (const file of files) {
          emitOutputFile(this, file)
        }
      }
    },
  }
}

function resolvePluginName(target: ZeusBundlerTarget): string {
  if (target === 'vite') return 'vite-plugin-zeus'
  if (target === 'rolldown') return 'rolldown-plugin-zeus'
  return 'rollup-plugin-zeus'
}

function resolveTranspile(
  value: ZeusBundlerPluginOptions['transpile'],
  target: ZeusBundlerTarget,
): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  return target === 'rollup'
}

function resolveRoot(root: string | (() => string) | undefined): string {
  if (typeof root === 'function') {
    return path.resolve(root())
  }

  return path.resolve(root ?? process.cwd())
}

async function createManifest(
  root: string,
  include: string[],
  exclude: string[],
) {
  if (!include.length) {
    return {
      manifest: {
        version: 1 as const,
        components: [],
      },
      diagnostics: [],
    }
  }

  return await analyzeComponents({
    root,
    include,
    exclude,
  })
}

async function collectWatchFiles(
  root: string,
  include: string[],
  exclude: string[],
): Promise<string[]> {
  if (!include.length) return []

  return await fg(include, {
    cwd: root,
    absolute: true,
    ignore: exclude,
  })
}

function resolveTsLikeImport(
  id: string,
  importer: string | undefined,
  options: {
    root: string
    extensions: string[] | false | undefined
  },
): string | null {
  if (!importer) return null
  if (id.startsWith('\0') || importer.startsWith('\0')) return null
  if (!id.startsWith('.') && !id.startsWith('/')) return null
  if (options.extensions === false) return null

  const extensions = options.extensions ?? [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
  ]

  const base = id.startsWith('/')
    ? path.resolve(options.root, `.${id}`)
    : path.resolve(path.dirname(importer), id)

  const candidates = [
    base,
    ...extensions.map(ext => `${base}${ext}`),
    ...extensions.map(ext => path.join(base, `index${ext}`)),
  ]

  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return file
    }
  }

  return null
}

function emitOutputFile(
  pluginContext: {
    emitFile: (file: unknown) => void
  },
  file: ZeusOutputFile,
): void {
  if (file.type === 'asset') {
    pluginContext.emitFile({
      type: 'asset',
      fileName: file.fileName,
      source: file.source,
    })
    return
  }

  pluginContext.emitFile({
    type: 'chunk',
    id: file.id,
    fileName: file.fileName,
  })
}

function emitVirtualEntries(
  modules: ZeusVirtualModule[],
  pluginContext: {
    emitFile: (file: unknown) => void
  },
): void {
  for (const mod of modules) {
    if (!mod.fileName) continue

    pluginContext.emitFile({
      type: 'chunk',
      id: mod.id,
      fileName: mod.fileName,
      preserveSignature: 'strict',
    })
  }
}
```

---

## 7. transform.ts 代码草案

这里是关键：**Rollup 下默认擦除 TS，Rolldown/Vite 下默认不擦除 TS**。

```ts
// packages/web-c/bundler-plugin/src/transform.ts
// @ts-expect-error - @babel/core lacks types in this workspace
import { transformAsync } from '@babel/core'
import presetTypeScript from '@babel/preset-typescript'
import zeusCompiler from '@zeus-js/compiler'

import type { CompilerOptions } from '@zeus-js/compiler'

export interface TransformZeusOptions {
  id: string
  code: string
  compiler?: Partial<CompilerOptions>
  sourcemap?: boolean
  transpile?: boolean
}

export async function transformZeus(options: TransformZeusOptions) {
  const { id, code, compiler, sourcemap = true, transpile = false } = options

  const isTs = /\.[cm]?tsx?$/.test(id)
  const isTsx = /\.[cm]?tsx$/.test(id)

  const result = await transformAsync(code, {
    filename: id,
    sourceMaps: sourcemap,

    plugins: [
      [
        zeusCompiler,
        {
          moduleName: compiler?.moduleName ?? '@zeus-js/runtime-dom',
          generate: 'dom',
          hydratable: false,
          delegateEvents: true,
          ...compiler,
        } satisfies Partial<CompilerOptions>,
      ],
    ],

    presets:
      transpile && isTs
        ? [
            [
              presetTypeScript,
              {
                allExtensions: true,
                isTSX: isTsx,
                allowDeclareFields: true,
                onlyRemoveTypeImports: true,
              },
            ],
          ]
        : [],

    parserOpts: {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    },

    generatorOpts: {
      retainLines: false,
      compact: false,
      jsescOption: {
        minimal: true,
      },
    },
  })

  if (!result?.code) return null

  return {
    code: result.code,
    map: result.map,
  }
}
```

同时要把 `@babel/preset-typescript` 加到 `packages/web-c/bundler-plugin/package.json` 的 `dependencies` 里。现在这个包的 dependencies 里还没有它，只有 `@babel/core`、`@zeus-js/compiler`、`@zeus-js/component-analyzer`、`fast-glob`、`picomatch`。

```json
{
  "dependencies": {
    "@babel/core": "catalog:",
    "@babel/preset-typescript": "catalog:",
    "@zeus-js/compiler": "workspace:*",
    "@zeus-js/component-analyzer": "workspace:*",
    "fast-glob": "^3.3.3",
    "picomatch": "^4.0.4"
  }
}
```

---

## 8. rollup.ts 代码草案

```ts
// packages/web-c/bundler-plugin/src/rollup.ts
import { createZeusBundlerPlugin } from './core'

import type { Plugin, RollupOptions } from 'rollup'
import type { ZeusBundlerPluginOptions } from './types'

export interface ZeusRollupConfigOptions extends Omit<
  RollupOptions,
  'plugins'
> {
  zeus?: ZeusBundlerPluginOptions
  plugins?: RollupOptions['plugins']
}

export default function zeus(options: ZeusBundlerPluginOptions = {}): Plugin {
  return createZeusBundlerPlugin(options, {
    target: 'rollup',
  }) as Plugin
}

export function defineZeusRollupConfig(
  config: ZeusRollupConfigOptions = {},
): RollupOptions {
  const { zeus: zeusOptions, plugins, input, output, ...rest } = config

  return {
    input: input ?? 'src/index.ts',

    ...rest,

    plugins: [zeus(zeusOptions), ...normalizePlugins(plugins)],

    output: output ?? {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
    },
  }
}

function normalizePlugins(
  plugins: RollupOptions['plugins'] | undefined,
): Plugin[] {
  if (!plugins) return []

  return Array.isArray(plugins)
    ? (plugins.filter(Boolean) as Plugin[])
    : ([plugins].filter(Boolean) as Plugin[])
}

export { zeus }
```

---

## 9. rolldown.ts 代码草案

```ts
// packages/web-c/bundler-plugin/src/rolldown.ts
import { createZeusBundlerPlugin } from './core'

import type { Plugin, RolldownOptions } from 'rolldown'
import type { ZeusBundlerPluginOptions } from './types'

export interface ZeusRolldownConfigOptions extends Omit<
  RolldownOptions,
  'plugins'
> {
  zeus?: ZeusBundlerPluginOptions
  plugins?: RolldownOptions['plugins']
}

export default function zeus(options: ZeusBundlerPluginOptions = {}): Plugin {
  return createZeusBundlerPlugin(options, {
    target: 'rolldown',
  }) as Plugin
}

export function defineZeusRolldownConfig(
  config: ZeusRolldownConfigOptions = {},
): RolldownOptions {
  const { zeus: zeusOptions, plugins, input, output, ...rest } = config

  return {
    input: input ?? 'src/index.ts',

    ...rest,

    plugins: [zeus(zeusOptions), ...normalizePlugins(plugins)],

    output: output ?? {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
    },
  }
}

function normalizePlugins(
  plugins: RolldownOptions['plugins'] | undefined,
): Plugin[] {
  if (!plugins) return []

  return Array.isArray(plugins)
    ? (plugins.filter(Boolean) as Plugin[])
    : ([plugins].filter(Boolean) as Plugin[])
}

export { zeus }
```

---

## 10. vite.ts 调整草案

当前 Vite adapter 已经做了 `enforce: 'pre'`、`jsx preserve`、runtime-dom alias、dedupe、external merge 等，这些都应该保留。

但建议改成从 `core.ts` 创建插件：

```ts
// packages/web-c/bundler-plugin/src/vite.ts
import { createRequire } from 'node:module'
import path from 'node:path'

import { mergeConfig } from 'vite'

import { createZeusBundlerPlugin } from './core'
import { mergeExternal } from './external'

import type { RollupExternalOption, ZeusBundlerPluginOptions } from './types'
import type { Plugin, ResolvedConfig, UserConfig } from 'vite'

export function createZeusVitePlugin(
  options: ZeusBundlerPluginOptions = {},
): Plugin {
  let resolvedConfig: ResolvedConfig | undefined

  const zeusPlugin = createZeusBundlerPlugin(
    {
      ...options,
      root: options.root ?? (() => resolvedConfig?.root ?? process.cwd()),
      transpile: options.transpile ?? false,
    },
    {
      target: 'vite',
    },
  ) as unknown as Plugin

  return {
    ...zeusPlugin,
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    async config(userConfig) {
      const runtimeDomEntry = resolveRuntimeDOMEntry(userConfig.root)
      const pluginExternals = collectPluginExternals(options)

      const pluginConfig: UserConfig = {
        ...((await isRolldownVite())
          ? {
              oxc: {
                jsx: 'preserve',
              },
            }
          : {
              esbuild: {
                jsx: 'preserve',
              },
            }),

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
      }

      if (!pluginExternals.length) {
        return pluginConfig
      }

      return mergeConfig(pluginConfig, {
        build: {
          rollupOptions: {
            external: mergeExternal(
              userConfig.build?.rollupOptions?.external,
              pluginExternals,
            ),
          },
        },
      })
    },

    configResolved(config) {
      resolvedConfig = config
    },
  }
}

export default createZeusVitePlugin

export { createZeusVitePlugin as zeus }

function collectPluginExternals(options: ZeusBundlerPluginOptions): string[] {
  const set = new Set<string>()

  for (const plugin of options.plugins ?? []) {
    for (const dep of plugin.external ?? []) {
      set.add(dep)
    }
  }

  return Array.from(set)
}

async function isRolldownVite(): Promise<boolean> {
  try {
    const vite = (await import('vite')) as Record<string, unknown>

    return (
      typeof vite.rolldownVersion === 'string' ||
      typeof vite.transformWithOxc === 'function'
    )
  } catch {
    return false
  }
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
```

---

## 11. external.ts 草案

现在 `src/index.ts` 从 `./vite` 导出了 `mergeExternal`，这会让主入口间接依赖 Vite。 建议拆出来：

```ts
// packages/web-c/bundler-plugin/src/external.ts
export type RollupExternalOption =
  | string
  | RegExp
  | Array<string | RegExp>
  | ((
      source: string,
      importer: string | undefined,
      isResolved: boolean,
    ) => boolean)

export function mergeExternal(
  userExternal: RollupExternalOption | undefined,
  pluginExternal: string[],
): RollupExternalOption {
  if (!userExternal) {
    return pluginExternal
  }

  if (typeof userExternal === 'function') {
    return (source, importer, isResolved) => {
      return (
        pluginExternal.includes(source) ||
        userExternal(source, importer, isResolved)
      )
    }
  }

  return [
    ...(Array.isArray(userExternal) ? userExternal : [userExternal]),
    ...pluginExternal,
  ]
}
```

然后：

```ts
// src/index.ts
export { default, zeus } from './rollup'
export { createOutputRegistry } from './outputRegistry'
export { resolveComponentInclude, resolveComponentExclude } from './defaults'
export { resolvePluginDts } from './pluginOptions'
export { mergeExternal } from './external'

export type {
  DtsMode,
  ResolvedDts,
  DtsAutoReason,
  RollupExternalOption,
  ZeusBuildContext,
  ZeusBundlerPluginOptions,
  ZeusOutputAsset,
  ZeusOutputChunk,
  ZeusOutputFile,
  ZeusComponentPlugin,
  ZeusVirtualModule,
  ZeusOutputKind,
  ZeusOutputRegistry,
  ZeusOutputRegistration,
  RequiredZeusOutputRegistration,
} from './types'
```

---

## 12. package.json 调整

当前 `peerDependencies` 只有 Rollup / Vite，Rolldown 没有声明。 既然已经有 `./rolldown` 入口，建议补：

```json
{
  "peerDependencies": {
    "rollup": "^4.0.0",
    "rolldown": "^1.0.0",
    "vite": "catalog:"
  },
  "peerDependenciesMeta": {
    "rollup": {
      "optional": true
    },
    "rolldown": {
      "optional": true
    },
    "vite": {
      "optional": true
    }
  },
  "dependencies": {
    "@babel/core": "catalog:",
    "@babel/preset-typescript": "catalog:",
    "@zeus-js/compiler": "workspace:*",
    "@zeus-js/component-analyzer": "workspace:*",
    "fast-glob": "^3.3.3",
    "picomatch": "^4.0.4"
  }
}
```

---

## 13. 测试设计

### 13.1 transform 单测

```ts
// packages/web-c/bundler-plugin/__tests__/transform.spec.ts
import { describe, expect, it } from 'vitest'

import { transformZeus } from '../src/transform'

describe('transformZeus', () => {
  it('strips TypeScript syntax when transpile is true', async () => {
    const result = await transformZeus({
      id: '/project/src/Button.tsx',
      code: `
        export interface ButtonProps {
          label: string
        }

        export function Button(props: ButtonProps) {
          return <button>{props.label}</button>
        }
      `,
      transpile: true,
    })

    expect(result?.code).toBeTruthy()
    expect(result?.code).not.toContain('interface ButtonProps')
    expect(result?.code).not.toContain(': ButtonProps')
  })

  it('keeps TypeScript syntax when transpile is false', async () => {
    const result = await transformZeus({
      id: '/project/src/Button.tsx',
      code: `
        export interface ButtonProps {
          label: string
        }

        export function Button(props: ButtonProps) {
          return <button>{props.label}</button>
        }
      `,
      transpile: false,
    })

    expect(result?.code).toBeTruthy()
    expect(result?.code).toContain('interface ButtonProps')
  })
})
```

---

### 13.2 Rollup 集成测试

目标：用户只配置 `zeus()`，不加 esbuild / typescript 插件，也能构建 TSX 组件。

```ts
// packages/web-c/bundler-plugin/__tests__/rollup-tsx.spec.ts
import fs from 'node:fs'
import path from 'node:path'

import { rollup } from 'rollup'
import { afterEach, describe, expect, it } from 'vitest'

import zeus from '../src/rollup'

const root = path.resolve(__dirname, 'fixtures/rollup-tsx')

describe('rollup adapter', () => {
  afterEach(() => {
    fs.rmSync(path.join(root, 'dist'), {
      recursive: true,
      force: true,
    })
  })

  it('builds tsx components with zeus() only', async () => {
    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      plugins: [
        zeus({
          root,
        }),
      ],
    })

    await bundle.write({
      dir: path.join(root, 'dist'),
      format: 'es',
    })

    const files = fs.readdirSync(path.join(root, 'dist'))

    expect(files.length).toBeGreaterThan(0)
  })
})
```

fixture：

```tsx
// fixtures/rollup-tsx/src/Button.tsx
export interface ButtonProps {
  label: string
}

export function Button(props: ButtonProps) {
  return <button>{props.label}</button>
}
```

```ts
// fixtures/rollup-tsx/src/index.ts
export { Button } from './Button'
```

---

### 13.3 Rolldown 集成测试

```ts
// packages/web-c/bundler-plugin/__tests__/rolldown-tsx.spec.ts
import fs from 'node:fs'
import path from 'node:path'

import { build } from 'rolldown'
import { afterEach, describe, expect, it } from 'vitest'

import zeus from '../src/rolldown'

const root = path.resolve(__dirname, 'fixtures/rolldown-tsx')

describe('rolldown adapter', () => {
  afterEach(() => {
    fs.rmSync(path.join(root, 'dist'), {
      recursive: true,
      force: true,
    })
  })

  it('builds tsx components with zeus() only', async () => {
    await build({
      input: path.join(root, 'src/index.ts'),
      plugins: [
        zeus({
          root,
        }),
      ],
      output: {
        dir: path.join(root, 'dist'),
        format: 'esm',
      },
    })

    const files = fs.readdirSync(path.join(root, 'dist'))

    expect(files.length).toBeGreaterThan(0)
  })
})
```

---

## 14. 文档建议

文档里不要把 Rollup / Rolldown 的心智负担暴露给用户。建议这样写：

````md
## Rollup

```ts
import { defineZeusRollupConfig } from '@zeus-js/bundler-plugin/rollup'

export default defineZeusRollupConfig()
```
````

默认会处理：

- `src/**/*.{ts,tsx,js,jsx}`
- `components/**/*.{ts,tsx,js,jsx}`
- TypeScript / TSX 组件编译
- Zeus JSX 编译
- dts auto
- watch files
- component-host plugins

## Rolldown

```ts
import { defineZeusRolldownConfig } from '@zeus-js/bundler-plugin/rolldown'

export default defineZeusRolldownConfig()
```

Rolldown 会在 Zeus transform 之后继续处理 TypeScript / JSX。

````

---

## 15. 落地顺序

建议按这个顺序做：

```txt
P0:
  1. 新增 core.ts，把 rollup.ts 主体逻辑搬过去。
  2. rollup.ts / rolldown.ts 改成 adapter。
  3. transform.ts 增加 transpile。
  4. bundler-plugin package.json 增加 @babel/preset-typescript 依赖。
  5. Rollup TSX 集成测试跑通。

P1:
  1. types.ts 去 Rollup 类型耦合。
  2. external.ts 从 vite.ts 拆出来。
  3. index.ts 不再从 vite.ts re-export mergeExternal。
  4. 增加 rolldown optional peerDependency。
  5. Rolldown TSX 集成测试跑通。

P2:
  1. 增加 defineZeusRollupConfig。
  2. 增加 defineZeusRolldownConfig。
  3. 更新 API snapshot。
  4. 更新 docs/api/packages.md 和使用文档。
````

---

## 最终判断

这个分支的方向是对的，但还差一个关键收口：

```txt
Rolldown:
  现在 re-export Rollup 实现是可以跑的，但最好改成 adapter 语义。

Rollup:
  必须默认处理 TS/TSX，否则用户写 TS 组件时会被迫额外配置插件，违背你“降低心智负担”的目标。

Vite:
  继续保留现在的 jsx preserve、alias、dedupe、external merge，但 mergeExternal 要从 vite.ts 拆出去，避免主入口污染 Vite 依赖。
```

也就是一句话：**对用户暴露 zeus()，对内部区分 target。Rollup 多兜底，Rolldown 少干预，Vite 做体验增强。**

[1]: https://rolldown.rs/apis/plugin-api 'Plugin API | Rolldown'
[2]: https://rollupjs.org/plugin-development/ 'Plugin Development | Rollup'
