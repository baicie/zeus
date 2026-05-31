# Phase 3：Bundler Plugin Host 详细设计与代码草案

Phase 3 的核心目标是新增一个通用插件宿主：

```txt id="fld7rv"
@zeus-js/bundler-plugin
```

它负责三件事：

```txt id="v8ca2o"
1. 复用 @zeus-js/compiler 做 JSX transform
2. 调用 @zeus-js/component-analyzer 生成 ComponentManifest
3. 提供 outputs 插件机制，让后续 output-wc / output-react / output-vue 接入
```

它不负责真正生成 Web Component / React / Vue 产物，那是 Phase 4 / Phase 6 的事情。

当前 `addons/vite-plugin` 已经有可复用的核心能力：在 `transform` 阶段调用 Babel `transformAsync`，并挂载 `@zeus-js/compiler`。
当前 compiler 仍然是单文件 JSX 编译管线，所以 bundler plugin 不应该侵入 compiler 内部，只作为构建期编排层。
仓库当前 workspace 已经覆盖 `packages/*` 和 `addons/*`，构建脚本也会扫描这两个目录并通过 `buildOptions` 判断可构建包，所以新包放 `addons/bundler-plugin` 最合适。 

---

# 1. Phase 3 目标

## 做什么

```txt id="swroco"
1. 新增 addons/bundler-plugin
2. 抽象 Rollup/Rolldown 通用插件
3. 提供 Vite wrapper，替代当前 addons/vite-plugin 内部 transform 逻辑
4. 支持组件扫描，接入 Phase 2 的 component-analyzer
5. 提供 ComponentManifest 给 output plugins
6. 提供 virtual modules 注册机制
7. 提供 generateBundle asset/chunk emit 机制
8. 提供 diagnostics 输出
9. 提供测试
10. 提供调试用 manifest output 插件或测试 output 插件
```

## 不做什么

```txt id="c3r8r3"
1. 不做 output-wc 正式实现
2. 不做 React wrapper
3. 不做 Vue wrapper
4. 不做 d.ts 输出体系
5. 不做 shadcn-like registry
6. 不重写 @zeus-js/compiler
```

Phase 3 只做“插件宿主”，后续输出插件都基于它扩展。

---

# 2. 最终使用方式

## Vite

```ts id="b1z71s"
// vite.config.ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/bundler-plugin/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [],
    }),
  ],
})
```

## Rollup

```ts id="5obxnp"
// rollup.config.ts
import zeus from '@zeus-js/bundler-plugin'

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [],
    }),
  ],
}
```

## Rolldown

```ts id="8iuwp3"
// rolldown.config.ts
import { defineConfig } from 'rolldown'
import zeus from '@zeus-js/bundler-plugin'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
    }),
  ],
})
```

## 后续输出插件接入形态

```ts id="b4z7gz"
import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'

export default {
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [
        wc(),
        react(),
        vue(),
      ],
    }),
  ],
}
```

---

# 3. 包位置

新增：

```txt id="xlnqmn"
addons/bundler-plugin
```

后续可以把当前：

```txt id="z5m1ts"
addons/vite-plugin
```

改成 facade：

```ts id="kbgejb"
export { default, zeus } from '@zeus-js/bundler-plugin/vite'
```

当前根目录脚本已经支持 `addons/*/dist` 清理和构建。

---

# 4. 包结构

```txt id="js4lvo"
addons/bundler-plugin/
  package.json
  src/
    index.ts
    rollup.ts
    vite.ts
    types.ts
    filter.ts
    transform.ts
    virtual.ts
    diagnostics.ts
    utils.ts
    outputPlugins/
      manifest.ts
  __tests__/
    transform.spec.ts
    manifest.spec.ts
    outputPlugin.spec.ts
```

`outputPlugins/manifest.ts` 是 Phase 3 的调试输出插件，不是正式 `output-wc`。它只用于验证 outputs 机制：

```txt id="f4jhrm"
dist/zeus.components.json
```

---

# 5. package.json 草案

```json id="negbgf"
// addons/bundler-plugin/package.json
{
  "name": "@zeus-js/bundler-plugin",
  "version": "0.0.2",
  "description": "Zeus bundler plugin host",
  "type": "module",
  "main": "index.js",
  "module": "dist/bundler-plugin.esm-bundler.js",
  "types": "dist/bundler-plugin.d.ts",
  "files": [
    "index.js",
    "dist"
  ],
  "exports": {
    ".": {
      "types": "./dist/bundler-plugin.d.ts",
      "node": {
        "production": "./dist/bundler-plugin.cjs.prod.js",
        "development": "./dist/bundler-plugin.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/bundler-plugin.esm-bundler.js",
      "import": "./dist/bundler-plugin.esm-bundler.js",
      "require": "./index.js"
    },
    "./vite": {
      "types": "./dist/vite.d.ts",
      "import": "./dist/vite.js"
    },
    "./manifest": {
      "types": "./dist/outputPlugins/manifest.d.ts",
      "import": "./dist/outputPlugins/manifest.js"
    },
    "./*": "./*"
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusBundlerPlugin",
    "formats": [
      "esm-bundler",
      "cjs"
    ]
  },
  "dependencies": {
    "@babel/core": "catalog:",
    "@zeus-js/compiler": "workspace:*",
    "@zeus-js/component-analyzer": "workspace:*",
    "fast-glob": "^3.3.3"
  },
  "peerDependencies": {
    "rollup": "^4.0.0",
    "vite": "catalog:"
  },
  "peerDependenciesMeta": {
    "rollup": {
      "optional": true
    },
    "vite": {
      "optional": true
    }
  },
  "keywords": [
    "zeus",
    "vite",
    "rollup",
    "rolldown",
    "web-components"
  ],
  "author": "Baicie",
  "license": "MIT"
}
```

---

# 6. 核心类型设计

## `types.ts`

```ts id="hqe5gt"
// addons/bundler-plugin/src/types.ts

import type { PluginContext, OutputBundle } from 'rollup'
import type { CompilerOptions } from '@zeus-js/compiler'
import type {
  AnalyzerDiagnostic,
  ComponentManifest,
} from '@zeus-js/component-analyzer'

export type MaybePromise<T> = T | Promise<T>

export type RootOption = string | (() => string)

export interface ZeusBundlerPluginOptions {
  /**
   * Source files to transform with @zeus-js/compiler.
   */
  include?: RegExp | RegExp[]

  /**
   * Source files to skip.
   */
  exclude?: RegExp | RegExp[]

  /**
   * Root directory for component analyzer.
   */
  root?: RootOption

  /**
   * Compiler options.
   */
  compiler?: Partial<CompilerOptions>

  /**
   * Component analyzer options.
   */
  components?: {
    include?: string[]
    exclude?: string[]
  }

  /**
   * Output plugins.
   */
  outputs?: ZeusOutputPlugin[]

  /**
   * Emit manifest diagnostics as warnings.
   */
  diagnostics?: boolean
}

export interface ZeusBuildContext {
  root: string
  manifest: ComponentManifest
  diagnostics: AnalyzerDiagnostic[]

  emitFile: PluginContext['emitFile']
  warn: PluginContext['warn']
  error: PluginContext['error']
  addWatchFile: PluginContext['addWatchFile']

  meta: {
    watchMode: boolean
  }
}

export interface ZeusVirtualModule {
  /**
   * Public virtual id.
   * Example: zeus:wc:index
   */
  id: string

  /**
   * Output fileName when emitted as a chunk.
   */
  fileName?: string

  /**
   * Virtual module code.
   */
  code: string
}

export interface ZeusOutputAsset {
  type: 'asset'
  fileName: string
  source: string
}

export interface ZeusOutputChunk {
  type: 'chunk'
  id: string
  fileName?: string
}

export type ZeusOutputFile = ZeusOutputAsset | ZeusOutputChunk

export interface ZeusOutputPlugin {
  name: string

  buildStart?: (ctx: ZeusBuildContext) => MaybePromise<void>

  virtualModules?: (
    ctx: ZeusBuildContext,
  ) => MaybePromise<ZeusVirtualModule[] | void>

  generateBundle?: (
    ctx: ZeusBuildContext,
    bundle: OutputBundle,
  ) => MaybePromise<ZeusOutputFile[] | void>
}
```

---

# 7. filter 工具

当前 Vite 插件里已有 `include / exclude` RegExp 判断逻辑。Phase 3 抽出来。

## `filter.ts`

```ts id="8mp7dn"
// addons/bundler-plugin/src/filter.ts

export interface FilterOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
}

export function normalizePatterns(value: RegExp | RegExp[]): RegExp[] {
  return Array.isArray(value) ? value : [value]
}

export function createFilter(options: FilterOptions = {}) {
  const include = normalizePatterns(options.include ?? /\.[tj]sx(?:\?.*)?$/)
  const exclude = normalizePatterns(options.exclude ?? /node_modules/)

  return function shouldTransform(id: string): boolean {
    const cleanId = cleanUrl(id)

    if (exclude.some(pattern => pattern.test(cleanId))) {
      return false
    }

    return include.some(pattern => pattern.test(cleanId))
  }
}

export function cleanUrl(id: string): string {
  return id.replace(/[?#].*$/, '')
}
```

---

# 8. compiler transform 抽象

当前 Vite 插件的 transform 使用的是 Babel `transformAsync` + `@zeus-js/compiler`。

## `transform.ts`

```ts id="7ogjjy"
// addons/bundler-plugin/src/transform.ts

import { transformAsync } from '@babel/core'
import zeusCompiler from '@zeus-js/compiler'

import type { CompilerOptions } from '@zeus-js/compiler'

export interface TransformZeusOptions {
  id: string
  code: string
  compiler?: Partial<CompilerOptions>
  sourcemap?: boolean
}

export async function transformZeus(
  options: TransformZeusOptions,
): Promise<{
  code: string
  map: unknown
} | null> {
  const { id, code, compiler, sourcemap = true } = options

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
    map: result.map ?? null,
  }
}
```

---

# 9. virtual module registry

## `virtual.ts`

```ts id="c5okam"
// addons/bundler-plugin/src/virtual.ts

const RESOLVED_VIRTUAL_PREFIX = '\0'

export class VirtualModuleRegistry {
  private readonly modules = new Map<string, string>()

  set(id: string, code: string): void {
    this.modules.set(normalizeVirtualId(id), code)
  }

  has(id: string): boolean {
    return this.modules.has(normalizeVirtualId(id))
  }

  get(id: string): string | undefined {
    return this.modules.get(normalizeVirtualId(id))
  }

  clear(): void {
    this.modules.clear()
  }

  resolve(id: string): string | null {
    const normalized = normalizeVirtualId(id)

    if (!this.modules.has(normalized)) {
      return null
    }

    return RESOLVED_VIRTUAL_PREFIX + normalized
  }

  load(id: string): string | null {
    if (!id.startsWith(RESOLVED_VIRTUAL_PREFIX)) {
      return null
    }

    const normalized = id.slice(RESOLVED_VIRTUAL_PREFIX.length)

    return this.modules.get(normalized) ?? null
  }
}

export function normalizeVirtualId(id: string): string {
  return id.startsWith('\0') ? id.slice(1) : id
}
```

---

# 10. diagnostics

## `diagnostics.ts`

```ts id="xyyawx"
// addons/bundler-plugin/src/diagnostics.ts

import type { AnalyzerDiagnostic } from '@zeus-js/component-analyzer'

export function formatDiagnostic(diagnostic: AnalyzerDiagnostic): string {
  return `[zeus component-analyzer] ${diagnostic.file}: ${diagnostic.message}`
}

export function hasErrorDiagnostics(
  diagnostics: AnalyzerDiagnostic[],
): boolean {
  return diagnostics.some(item => item.level === 'error')
}
```

---

# 11. Rollup/Rolldown 通用插件

## `rollup.ts`

```ts id="cg6x9n"
// addons/bundler-plugin/src/rollup.ts

import path from 'node:path'

import fg from 'fast-glob'
import { analyzeComponents } from '@zeus-js/component-analyzer'

import { createFilter } from './filter'
import {
  formatDiagnostic,
  hasErrorDiagnostics,
} from './diagnostics'
import { transformZeus } from './transform'
import { VirtualModuleRegistry } from './virtual'

import type { Plugin } from 'rollup'
import type {
  RootOption,
  ZeusBuildContext,
  ZeusBundlerPluginOptions,
  ZeusOutputFile,
} from './types'

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
      const manifestResult = await createManifest(root, options)

      for (const file of await collectWatchFiles(root, options)) {
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

      ctx = {
        root,
        manifest: manifestResult.manifest,
        diagnostics,
        emitFile: this.emitFile.bind(this),
        warn: this.warn.bind(this),
        error: this.error.bind(this),
        addWatchFile: this.addWatchFile.bind(this),
        meta: {
          watchMode: this.meta.watchMode,
        },
      }

      const outputs = options.outputs ?? []

      for (const output of outputs) {
        await output.buildStart?.(ctx)
      }

      for (const output of outputs) {
        const modules = await output.virtualModules?.(ctx)

        if (!modules) continue

        for (const mod of modules) {
          virtualModules.set(mod.id, mod.code)

          if (mod.fileName) {
            this.emitFile({
              type: 'chunk',
              id: mod.id,
              fileName: mod.fileName,
            })
          }
        }
      }
    },

    resolveId(id) {
      return virtualModules.resolve(id)
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

      const outputs = options.outputs ?? []

      for (const output of outputs) {
        const files = await output.generateBundle?.(ctx, bundle)

        if (!files) continue

        for (const file of files) {
          emitOutputFile(this, file)
        }
      }
    },
  }
}

async function createManifest(
  root: string,
  options: ZeusBundlerPluginOptions,
) {
  const include = options.components?.include ?? []
  const exclude = options.components?.exclude ?? []

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
  options: ZeusBundlerPluginOptions,
): Promise<string[]> {
  const include = options.components?.include ?? []

  if (!include.length) return []

  const files = await fg(include, {
    cwd: root,
    absolute: true,
    ignore: options.components?.exclude ?? [
      'node_modules/**',
      '**/dist/**',
    ],
  })

  return files
}

function resolveRoot(root: RootOption | undefined): string {
  if (typeof root === 'function') {
    return path.resolve(root())
  }

  return path.resolve(root ?? process.cwd())
}

function emitOutputFile(
  plugin: {
    emitFile: Plugin['emitFile']
  },
  file: ZeusOutputFile,
): void {
  if (file.type === 'asset') {
    plugin.emitFile({
      type: 'asset',
      fileName: file.fileName,
      source: file.source,
    })
    return
  }

  plugin.emitFile({
    type: 'chunk',
    id: file.id,
    fileName: file.fileName,
  })
}
```

---

# 12. Vite wrapper

Vite 还需要做两件额外的事情：

```txt id="9a13lp"
1. 设置 JSX preserve，避免 esbuild/oxc 提前处理 JSX
2. resolve.alias / dedupe runtime-dom、signal、zeus
```

当前 Vite 插件已经做了这些事。

## `vite.ts`

```ts id="xsqvcy"
// addons/bundler-plugin/src/vite.ts

import { createRequire } from 'node:module'
import path from 'node:path'

import { createZeusPlugin } from './rollup'

import type { Plugin, UserConfig, ResolvedConfig } from 'vite'
import type { ZeusBundlerPluginOptions } from './types'

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

      return {
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
          ],
        },
      } satisfies UserConfig
    },

    configResolved(config) {
      resolvedConfig = config

      if (typeof rollupPlugin.configResolved === 'function') {
        return rollupPlugin.configResolved.call(this, config)
      }
    },
  }
}

export default createZeusVitePlugin

export { createZeusVitePlugin as zeus }

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
  } catch {
    // The common app shape depends only on @zeus-js/zeus.
    // Compiler output still imports runtime helpers directly,
    // so resolve runtime-dom through Zeus.
  }

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

# 13. index 导出

## `index.ts`

```ts id="c5cb8s"
// addons/bundler-plugin/src/index.ts

export { createZeusPlugin as zeus, createZeusPlugin as default } from './rollup'

export type {
  MaybePromise,
  RootOption,
  ZeusBuildContext,
  ZeusBundlerPluginOptions,
  ZeusOutputAsset,
  ZeusOutputChunk,
  ZeusOutputFile,
  ZeusOutputPlugin,
  ZeusVirtualModule,
} from './types'
```

---

# 14. 调试用 manifest output 插件

Phase 3 需要验证 outputs 机制，所以可以提供一个轻量调试输出插件：

```ts id="p6g5ys"
import manifest from '@zeus-js/bundler-plugin/manifest'

zeus({
  components: {
    include: ['src/components/**/*.{ts,tsx}'],
  },
  outputs: [
    manifest({
      fileName: 'zeus.components.json',
    }),
  ],
})
```

## `outputPlugins/manifest.ts`

```ts id="bm1r9q"
// addons/bundler-plugin/src/outputPlugins/manifest.ts

import type { ZeusOutputPlugin } from '../types'

export interface ManifestOutputOptions {
  fileName?: string
  pretty?: boolean
}

export default function manifestOutput(
  options: ManifestOutputOptions = {},
): ZeusOutputPlugin {
  const fileName = options.fileName ?? 'zeus.components.json'
  const pretty = options.pretty ?? true

  return {
    name: 'zeus-output-manifest',

    generateBundle(ctx) {
      return [
        {
          type: 'asset',
          fileName,
          source: JSON.stringify(
            ctx.manifest,
            null,
            pretty ? 2 : 0,
          ),
        },
      ]
    },
  }
}
```

---

# 15. 迁移现有 vite-plugin

Phase 3 可以先不删 `addons/vite-plugin`，只把它变成 facade，避免外部使用方式变化。

## `addons/vite-plugin/src/index.ts`

```ts id="mpp622"
// addons/vite-plugin/src/index.ts

export {
  default,
  zeus,
  createZeusVitePlugin,
} from '@zeus-js/bundler-plugin/vite'

export type {
  ZeusBundlerPluginOptions as ZeusVitePluginOptions,
} from '@zeus-js/bundler-plugin'
```

这个迁移的好处：

```txt id="e31fsl"
1. 现有 import '@zeus-js/vite-plugin' 不破坏
2. 新用户可以直接用 '@zeus-js/bundler-plugin/vite'
3. Rollup/Rolldown 用 '@zeus-js/bundler-plugin'
```

---

# 16. 测试设计

## 16.1 transform 测试

```ts id="rn2e5z"
// addons/bundler-plugin/__tests__/transform.spec.ts

import { describe, expect, it } from 'vitest'
import { transformZeus } from '../src/transform'

describe('transformZeus', () => {
  it('transforms Zeus JSX', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App() {
          return <div>Hello {name}</div>
        }
      `,
    })

    expect(result?.code).toContain('@zeus-js/runtime-dom')
    expect(result?.code).toMatchInlineSnapshot()
  })

  it('supports custom runtime moduleName', async () => {
    const result = await transformZeus({
      id: 'fixture.tsx',
      code: `
        export function App() {
          return <div>Hello</div>
        }
      `,
      compiler: {
        moduleName: 'custom-runtime',
      },
    })

    expect(result?.code).toContain('custom-runtime')
  })
})
```

---

## 16.2 manifest 输出测试

```ts id="xgf66i"
// addons/bundler-plugin/__tests__/manifest.spec.ts

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import zeus from '../src'
import manifestOutput from '../src/outputPlugins/manifest'

describe('bundler plugin manifest', () => {
  it('emits component manifest asset', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-bundler-'),
    )

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/index.ts'),
      `
        import './components/button'
      `,
    )

    await fs.writeFile(
      path.join(root, 'src/components/button.tsx'),
      `
        import { defineElement, Slot } from '@zeus-js/zeus'

        export interface ButtonProps {
          variant?: 'default' | 'outline'
        }

        export const ZButton = defineElement<ButtonProps>(
          'z-button',
          {
            props: {
              variant: {
                type: String,
                default: 'default',
                reflect: true,
              },
            },
          },
          () => <button><Slot /></button>,
        )
      `,
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      plugins: [
        zeus({
          root,
          components: {
            include: ['src/components/**/*.{ts,tsx}'],
          },
          outputs: [
            manifestOutput({
              fileName: 'components.json',
            }),
          ],
        }),
      ],
      onwarn() {},
    })

    const output = await bundle.generate({
      format: 'esm',
      dir: path.join(root, 'dist'),
    })

    const asset = output.output.find(
      item => item.type === 'asset' && item.fileName === 'components.json',
    )

    expect(asset).toBeTruthy()

    const manifest = JSON.parse(String((asset as any).source))

    expect(manifest).toMatchObject({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          props: {
            variant: {
              type: 'string',
              default: 'default',
              reflect: true,
              values: ['default', 'outline'],
            },
          },
        },
      ],
    })
  })
})
```

---

## 16.3 output plugin lifecycle 测试

```ts id="12suxu"
// addons/bundler-plugin/__tests__/outputPlugin.spec.ts

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rollup } from 'rollup'
import { describe, expect, it, vi } from 'vitest'

import zeus from '../src'
import type { ZeusOutputPlugin } from '../src'

describe('output plugin lifecycle', () => {
  it('calls output plugin hooks', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-output-hooks-'),
    )

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/index.tsx'),
      `
        export function App() {
          return <div>App</div>
        }
      `,
    )

    const buildStart = vi.fn()
    const virtualModules = vi.fn()
    const generateBundle = vi.fn()

    const outputPlugin: ZeusOutputPlugin = {
      name: 'test-output',

      buildStart(ctx) {
        buildStart(ctx.manifest)
      },

      virtualModules() {
        virtualModules()

        return [
          {
            id: 'zeus:test:virtual',
            fileName: 'virtual.js',
            code: `export const value = 1;`,
          },
        ]
      },

      generateBundle() {
        generateBundle()

        return [
          {
            type: 'asset',
            fileName: 'test.txt',
            source: 'ok',
          },
        ]
      },
    }

    const bundle = await rollup({
      input: path.join(root, 'src/index.tsx'),
      plugins: [
        zeus({
          root,
          outputs: [outputPlugin],
        }),
      ],
      onwarn() {},
    })

    const result = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    expect(buildStart).toHaveBeenCalledTimes(1)
    expect(virtualModules).toHaveBeenCalledTimes(1)
    expect(generateBundle).toHaveBeenCalledTimes(1)

    expect(
      result.output.some(item => item.fileName === 'test.txt'),
    ).toBe(true)

    expect(
      result.output.some(item => item.fileName === 'virtual.js'),
    ).toBe(true)
  })
})
```

---

# 17. Vite 插件兼容测试建议

Vite 集成测试可以放轻一点，因为完整 Vite dev server 会重。Phase 3 先做配置层测试：

```ts id="4efuv6"
// addons/bundler-plugin/__tests__/vite.spec.ts

import { describe, expect, it } from 'vitest'
import zeus from '../src/vite'

describe('vite plugin', () => {
  it('creates vite plugin with expected name', () => {
    const plugin = zeus()

    expect(plugin.name).toBe('vite-plugin-zeus')
    expect(plugin.enforce).toBe('pre')
    expect(typeof plugin.transform).toBe('function')
  })
})
```

完整 Vite example 放 `examples/web-component` 验证。

---

# 18. 文档草案

新增：

```txt id="w4fx00"
docs/internal/design/component-compiler-host-phase3.md
```

````md id="mevq8p"
# Component Compiler Host Phase 3

## Goal

Introduce `@zeus-js/bundler-plugin` as the common bundler plugin host for Rollup, Rolldown and Vite.

## Responsibilities

- Transform JSX through `@zeus-js/compiler`
- Analyze components through `@zeus-js/component-analyzer`
- Provide `ComponentManifest` to output plugins
- Register virtual modules
- Emit output assets/chunks

## Non-goals

- No Web Component output implementation
- No React wrapper
- No Vue wrapper
- No dts generation

## Package layout

- `@zeus-js/bundler-plugin`
- `@zeus-js/bundler-plugin/vite`
- `@zeus-js/bundler-plugin/manifest`

## Output plugin lifecycle

```ts
interface ZeusOutputPlugin {
  name: string
  buildStart?: (ctx: ZeusBuildContext) => void | Promise<void>
  virtualModules?: (ctx: ZeusBuildContext) => ZeusVirtualModule[] | void
  generateBundle?: (ctx: ZeusBuildContext, bundle: OutputBundle) => ZeusOutputFile[] | void
}
````

## Future outputs

* `@zeus-js/output-wc`
* `@zeus-js/output-react-wrapper`
* `@zeus-js/output-vue-wrapper`

````

---

# 19. 验收清单

```txt id="dwyrqt"
[ ] 新增 addons/bundler-plugin
[ ] 支持 Rollup 插件 API
[ ] 支持 Rolldown 复用
[ ] 支持 Vite wrapper
[ ] 当前 addons/vite-plugin 可迁移为 facade
[ ] transform 行为与当前 vite-plugin 一致
[ ] buildStart 调用 component-analyzer
[ ] outputs 能拿到 ComponentManifest
[ ] 支持 virtualModules
[ ] 支持 generateBundle emit asset/chunk
[ ] manifest debug output 可用
[ ] 单测覆盖 transform / manifest / output lifecycle
[ ] examples/web-component 可继续运行
[ ] pnpm build
[ ] pnpm build-dts
[ ] pnpm check
[ ] pnpm test-unit
````

---

# 20. 推荐提交顺序

```bash id="jy7rwf"
# 1. 新增 bundler-plugin 类型和基础工具
git add addons/bundler-plugin/package.json addons/bundler-plugin/src/types.ts addons/bundler-plugin/src/filter.ts addons/bundler-plugin/src/virtual.ts
git commit -m "feat(bundler-plugin): add plugin host core types"

# 2. 抽 transform
git add addons/bundler-plugin/src/transform.ts
git commit -m "feat(bundler-plugin): add Zeus JSX transform"

# 3. Rollup/Rolldown 插件宿主
git add addons/bundler-plugin/src/rollup.ts addons/bundler-plugin/src/index.ts
git commit -m "feat(bundler-plugin): add Rollup compatible plugin host"

# 4. Vite wrapper
git add addons/bundler-plugin/src/vite.ts addons/vite-plugin/src/index.ts
git commit -m "feat(vite-plugin): delegate to bundler plugin host"

# 5. manifest debug output
git add addons/bundler-plugin/src/outputPlugins/manifest.ts
git commit -m "feat(bundler-plugin): add manifest debug output"

# 6. tests
git add addons/bundler-plugin/__tests__
git commit -m "test(bundler-plugin): cover transform and output lifecycle"

# 7. docs
git add docs/internal/design/component-compiler-host-phase3.md
git commit -m "docs: add bundler plugin host phase3 design"
```

---

# 21. Phase 3 完成后的效果

你将拥有一个构建期扩展底座：

```ts id="nxftc3"
import zeus from '@zeus-js/bundler-plugin'
import manifest from '@zeus-js/bundler-plugin/manifest'

export default {
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [
        manifest({
          fileName: 'components.json',
        }),
      ],
    }),
  ],
}
```

它会完成：

```txt id="t2dnx4"
源码 JSX transform
defineElement 组件扫描
ComponentManifest 构建
output plugin 生命周期调度
virtual module 注册
bundle asset/chunk 输出
```

Phase 4 就可以基于这个直接做：

```txt id="ff6tpo"
@zeus-js/output-wc
  - dist/wc/button.js
  - dist/wc/index.js
  - custom-elements.json
  - wc/index.d.ts
```

Phase 6 再做：

```txt id="be0i9j"
@zeus-js/output-react-wrapper
@zeus-js/output-vue-wrapper
```

最终架构会变成：

```txt id="trxzwl"
@zeus-js/compiler
  单文件 JSX 编译

@zeus-js/component-analyzer
  defineElement -> ComponentManifest

@zeus-js/bundler-plugin
  bundler plugin host

@zeus-js/output-*
  多输出插件
```
