# Phase 8：Benchmark & Quality Gates 详细设计与代码草案

Phase 8 不建议继续做新功能，而是补一套 **可量化的性能/体积/构建质量门禁**。

前面 Phase 0–7 已经把链路打通：

```txt
defineElement
  ↓
component-analyzer
  ↓
bundler-plugin
  ↓
output-wc / output-react-wrapper / output-vue-wrapper
  ↓
headless primitives
```

现在最关键的问题变成：

```txt
1. 单组件引入会不会因为 runtime 太大而不划算？
2. 多组件 tree-shaking 是否真的生效？
3. analyzer + compiler 双 parse 开销是否可接受？
4. React/Vue wrapper 比原生 Web Component 多多少开销？
5. headless primitives 的 mount/update/event 性能如何？
6. 后续每次 PR 有没有性能回退？
```

当前仓库已经有 `test:benchs`、`size`、`size:ci` 等脚本基础，可以在这个基础上加 Phase 8。
构建脚本已经会扫描 `packages/*` 和 `addons/*`，也支持按 target 构建，所以 Phase 8 不需要重写现有构建体系。

---

# 1. Phase 8 目标

## 做什么

```txt
1. 新增 component-host benchmark fixture
2. 建立体积 benchmark
3. 建立编译耗时 benchmark
4. 建立浏览器运行时 benchmark
5. 建立 React/Vue wrapper 开销 benchmark
6. 建立 tree-shaking 验证
7. 生成 benchmark JSON report
8. 生成 markdown report
9. 增加 CI threshold gate
10. 为后续优化提供基线数据
```

## 不做什么

```txt
1. 不继续扩展组件能力
2. 不做复杂 UI benchmark
3. 不做真实业务页面 benchmark
4. 不做跨浏览器矩阵
5. 不做 SSR benchmark
6. 不做自动性能优化
```

Phase 8 的产物是 **数据和门禁**，不是新功能。

---

# 2. Phase 8 前置要求

我建议先修完上一轮 review 的 P0：

```txt
P0-1 修 Vue wrapper prop sync 未定义变量
P0-2 修 Vite 插件 ESM require.resolve
P0-3 修 wc/index.d.ts 缺少 import type
```

否则 Phase 8 的 benchmark 会测到错误生成物，数据没有意义。

---

# 3. Benchmark 指标设计

## 3.1 体积指标

需要统计：

```txt
wc 单组件入口：
  dist/wc/z-bench-button.js

wc 全量入口：
  dist/wc/index.js

react 单组件入口：
  dist/react/z-bench-button.js

react 全量入口：
  dist/react/index.js

vue 单组件入口：
  dist/vue/z-bench-button.js

vue 全量入口：
  dist/vue/index.js

runtime 共享成本：
  @zeus-js/signal
  @zeus-js/runtime-dom
  @zeus-js/zeus
```

输出格式：

```json
{
  "size": {
    "wc.single.raw": 12345,
    "wc.single.gzip": 4567,
    "wc.all.raw": 23456,
    "wc.all.gzip": 7890,
    "react.single.raw": 15600,
    "vue.single.raw": 16200
  }
}
```

---

## 3.2 编译耗时指标

需要统计：

```txt
component-analyzer:
  10 components
  100 components
  500 components

bundler-plugin transform:
  10 tsx files
  100 tsx files
  500 tsx files

full build:
  wc only
  wc + react
  wc + vue
  wc + react + vue
```

输出：

```json
{
  "compile": {
    "analyze.100.ms": 120,
    "transform.100.ms": 420,
    "build.wc.ms": 900,
    "build.all.ms": 1450
  }
}
```

---

## 3.3 浏览器运行时指标

需要在真实浏览器里测：

```txt
customElements.define 注册耗时
mount 100 / 1000 个组件耗时
property update 1000 次耗时
attribute update 1000 次耗时
CustomEvent dispatch 1000 次耗时
React wrapper mount/update
Vue wrapper mount/update
```

输出：

```json
{
  "runtime": {
    "wc.mount.1000.ms": 38,
    "wc.propUpdate.1000.ms": 12,
    "wc.event.1000.ms": 8,
    "react.mount.1000.ms": 64,
    "vue.mount.1000.ms": 70
  }
}
```

---

## 3.4 Tree-shaking 指标

需要验证：

```txt
只 import z-bench-button 时：
  不应该出现 z-bench-dialog
  不应该出现 z-bench-tabs
  不应该注册所有组件
```

检查方式：

```txt
1. build 后扫描 bundle 内容
2. 检查是否包含不该出现的 tag name
3. 检查 wc 单组件入口大小
```

---

# 4. 推荐目录结构

```txt
benchmarks/
  component-host/
    package.json
    index.html
    vite.config.ts
    tsconfig.json

    src/
      components/
        bench-button.tsx
        bench-counter.tsx
        bench-card.tsx
        bench-dialog.tsx

      entries/
        wc-single.ts
        wc-all.ts
        react-single.tsx
        react-all.tsx
        vue-single.ts
        vue-all.ts

      runtime/
        wc.ts
        react.tsx
        vue.ts

scripts/
  bench/
    component-host.ts
    component-host-config.ts
    component-host-fixture.ts
    component-host-size.ts
    component-host-compile.ts
    component-host-runtime.ts
    component-host-report.ts
    component-host-threshold.ts
```

为什么放 `benchmarks/` 而不是 `examples/`：

```txt
examples：给用户看用法
benchmarks：给仓库内部做性能门禁
```

---

# 5. 根 package.json 脚本

新增：

```json
{
  "scripts": {
    "bench:component-host": "tsx scripts/bench/component-host.ts",
    "bench:component-host:ci": "tsx scripts/bench/component-host.ts --ci",
    "bench:component-host:size": "tsx scripts/bench/component-host.ts --size-only",
    "bench:component-host:runtime": "tsx scripts/bench/component-host.ts --runtime-only"
  }
}
```

当前根目录已经有 `test:benchs` 和 `size`，Phase 8 新增脚本不会破坏现有命令。

---

# 6. Benchmark fixture 组件

## `bench-button.tsx`

```tsx
// benchmarks/component-host/src/components/bench-button.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface BenchButtonProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
}

export const ZBenchButton = defineElement<BenchButtonProps>(
  'z-bench-button',
  {
    shadow: false,

    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark button component.',
      events: {
        press: {
          detail: {
            nativeEvent: 'MouseEvent',
          },
        },
      },
      slots: {
        default: {
          description: 'Button content.',
        },
      },
      cssParts: ['root'],
    },
  },

  (props, { emit }) => {
    return (
      <Host
        data-slot="bench-button"
        data-variant={props.variant}
        data-disabled={() => (props.disabled ? '' : undefined)}
      >
        <button
          part="root"
          type="button"
          disabled={props.disabled}
          onClick={event => {
            if (props.disabled) return
            emit('press', {
              nativeEvent: event,
            })
          }}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
```

---

## `bench-counter.tsx`

```tsx
// benchmarks/component-host/src/components/bench-counter.tsx

import { defineElement, Host } from '@zeus-js/zeus'

export interface BenchCounterProps {
  count?: number
  label?: string
}

export const ZBenchCounter = defineElement<BenchCounterProps>(
  'z-bench-counter',
  {
    shadow: false,

    props: {
      count: {
        type: Number,
        default: 0,
        reflect: true,
      },
      label: {
        type: String,
        default: 'count',
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark counter component.',
      cssParts: ['root', 'label', 'value'],
    },
  },

  props => {
    return (
      <Host data-slot="bench-counter" data-count={props.count}>
        <span part="root">
          <span part="label">{props.label}</span>
          <span part="value">{props.count}</span>
        </span>
      </Host>
    )
  },
)
```

---

## `bench-card.tsx`

```tsx
// benchmarks/component-host/src/components/bench-card.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface BenchCardProps {
  elevated?: boolean
}

export const ZBenchCard = defineElement<BenchCardProps>(
  'z-bench-card',
  {
    shadow: false,

    props: {
      elevated: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark card component.',
      slots: {
        default: {},
        header: {},
        footer: {},
      },
      cssParts: ['root', 'header', 'body', 'footer'],
    },
  },

  props => {
    return (
      <Host
        data-slot="bench-card"
        data-state={() => (props.elevated ? 'elevated' : 'flat')}
      >
        <section part="root">
          <header part="header">
            <Slot name="header" />
          </header>

          <div part="body">
            <Slot />
          </div>

          <footer part="footer">
            <Slot name="footer" />
          </footer>
        </section>
      </Host>
    )
  },
)
```

---

## `bench-dialog.tsx`

```tsx
// benchmarks/component-host/src/components/bench-dialog.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface BenchDialogProps {
  open?: boolean
}

export const ZBenchDialog = defineElement<BenchDialogProps>(
  'z-bench-dialog',
  {
    shadow: false,

    props: {
      open: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Benchmark dialog component.',
      events: {
        'open-change': {
          detail: {
            open: 'boolean',
          },
        },
      },
      slots: {
        default: {},
      },
      cssParts: ['root', 'panel'],
    },
  },

  props => {
    return (
      <Host
        data-slot="bench-dialog"
        data-state={() => (props.open ? 'open' : 'closed')}
      >
        <div part="root" hidden={!props.open}>
          <div part="panel">
            <Slot />
          </div>
        </div>
      </Host>
    )
  },
)
```

---

# 7. Benchmark fixture 入口

## `wc-single.ts`

```ts
// benchmarks/component-host/src/entries/wc-single.ts

import '../components/bench-button'

export {}
```

---

## `wc-all.ts`

```ts
// benchmarks/component-host/src/entries/wc-all.ts

import '../components/bench-button'
import '../components/bench-counter'
import '../components/bench-card'
import '../components/bench-dialog'

export {}
```

---

## `react-single.tsx`

```tsx
// benchmarks/component-host/src/entries/react-single.tsx

import { ZBenchButton } from 'zeus:react:z-bench-button'

export function App() {
  return (
    <ZBenchButton
      variant="default"
      onPress={() => {
        // noop
      }}
    >
      Button
    </ZBenchButton>
  )
}
```

---

## `vue-single.ts`

```ts
// benchmarks/component-host/src/entries/vue-single.ts

import { ZBenchButton } from 'zeus:vue:z-bench-button'

export { ZBenchButton }
```

---

# 8. benchmark vite config

```ts
// benchmarks/component-host/vite.config.ts

import { defineConfig } from 'vite'
import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'

export default defineConfig({
  plugins: [
    zeus({
      root: __dirname,

      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },

      outputs: [
        wc({
          outDir: 'wc',
          manifestFile: 'zeus.components.json',
          customElementsFile: 'custom-elements.json',
          dts: true,
          jsxDts: true,
        }),

        react({
          outDir: 'react',
          wcOutDir: '../wc',
          dts: true,
        }),

        vue({
          outDir: 'vue',
          wcOutDir: '../wc',
          dts: true,
          globalDts: true,
        }),
      ],
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,

    rollupOptions: {
      input: {
        'wc-single': 'src/entries/wc-single.ts',
        'wc-all': 'src/entries/wc-all.ts',
        'react-single': 'src/entries/react-single.tsx',
        'vue-single': 'src/entries/vue-single.ts',
      },

      external: ['react', 'vue'],
    },
  },
})
```

注意这里全部使用：

```txt
outDir: 'wc'
outDir: 'react'
outDir: 'vue'
```

不要使用 `dist/wc`，否则 Vite 下容易输出成 `dist/dist/wc`。上一轮 review 里这个点已经发现。

---

# 9. Benchmark 配置

## `component-host-config.ts`

```ts
// scripts/bench/component-host-config.ts

import path from 'node:path'

export const componentHostBenchConfig = {
  root: path.resolve('benchmarks/component-host'),
  dist: path.resolve('benchmarks/component-host/dist'),
  reportDir: path.resolve('temp/bench/component-host'),

  thresholds: {
    size: {
      /**
       * 这些值第一版可以放宽，先建立 baseline。
       * 后续稳定后再收紧。
       */
      'wc/z-bench-button.js:gzip': 12 * 1024,
      'wc/index.js:gzip': 28 * 1024,
      'react/z-bench-button.js:gzip': 16 * 1024,
      'vue/z-bench-button.js:gzip': 18 * 1024,
    },

    compile: {
      'analyze.100.ms': 500,
      'transform.100.ms': 1500,
      'build.all.ms': 6000,
    },

    runtime: {
      'wc.mount.1000.ms': 120,
      'wc.propUpdate.1000.ms': 80,
      'wc.event.1000.ms': 80,
    },
  },
} as const
```

---

# 10. 总入口脚本

## `component-host.ts`

```ts
// scripts/bench/component-host.ts

import fs from 'node:fs/promises'
import { parseArgs } from 'node:util'

import { componentHostBenchConfig } from './component-host-config'
import { runComponentHostCompileBench } from './component-host-compile'
import { runComponentHostRuntimeBench } from './component-host-runtime'
import { runComponentHostSizeBench } from './component-host-size'
import { renderMarkdownReport, writeJsonReport } from './component-host-report'
import { checkThresholds } from './component-host-threshold'

const { values } = parseArgs({
  options: {
    ci: {
      type: 'boolean',
    },
    'size-only': {
      type: 'boolean',
    },
    'runtime-only': {
      type: 'boolean',
    },
    'compile-only': {
      type: 'boolean',
    },
  },
})

async function main() {
  await fs.mkdir(componentHostBenchConfig.reportDir, {
    recursive: true,
  })

  const result: Record<string, unknown> = {
    createdAt: new Date().toISOString(),
    git: await readGitInfo(),
  }

  if (!values['runtime-only'] && !values['compile-only']) {
    result.size = await runComponentHostSizeBench()
  }

  if (!values['size-only'] && !values['runtime-only']) {
    result.compile = await runComponentHostCompileBench()
  }

  if (!values['size-only'] && !values['compile-only']) {
    result.runtime = await runComponentHostRuntimeBench()
  }

  await writeJsonReport(result)
  await renderMarkdownReport(result)

  if (values.ci) {
    checkThresholds(result, componentHostBenchConfig.thresholds)
  }
}

async function readGitInfo() {
  const { execFileSync } = await import('node:child_process')

  try {
    return {
      sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
      branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        .toString()
        .trim(),
    }
  } catch {
    return null
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
```

---

# 11. 体积 benchmark

## `component-host-size.ts`

```ts
// scripts/bench/component-host-size.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'

import { componentHostBenchConfig } from './component-host-config'

export interface SizeEntry {
  file: string
  raw: number
  gzip: number
  brotli: number
}

export async function runComponentHostSizeBench(): Promise<SizeEntry[]> {
  buildFixture()

  const files = await collectJsFiles(componentHostBenchConfig.dist)
  const result: SizeEntry[] = []

  for (const file of files) {
    const buffer = await fs.readFile(file)
    const relative = path
      .relative(componentHostBenchConfig.dist, file)
      .replace(/\\/g, '/')

    result.push({
      file: relative,
      raw: buffer.byteLength,
      gzip: gzipSync(buffer).byteLength,
      brotli: brotliCompressSync(buffer).byteLength,
    })
  }

  result.sort((a, b) => a.file.localeCompare(b.file))

  await checkTreeShaking()

  return result
}

function buildFixture(): void {
  const result = spawnSync(
    'pnpm',
    ['-C', componentHostBenchConfig.root, 'build'],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  )

  if (result.status !== 0) {
    throw new Error('component-host fixture build failed')
  }
}

async function collectJsFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    const file = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      result.push(...(await collectJsFiles(file)))
      continue
    }

    if (entry.isFile() && file.endsWith('.js')) {
      result.push(file)
    }
  }

  return result
}

async function checkTreeShaking(): Promise<void> {
  const singleEntry = path.join(
    componentHostBenchConfig.dist,
    'wc',
    'z-bench-button.js',
  )

  const code = await fs.readFile(singleEntry, 'utf-8')

  const forbidden = ['z-bench-dialog', 'z-bench-card', 'z-bench-counter']

  for (const tag of forbidden) {
    if (code.includes(tag)) {
      throw new Error(
        `[tree-shaking] single button entry should not include ${tag}`,
      )
    }
  }
}
```

---

# 12. 编译耗时 benchmark

## `component-host-compile.ts`

```ts
// scripts/bench/component-host-compile.ts

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'

import { analyzeComponents } from '@zeus-js/component-analyzer'
import { transformZeus } from '@zeus-js/bundler-plugin'

import { componentHostBenchConfig } from './component-host-config'

export interface CompileBenchResult {
  name: string
  ms: number
}

export async function runComponentHostCompileBench(): Promise<
  CompileBenchResult[]
> {
  const results: CompileBenchResult[] = []

  for (const count of [10, 100, 500]) {
    const fixture = await createCompileFixture(count)

    results.push({
      name: `analyze.${count}.ms`,
      ms: await measure(() =>
        analyzeComponents({
          root: fixture,
          include: ['src/components/**/*.{ts,tsx}'],
        }),
      ),
    })

    const files = await collectTsxFiles(path.join(fixture, 'src/components'))

    results.push({
      name: `transform.${count}.ms`,
      ms: await measure(async () => {
        for (const file of files) {
          const code = await fs.readFile(file, 'utf-8')

          await transformZeus({
            id: file,
            code,
            sourcemap: false,
          })
        }
      }),
    })
  }

  results.push({
    name: 'build.all.ms',
    ms: measureSyncBuild(),
  })

  return results
}

async function createCompileFixture(count: number): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), `zeus-component-host-${count}-`),
  )

  const componentsDir = path.join(root, 'src/components')
  await fs.mkdir(componentsDir, {
    recursive: true,
  })

  for (let i = 0; i < count; i++) {
    await fs.writeFile(
      path.join(componentsDir, `component-${i}.tsx`),
      createComponentSource(i),
    )
  }

  return root
}

function createComponentSource(index: number): string {
  return `
import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface Bench${index}Props {
  value?: string
  active?: boolean
}

export const ZBench${index} = defineElement<Bench${index}Props>(
  'z-bench-${index}',
  {
    shadow: false,
    props: {
      value: {
        type: String,
        default: 'v${index}',
        reflect: true,
      },
      active: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
    meta: {
      events: {
        change: {
          detail: {
            value: 'string',
          },
        },
      },
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },
  (props, { emit }) => (
    <Host data-state={() => props.active ? 'active' : 'inactive'}>
      <button
        part="root"
        onClick={() => emit('change', { value: props.value })}
      >
        <Slot />
      </button>
    </Host>
  ),
)
`
}

async function collectTsxFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  })

  const files: string[] = []

  for (const entry of entries) {
    const file = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectTsxFiles(file)))
    } else if (file.endsWith('.tsx')) {
      files.push(file)
    }
  }

  return files
}

async function measure(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now()
  await fn()
  return round(performance.now() - start)
}

function measureSyncBuild(): number {
  const start = performance.now()

  const result = spawnSync(
    'pnpm',
    ['-C', componentHostBenchConfig.root, 'build'],
    {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    },
  )

  if (result.status !== 0) {
    throw new Error('component-host build failed')
  }

  return round(performance.now() - start)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
```

> 注意：这里从 `@zeus-js/bundler-plugin` 导出 `transformZeus`，当前包没有导出的话，需要在 `addons/bundler-plugin/src/index.ts` 补一个内部导出或把 benchmark 改成直接从源码路径 import。

---

# 13. 浏览器运行时 benchmark

## `component-host-runtime.ts`

```ts
// scripts/bench/component-host-runtime.ts

import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import puppeteer from 'puppeteer'

import { componentHostBenchConfig } from './component-host-config'

export interface RuntimeBenchResult {
  name: string
  ms: number
}

export async function runComponentHostRuntimeBench(): Promise<
  RuntimeBenchResult[]
> {
  buildFixture()

  const server = await createStaticServer(componentHostBenchConfig.dist)

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    try {
      const page = await browser.newPage()

      await page.goto(`${server.url}/runtime.html`, {
        waitUntil: 'networkidle0',
      })

      const result = await page.evaluate(async () => {
        await customElements.whenDefined('z-bench-counter')
        await customElements.whenDefined('z-bench-button')

        const round = (value: number) => Math.round(value * 100) / 100

        function measure(name: string, fn: () => void) {
          const start = performance.now()
          fn()
          return {
            name,
            ms: round(performance.now() - start),
          }
        }

        const results = []

        results.push(
          measure('wc.mount.1000.ms', () => {
            const root = document.createElement('div')
            document.body.appendChild(root)

            for (let i = 0; i < 1000; i++) {
              const el = document.createElement(
                'z-bench-counter',
              ) as HTMLElement & {
                count: number
              }
              el.count = i
              root.appendChild(el)
            }

            root.remove()
          }),
        )

        const container = document.createElement('div')
        document.body.appendChild(container)

        const items: Array<HTMLElement & { count: number }> = []

        for (let i = 0; i < 1000; i++) {
          const el = document.createElement(
            'z-bench-counter',
          ) as HTMLElement & {
            count: number
          }
          container.appendChild(el)
          items.push(el)
        }

        results.push(
          measure('wc.propUpdate.1000.ms', () => {
            for (let i = 0; i < items.length; i++) {
              items[i].count = i + 1
            }
          }),
        )

        results.push(
          measure('wc.attributeUpdate.1000.ms', () => {
            for (let i = 0; i < items.length; i++) {
              items[i].setAttribute('count', String(i + 2))
            }
          }),
        )

        const button = document.createElement('z-bench-button')
        document.body.appendChild(button)

        let eventCount = 0
        button.addEventListener('press', () => {
          eventCount += 1
        })

        results.push(
          measure('wc.event.1000.ms', () => {
            for (let i = 0; i < 1000; i++) {
              button.dispatchEvent(
                new CustomEvent('press', {
                  detail: {
                    nativeEvent: null,
                  },
                  bubbles: true,
                  composed: true,
                }),
              )
            }
          }),
        )

        if (eventCount !== 1000) {
          throw new Error(`Expected 1000 events, got ${eventCount}`)
        }

        container.remove()
        button.remove()

        return results
      })

      return result
    } finally {
      await browser.close()
    }
  } finally {
    await server.close()
  }
}

function buildFixture(): void {
  const result = spawnSync(
    'pnpm',
    ['-C', componentHostBenchConfig.root, 'build'],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  )

  if (result.status !== 0) {
    throw new Error('component-host fixture build failed')
  }
}

async function createStaticServer(root: string): Promise<{
  url: string
  close: () => Promise<void>
}> {
  await fs.writeFile(
    path.join(root, 'runtime.html'),
    `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script type="module" src="/wc/z-bench-button.js"></script>
    <script type="module" src="/wc/z-bench-counter.js"></script>
  </head>
  <body></body>
</html>
`,
  )

  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(req.url?.split('?')[0] ?? '/')
    const file = path.join(root, pathname === '/' ? 'runtime.html' : pathname)

    try {
      const content = await fs.readFile(file)
      res.writeHead(200, {
        'content-type': contentType(file),
      })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()

  if (!address || typeof address === 'string') {
    throw new Error('Failed to start static server')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

function contentType(file: string): string {
  if (file.endsWith('.html')) return 'text/html'
  if (file.endsWith('.js')) return 'text/javascript'
  if (file.endsWith('.css')) return 'text/css'
  return 'application/octet-stream'
}
```

---

# 14. Report 输出

## `component-host-report.ts`

```ts
// scripts/bench/component-host-report.ts

import fs from 'node:fs/promises'
import path from 'node:path'

import { componentHostBenchConfig } from './component-host-config'

export async function writeJsonReport(result: Record<string, unknown>) {
  await fs.writeFile(
    path.join(componentHostBenchConfig.reportDir, 'report.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  )
}

export async function renderMarkdownReport(result: Record<string, unknown>) {
  const lines: string[] = []

  lines.push('# Zeus Component Host Benchmark')
  lines.push('')
  lines.push(`Created at: ${(result as any).createdAt}`)
  lines.push('')

  if (result.size) {
    lines.push('## Size')
    lines.push('')
    lines.push('| File | Raw | Gzip | Brotli |')
    lines.push('|---|---:|---:|---:|')

    for (const item of result.size as any[]) {
      lines.push(
        `| ${item.file} | ${formatBytes(item.raw)} | ${formatBytes(item.gzip)} | ${formatBytes(item.brotli)} |`,
      )
    }

    lines.push('')
  }

  if (result.compile) {
    lines.push('## Compile')
    lines.push('')
    lines.push('| Metric | Time |')
    lines.push('|---|---:|')

    for (const item of result.compile as any[]) {
      lines.push(`| ${item.name} | ${item.ms}ms |`)
    }

    lines.push('')
  }

  if (result.runtime) {
    lines.push('## Runtime')
    lines.push('')
    lines.push('| Metric | Time |')
    lines.push('|---|---:|')

    for (const item of result.runtime as any[]) {
      lines.push(`| ${item.name} | ${item.ms}ms |`)
    }

    lines.push('')
  }

  await fs.writeFile(
    path.join(componentHostBenchConfig.reportDir, 'report.md'),
    `${lines.join('\n')}\n`,
  )
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  return `${Math.round((value / 1024) * 100) / 100} KB`
}
```

---

# 15. Threshold 门禁

## `component-host-threshold.ts`

```ts
// scripts/bench/component-host-threshold.ts

import type { componentHostBenchConfig } from './component-host-config'

type Thresholds = typeof componentHostBenchConfig.thresholds

export function checkThresholds(
  result: Record<string, unknown>,
  thresholds: Thresholds,
): void {
  const errors: string[] = []

  checkSize(result, thresholds.size, errors)
  checkTimeGroup(result.compile, thresholds.compile, errors)
  checkTimeGroup(result.runtime, thresholds.runtime, errors)

  if (errors.length) {
    console.error('\nBenchmark threshold failed:\n')

    for (const error of errors) {
      console.error(`  - ${error}`)
    }

    console.error('')
    process.exit(1)
  }
}

function checkSize(
  result: Record<string, unknown>,
  thresholds: Record<string, number>,
  errors: string[],
): void {
  const size = result.size as
    | Array<{
        file: string
        raw: number
        gzip: number
        brotli: number
      }>
    | undefined

  if (!size) return

  for (const [key, limit] of Object.entries(thresholds)) {
    const [file, metric] = key.split(':') as [string, 'raw' | 'gzip' | 'brotli']

    const entry = size.find(item => item.file === file)
    if (!entry) continue

    const value = entry[metric]

    if (value > limit) {
      errors.push(`${key} is ${value} bytes, exceeds limit ${limit} bytes`)
    }
  }
}

function checkTimeGroup(
  group: unknown,
  thresholds: Record<string, number>,
  errors: string[],
): void {
  const list = group as
    | Array<{
        name: string
        ms: number
      }>
    | undefined

  if (!list) return

  for (const [name, limit] of Object.entries(thresholds)) {
    const entry = list.find(item => item.name === name)
    if (!entry) continue

    if (entry.ms > limit) {
      errors.push(`${name} is ${entry.ms}ms, exceeds limit ${limit}ms`)
    }
  }
}
```

---

# 16. CI 集成建议

新增 workflow：

```yaml
# .github/workflows/component-host-bench.yml

name: Component Host Bench

on:
  pull_request:
    paths:
      - 'packages/runtime-dom/**'
      - 'packages/compiler/**'
      - 'packages/headless/**'
      - 'addons/component-analyzer/**'
      - 'addons/bundler-plugin/**'
      - 'addons/output-*/**'
      - 'addons/component-dts/**'
      - 'scripts/bench/**'
      - 'benchmarks/component-host/**'

jobs:
  bench:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - run: pnpm bench:component-host:ci

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: component-host-benchmark
          path: temp/bench/component-host
```

---

# 17. Benchmark 输出示例

最终会生成：

```txt
temp/bench/component-host/
  report.json
  report.md
```

`report.md` 示例：

```md
# Zeus Component Host Benchmark

## Size

| File                    |     Raw |    Gzip |  Brotli |
| ----------------------- | ------: | ------: | ------: |
| wc/z-bench-button.js    | 18.2 KB |  6.1 KB |  5.4 KB |
| wc/index.js             | 35.8 KB | 11.9 KB | 10.2 KB |
| react/z-bench-button.js | 22.4 KB |  7.3 KB |  6.5 KB |
| vue/z-bench-button.js   | 24.1 KB |  7.8 KB |  6.9 KB |

## Compile

| Metric           |   Time |
| ---------------- | -----: |
| analyze.100.ms   |  120ms |
| transform.100.ms |  680ms |
| build.all.ms     | 1800ms |

## Runtime

| Metric                | Time |
| --------------------- | ---: |
| wc.mount.1000.ms      | 42ms |
| wc.propUpdate.1000.ms | 16ms |
| wc.event.1000.ms      |  9ms |
```

---

# 18. Phase 8 验收标准

```txt
[ ] 新增 benchmarks/component-host
[ ] 新增 scripts/bench/component-host.ts
[ ] 支持 size benchmark
[ ] 支持 compile benchmark
[ ] 支持 browser runtime benchmark
[ ] 支持 tree-shaking 检查
[ ] 输出 report.json
[ ] 输出 report.md
[ ] 支持 --ci threshold gate
[ ] 支持 --size-only / --compile-only / --runtime-only
[ ] CI 上传 benchmark artifact
[ ] pnpm bench:component-host 可本地运行
[ ] pnpm bench:component-host:ci 可作为门禁
```

---

# 19. 推荐提交顺序

```bash
# 1. benchmark fixture
git add benchmarks/component-host
git commit -m "bench(component-host): add benchmark fixture"

# 2. size benchmark
git add scripts/bench/component-host.ts scripts/bench/component-host-config.ts scripts/bench/component-host-size.ts
git commit -m "bench(component-host): add size benchmark"

# 3. compile benchmark
git add scripts/bench/component-host-compile.ts
git commit -m "bench(component-host): add compile benchmark"

# 4. runtime benchmark
git add scripts/bench/component-host-runtime.ts
git commit -m "bench(component-host): add browser runtime benchmark"

# 5. reports and thresholds
git add scripts/bench/component-host-report.ts scripts/bench/component-host-threshold.ts package.json
git commit -m "bench(component-host): add reports and thresholds"

# 6. CI
git add .github/workflows/component-host-bench.yml
git commit -m "ci: add component host benchmark workflow"
```

---

# 20. Phase 8 完成后的价值

Phase 8 完成后，你就能回答之前那几个关键问题：

```txt
只使用一个组件，runtime 体积是否过大？
  -> 看 wc/z-bench-button.js gzip

React/Vue wrapper 开销有多少？
  -> 对比 wc single / react single / vue single

tree-shaking 是否有效？
  -> single entry 不应该包含其他 tag

analyzer + compiler 双 parse 是否有明显影响？
  -> 看 analyze.100.ms / transform.100.ms / build.all.ms

headless primitive 运行时是否够快？
  -> 看 mount/update/event benchmark

后续优化有没有退化？
  -> CI threshold gate
```

这个阶段之后，Zeus 的 component compiler host 就不只是“能跑”，而是开始进入 **可度量、可回归检测、可发版评估** 的状态。
