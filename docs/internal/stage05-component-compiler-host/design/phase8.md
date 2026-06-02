# Phase 8：Benchmark & Quality Gates 详细设计与代码草案

Phase 8 重新定义为：

```txt
Benchmark & Quality Gates

目标不是继续堆功能，而是给 Phase 0–7 的 compiler-host 链路建立：
1. 体积基线
2. 构建耗时基线
3. Tree-shaking 验证
4. 浏览器运行时性能基线
5. 后续 CI 性能门禁
```

当前分支已经适合开启 Phase 8：`packages/web-c/*` 已经被纳入 workspace，`component-analyzer / component-dts / bundler-plugin / output-*` 都在这个目录下；`pnpm-workspace.yaml` 已经包含 `packages/web-c/*`，但还没有 `benchmarks/*`。
根脚本目前只有 `test:benchs`、`size`、`size:ci`，还没有 `bench:component-host` 入口，所以 Phase 8 第一件事是补 benchmark scaffold。

---

# 1. Phase 8 分阶段目标

## Phase 8.0：Benchmark Scaffold

```txt
[ ] 新增 benchmarks/component-host
[ ] pnpm-workspace.yaml 增加 benchmarks/*
[ ] 新增 scripts/bench/component-host.ts
[ ] 根 package.json 增加 bench:component-host
[ ] 能输出空 report.json / report.md
```

## Phase 8.1：Size + Tree-shaking Benchmark

```txt
[ ] 构建 wc/react/vue 输出
[ ] 统计 raw/gzip/brotli
[ ] 校验单组件入口不包含其他组件 tag
[ ] 输出 size report
```

## Phase 8.2：Compile Benchmark

```txt
[ ] 测 component-analyzer 扫描耗时
[ ] 测 wc only build
[ ] 测 wc + react build
[ ] 测 wc + vue build
[ ] 测 wc + react + vue build
```

## Phase 8.3：Runtime Benchmark

```txt
[ ] Puppeteer 启动真实浏览器
[ ] 测 wc mount/update/event
[ ] 后续扩展 React/Vue wrapper mount/update
```

## Phase 8.4：CI Quality Gate

```txt
[ ] 输出 JSON / Markdown artifact
[ ] 配置 threshold
[ ] CI 中跑 bench:component-host:ci
[ ] 初期 threshold 宽松，稳定后逐步收紧
```

---

# 2. 目录结构

```txt
benchmarks/
  component-host/
    package.json
    tsconfig.json
    vite.config.ts
    index.html

    src/
      components/
        bench-button.tsx
        bench-counter.tsx
        bench-card.tsx
        bench-dialog.tsx

      entries/
        wc-single.ts
        wc-all.ts
        react-single.ts
        react-all.ts
        vue-single.ts
        vue-all.ts

scripts/
  bench/
    component-host.ts
    component-host-config.ts
    component-host-build.ts
    component-host-size.ts
    component-host-compile.ts
    component-host-runtime.ts
    component-host-report.ts
    component-host-threshold.ts
```

---

# 3. Workspace 与根脚本修改

## `pnpm-workspace.yaml`

当前 workspace 还没有 `benchmarks/*`。建议加上：

```yaml
packages:
  - 'packages/core/*'
  - 'packages/devtools/*'
  - 'packages/web-c/*'
  - 'packages/headless'
  - 'examples/*'
  - 'benchmarks/*'
  - 'docs'
```

## 根 `package.json`

新增脚本：

```json
{
  "scripts": {
    "bench:component-host": "tsx scripts/bench/component-host.ts",
    "bench:component-host:ci": "tsx scripts/bench/component-host.ts --ci",
    "bench:component-host:size": "tsx scripts/bench/component-host.ts --size-only",
    "bench:component-host:compile": "tsx scripts/bench/component-host.ts --compile-only",
    "bench:component-host:runtime": "tsx scripts/bench/component-host.ts --runtime-only"
  }
}
```

根依赖里已经有 `puppeteer`，Phase 8.3 可以直接使用。

---

# 4. Benchmark Fixture

## `benchmarks/component-host/package.json`

```json
{
  "name": "@zeus-bench/component-host",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@zeus-js/zeus": "workspace:*",
    "@zeus-js/runtime-dom": "workspace:*"
  },
  "devDependencies": {
    "@zeus-js/bundler-plugin": "workspace:*",
    "@zeus-js/output-wc": "workspace:*",
    "@zeus-js/output-react-wrapper": "workspace:*",
    "@zeus-js/output-vue-wrapper": "workspace:*",
    "vite": "catalog:",
    "typescript": "^6.0.3"
  }
}
```

---

## `benchmarks/component-host/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "types": ["vite/client"],
    "jsx": "preserve",
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

---

## `benchmarks/component-host/vite.config.ts`

这里要支持多种构建模式：

```txt
ZEUS_BENCH_OUTPUTS=wc
ZEUS_BENCH_OUTPUTS=wc-react
ZEUS_BENCH_OUTPUTS=wc-vue
ZEUS_BENCH_OUTPUTS=all
```

React/Vue wrapper 现在 import 的是 `zeus:wc:${tag}` 虚拟模块，而不是相对路径，所以 benchmark 里不需要依赖 `wcOutDir`。React/Vue wrapper 当前就是这样生成 `zeus:wc` 导入的。

```ts
// benchmarks/component-host/vite.config.ts

import { defineConfig } from 'vite'

import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'

const mode = process.env.ZEUS_BENCH_OUTPUTS ?? 'all'

const useReact = mode === 'wc-react' || mode === 'all'
const useVue = mode === 'wc-vue' || mode === 'all'

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

        ...(useReact
          ? [
              react({
                outDir: 'react',
                dts: true,
                namedSlots: 'props',
              }),
            ]
          : []),

        ...(useVue
          ? [
              vue({
                outDir: 'vue',
                dts: true,
                globalDts: true,
              }),
            ]
          : []),
      ],
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,

    rollupOptions: {
      input: createInput(),
      external: ['react', 'vue'],
    },
  },
})

function createInput(): Record<string, string> {
  const input: Record<string, string> = {
    'wc-single': 'src/entries/wc-single.ts',
    'wc-all': 'src/entries/wc-all.ts',
  }

  if (useReact) {
    input['react-single'] = 'src/entries/react-single.ts'
    input['react-all'] = 'src/entries/react-all.ts'
  }

  if (useVue) {
    input['vue-single'] = 'src/entries/vue-single.ts'
    input['vue-all'] = 'src/entries/vue-all.ts'
  }

  return input
}
```

---

# 5. Benchmark 组件

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
    const onClick = (event: MouseEvent) => {
      if (props.disabled) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      emit('press', {
        nativeEvent: event,
      })
    }

    return (
      <Host
        data-slot="bench-button"
        data-variant={props.variant}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button
          part="root"
          type="button"
          disabled={props.disabled}
          onClick={onClick}
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
    const state = props.elevated ? 'elevated' : 'flat'

    return (
      <Host data-slot="bench-card" data-state={state}>
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
        data-state={props.open ? 'open' : 'closed'}
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

# 6. Benchmark entries

## `wc-single.ts`

```ts
// benchmarks/component-host/src/entries/wc-single.ts

import '../components/bench-button'

export {}
```

## `wc-all.ts`

```ts
// benchmarks/component-host/src/entries/wc-all.ts

import '../components/bench-button'
import '../components/bench-counter'
import '../components/bench-card'
import '../components/bench-dialog'

export {}
```

## `react-single.ts`

```ts
// benchmarks/component-host/src/entries/react-single.ts

export { ZBenchButton } from 'zeus:react:z-bench-button'
```

## `react-all.ts`

```ts
// benchmarks/component-host/src/entries/react-all.ts

export { ZBenchButton } from 'zeus:react:z-bench-button'
export { ZBenchCounter } from 'zeus:react:z-bench-counter'
export { ZBenchCard } from 'zeus:react:z-bench-card'
export { ZBenchDialog } from 'zeus:react:z-bench-dialog'
```

## `vue-single.ts`

```ts
// benchmarks/component-host/src/entries/vue-single.ts

export { ZBenchButton } from 'zeus:vue:z-bench-button'
```

## `vue-all.ts`

```ts
// benchmarks/component-host/src/entries/vue-all.ts

export { ZBenchButton } from 'zeus:vue:z-bench-button'
export { ZBenchCounter } from 'zeus:vue:z-bench-counter'
export { ZBenchCard } from 'zeus:vue:z-bench-card'
export { ZBenchDialog } from 'zeus:vue:z-bench-dialog'
```

---

# 7. Bench config

## `scripts/bench/component-host-config.ts`

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
       * 第一版 threshold 先放宽，只用于防止明显回退。
       * 等几轮 CI 数据稳定后再收紧。
       */
      'wc/z-bench-button.js:gzip': 16 * 1024,
      'wc/index.js:gzip': 36 * 1024,
      'react/z-bench-button.js:gzip': 24 * 1024,
      'vue/z-bench-button.js:gzip': 28 * 1024,
    },

    compile: {
      'build.wc.ms': 8000,
      'build.wc-react.ms': 10000,
      'build.wc-vue.ms': 10000,
      'build.all.ms': 12000,
      'analyze.components.ms': 1000,
    },

    runtime: {
      'wc.mount.1000.ms': 200,
      'wc.propUpdate.1000.ms': 120,
      'wc.attributeUpdate.1000.ms': 160,
      'wc.event.1000.ms': 120,
    },
  },
} as const

export type ComponentHostBenchThresholds =
  typeof componentHostBenchConfig.thresholds
```

---

# 8. Build helper

## `scripts/bench/component-host-build.ts`

```ts
// scripts/bench/component-host-build.ts

import { spawnSync } from 'node:child_process'

import { componentHostBenchConfig } from './component-host-config'

export type ComponentHostBuildMode = 'wc' | 'wc-react' | 'wc-vue' | 'all'

export function buildComponentHostFixture(mode: ComponentHostBuildMode): void {
  const result = spawnSync(
    'pnpm',
    ['-C', componentHostBenchConfig.root, 'build'],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ZEUS_BENCH_OUTPUTS: mode,
      },
    },
  )

  if (result.status !== 0) {
    throw new Error(`component-host fixture build failed: ${mode}`)
  }
}
```

---

# 9. 主入口脚本

## `scripts/bench/component-host.ts`

```ts
// scripts/bench/component-host.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { componentHostBenchConfig } from './component-host-config'
import { runComponentHostCompileBench } from './component-host-compile'
import { runComponentHostRuntimeBench } from './component-host-runtime'
import { runComponentHostSizeBench } from './component-host-size'
import { renderMarkdownReport, writeJsonReport } from './component-host-report'
import { checkThresholds } from './component-host-threshold'

async function main() {
  const { values } = parseArgs({
    options: {
      ci: {
        type: 'boolean',
        default: false,
      },
      'size-only': {
        type: 'boolean',
        default: false,
      },
      'compile-only': {
        type: 'boolean',
        default: false,
      },
      'runtime-only': {
        type: 'boolean',
        default: false,
      },
    },
  })

  await fs.rm(componentHostBenchConfig.reportDir, {
    recursive: true,
    force: true,
  })

  await fs.mkdir(componentHostBenchConfig.reportDir, {
    recursive: true,
  })

  const report: Record<string, unknown> = {
    name: 'component-host',
    createdAt: new Date().toISOString(),
    git: readGitInfo(),
  }

  const onlySize = values['size-only']
  const onlyCompile = values['compile-only']
  const onlyRuntime = values['runtime-only']

  if (!onlyCompile && !onlyRuntime) {
    report.size = await runComponentHostSizeBench()
  }

  if (!onlySize && !onlyRuntime) {
    report.compile = await runComponentHostCompileBench()
  }

  if (!onlySize && !onlyCompile) {
    report.runtime = await runComponentHostRuntimeBench()
  }

  await writeJsonReport(report)
  await renderMarkdownReport(report)

  if (values.ci) {
    checkThresholds(report, componentHostBenchConfig.thresholds)
  }

  console.log(
    `\nBenchmark report written to ${path.relative(
      process.cwd(),
      componentHostBenchConfig.reportDir,
    )}\n`,
  )
}

function readGitInfo() {
  try {
    const { execFileSync } =
      require('node:child_process') as typeof import('node:child_process')

    return {
      branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        .toString()
        .trim(),
      sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
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

> 如果你不想在 ESM 里用 `require`，这里可以改成 `await import('node:child_process')`。这个脚本只是 bench 内部工具，建议也按 ESM 写法保持一致。

---

# 10. Size benchmark

## `scripts/bench/component-host-size.ts`

```ts
// scripts/bench/component-host-size.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { buildComponentHostFixture } from './component-host-build'
import { componentHostBenchConfig } from './component-host-config'

export interface SizeBenchEntry {
  file: string
  raw: number
  gzip: number
  brotli: number
}

export async function runComponentHostSizeBench(): Promise<SizeBenchEntry[]> {
  buildComponentHostFixture('all')

  const files = await collectFiles(
    componentHostBenchConfig.dist,
    file => file.endsWith('.js') || file.endsWith('.css'),
  )

  const result: SizeBenchEntry[] = []

  for (const file of files) {
    const source = await fs.readFile(file)
    const relative = path
      .relative(componentHostBenchConfig.dist, file)
      .replace(/\\/g, '/')

    result.push({
      file: relative,
      raw: source.byteLength,
      gzip: gzipSync(source).byteLength,
      brotli: brotliCompressSync(source).byteLength,
    })
  }

  result.sort((a, b) => a.file.localeCompare(b.file))

  await checkTreeShaking()

  return result
}

async function checkTreeShaking(): Promise<void> {
  const checks = [
    {
      file: 'wc/z-bench-button.js',
      forbidden: ['z-bench-counter', 'z-bench-card', 'z-bench-dialog'],
    },
    {
      file: 'react/z-bench-button.js',
      forbidden: ['z-bench-counter', 'z-bench-card', 'z-bench-dialog'],
    },
    {
      file: 'vue/z-bench-button.js',
      forbidden: ['z-bench-counter', 'z-bench-card', 'z-bench-dialog'],
    },
  ]

  for (const check of checks) {
    const file = path.join(componentHostBenchConfig.dist, check.file)

    try {
      const code = await fs.readFile(file, 'utf-8')

      for (const tag of check.forbidden) {
        if (code.includes(tag)) {
          throw new Error(
            `[tree-shaking] ${check.file} should not include ${tag}`,
          )
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`[tree-shaking] missing file: ${check.file}`)
      }

      throw error
    }
  }
}

async function collectFiles(
  dir: string,
  filter: (file: string) => boolean,
): Promise<string[]> {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  })

  const files: string[] = []

  for (const entry of entries) {
    const file = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(file, filter)))
    } else if (entry.isFile() && filter(file)) {
      files.push(file)
    }
  }

  return files
}
```

---

# 11. Compile benchmark

## `scripts/bench/component-host-compile.ts`

这里不直接使用 `transformZeus`，因为当前 `@zeus-js/bundler-plugin` 主入口还没有导出它；主入口只导出了 `createZeusPlugin` 和类型。
所以 Phase 8.2 先测完整 build + analyzer，不把内部 transform API 暴露出去。

```ts
// scripts/bench/component-host-compile.ts

import { performance } from 'node:perf_hooks'

import { analyzeComponents } from '@zeus-js/component-analyzer'

import {
  buildComponentHostFixture,
  type ComponentHostBuildMode,
} from './component-host-build'
import { componentHostBenchConfig } from './component-host-config'

export interface CompileBenchEntry {
  name: string
  ms: number
}

export async function runComponentHostCompileBench(): Promise<
  CompileBenchEntry[]
> {
  const result: CompileBenchEntry[] = []

  result.push({
    name: 'analyze.components.ms',
    ms: await measureAsync(async () => {
      await analyzeComponents({
        root: componentHostBenchConfig.root,
        include: ['src/components/**/*.{ts,tsx}'],
      })
    }),
  })

  for (const mode of ['wc', 'wc-react', 'wc-vue', 'all'] as const) {
    result.push({
      name: `build.${mode}.ms`,
      ms: measureSyncBuild(mode),
    })
  }

  return result
}

async function measureAsync(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now()
  await fn()
  return round(performance.now() - start)
}

function measureSyncBuild(mode: ComponentHostBuildMode): number {
  const start = performance.now()
  buildComponentHostFixture(mode)
  return round(performance.now() - start)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
```

---

# 12. Runtime benchmark

第一版只测 Web Component，不急着测 React/Vue wrapper。React/Vue mount benchmark 会引入更多变量，建议 Phase 8.3.1 再做。

## `scripts/bench/component-host-runtime.ts`

```ts
// scripts/bench/component-host-runtime.ts

import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import puppeteer from 'puppeteer'

import { buildComponentHostFixture } from './component-host-build'
import { componentHostBenchConfig } from './component-host-config'

export interface RuntimeBenchEntry {
  name: string
  ms: number
}

export async function runComponentHostRuntimeBench(): Promise<
  RuntimeBenchEntry[]
> {
  buildComponentHostFixture('wc')

  await writeRuntimeHtml()

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

      return await page.evaluate(async () => {
        await customElements.whenDefined('z-bench-button')
        await customElements.whenDefined('z-bench-counter')

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

        const counters: Array<HTMLElement & { count: number }> = []

        for (let i = 0; i < 1000; i++) {
          const el = document.createElement(
            'z-bench-counter',
          ) as HTMLElement & {
            count: number
          }

          container.appendChild(el)
          counters.push(el)
        }

        results.push(
          measure('wc.propUpdate.1000.ms', () => {
            for (let i = 0; i < counters.length; i++) {
              counters[i].count = i + 1
            }
          }),
        )

        results.push(
          measure('wc.attributeUpdate.1000.ms', () => {
            for (let i = 0; i < counters.length; i++) {
              counters[i].setAttribute('count', String(i + 2))
            }
          }),
        )

        const button = document.createElement('z-bench-button')
        document.body.appendChild(button)

        let called = 0

        button.addEventListener('press', () => {
          called += 1
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

        if (called !== 1000) {
          throw new Error(`Expected 1000 events, got ${called}`)
        }

        container.remove()
        button.remove()

        return results
      })
    } finally {
      await browser.close()
    }
  } finally {
    await server.close()
  }
}

async function writeRuntimeHtml(): Promise<void> {
  await fs.writeFile(
    path.join(componentHostBenchConfig.dist, 'runtime.html'),
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
}

async function createStaticServer(root: string): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(req.url?.split('?')[0] ?? '/')
    const safePath = pathname === '/' ? '/runtime.html' : pathname
    const file = path.join(root, safePath)

    try {
      const content = await fs.readFile(file)

      res.writeHead(200, {
        'content-type': getContentType(file),
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

function getContentType(file: string): string {
  if (file.endsWith('.html')) return 'text/html'
  if (file.endsWith('.js')) return 'text/javascript'
  if (file.endsWith('.css')) return 'text/css'

  return 'application/octet-stream'
}
```

---

# 13. Report 生成

## `scripts/bench/component-host-report.ts`

```ts
// scripts/bench/component-host-report.ts

import fs from 'node:fs/promises'
import path from 'node:path'

import { componentHostBenchConfig } from './component-host-config'

export async function writeJsonReport(report: Record<string, unknown>) {
  await fs.writeFile(
    path.join(componentHostBenchConfig.reportDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}

export async function renderMarkdownReport(report: Record<string, unknown>) {
  const lines: string[] = []

  lines.push('# Zeus Component Host Benchmark')
  lines.push('')
  lines.push(`Created at: ${(report as any).createdAt}`)
  lines.push('')

  if (report.git) {
    lines.push(`Branch: ${(report as any).git.branch}`)
    lines.push(`Commit: ${(report as any).git.sha}`)
    lines.push('')
  }

  if (Array.isArray(report.size)) {
    lines.push('## Size')
    lines.push('')
    lines.push('| File | Raw | Gzip | Brotli |')
    lines.push('|---|---:|---:|---:|')

    for (const item of report.size as any[]) {
      lines.push(
        `| ${item.file} | ${formatBytes(item.raw)} | ${formatBytes(
          item.gzip,
        )} | ${formatBytes(item.brotli)} |`,
      )
    }

    lines.push('')
  }

  if (Array.isArray(report.compile)) {
    lines.push('## Compile')
    lines.push('')
    lines.push('| Metric | Time |')
    lines.push('|---|---:|')

    for (const item of report.compile as any[]) {
      lines.push(`| ${item.name} | ${item.ms}ms |`)
    }

    lines.push('')
  }

  if (Array.isArray(report.runtime)) {
    lines.push('## Runtime')
    lines.push('')
    lines.push('| Metric | Time |')
    lines.push('|---|---:|')

    for (const item of report.runtime as any[]) {
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

# 14. Threshold gate

## `scripts/bench/component-host-threshold.ts`

```ts
// scripts/bench/component-host-threshold.ts

import type { ComponentHostBenchThresholds } from './component-host-config'

export function checkThresholds(
  report: Record<string, unknown>,
  thresholds: ComponentHostBenchThresholds,
): void {
  const errors: string[] = []

  checkSize(report.size, thresholds.size, errors)
  checkMetricList(report.compile, thresholds.compile, errors)
  checkMetricList(report.runtime, thresholds.runtime, errors)

  if (errors.length) {
    console.error('\nComponent host benchmark threshold failed:\n')

    for (const error of errors) {
      console.error(`  - ${error}`)
    }

    console.error('')

    process.exit(1)
  }
}

function checkSize(
  value: unknown,
  thresholds: Record<string, number>,
  errors: string[],
): void {
  if (!Array.isArray(value)) return

  for (const [key, limit] of Object.entries(thresholds)) {
    const [file, metric] = key.split(':') as [string, 'raw' | 'gzip' | 'brotli']

    const entry = value.find(item => item.file === file)
    if (!entry) continue

    const actual = entry[metric]

    if (typeof actual === 'number' && actual > limit) {
      errors.push(`${key} = ${actual} bytes, limit = ${limit} bytes`)
    }
  }
}

function checkMetricList(
  value: unknown,
  thresholds: Record<string, number>,
  errors: string[],
): void {
  if (!Array.isArray(value)) return

  for (const [name, limit] of Object.entries(thresholds)) {
    const entry = value.find(item => item.name === name)
    if (!entry) continue

    if (typeof entry.ms === 'number' && entry.ms > limit) {
      errors.push(`${name} = ${entry.ms}ms, limit = ${limit}ms`)
    }
  }
}
```

---

# 15. CI workflow 草案

第一版建议先上传 artifact，不要卡太死。等跑出 3–5 次稳定数据，再正式收紧 threshold。

```yaml
# .github/workflows/component-host-bench.yml

name: Component Host Bench

on:
  pull_request:
    paths:
      - 'packages/core/**'
      - 'packages/web-c/**'
      - 'packages/headless/**'
      - 'benchmarks/component-host/**'
      - 'scripts/bench/**'
      - 'pnpm-workspace.yaml'
      - 'package.json'

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

# 16. 输出报告示例

最终生成：

```txt
temp/bench/component-host/
  report.json
  report.md
```

`report.md` 示例：

```md
# Zeus Component Host Benchmark

Created at: 2026-06-01T00:00:00.000Z

## Size

| File                    |     Raw |    Gzip |  Brotli |
| ----------------------- | ------: | ------: | ------: |
| wc/z-bench-button.js    | 18.2 KB |  6.4 KB |  5.8 KB |
| wc/index.js             | 39.1 KB | 13.2 KB | 11.7 KB |
| react/z-bench-button.js | 22.7 KB |  7.5 KB |  6.8 KB |
| vue/z-bench-button.js   | 24.8 KB |  8.1 KB |  7.2 KB |

## Compile

| Metric                |     Time |
| --------------------- | -------: |
| analyze.components.ms |   42.3ms |
| build.wc.ms           | 1230.5ms |
| build.wc-react.ms     | 1540.2ms |
| build.wc-vue.ms       | 1622.4ms |
| build.all.ms          | 1900.8ms |

## Runtime

| Metric                     |   Time |
| -------------------------- | -----: |
| wc.mount.1000.ms           | 48.2ms |
| wc.propUpdate.1000.ms      | 16.7ms |
| wc.attributeUpdate.1000.ms | 31.5ms |
| wc.event.1000.ms           |  9.2ms |
```

---

# 17. Phase 8 验收清单

```txt
[ ] pnpm-workspace.yaml 增加 benchmarks/*
[ ] 新增 benchmarks/component-host/package.json
[ ] 新增 benchmark fixture components
[ ] 新增 wc/react/vue entries
[ ] 新增 vite.config.ts，支持 ZEUS_BENCH_OUTPUTS
[ ] 新增 scripts/bench/component-host.ts
[ ] 新增 size benchmark
[ ] 新增 tree-shaking 检查
[ ] 新增 compile benchmark
[ ] 新增 wc runtime benchmark
[ ] 输出 report.json
[ ] 输出 report.md
[ ] 支持 --ci threshold gate
[ ] 根 package.json 增加 bench 脚本
[ ] CI 上传 benchmark artifact
```

---

# 18. 推荐提交顺序

```bash
# 1. benchmark workspace + fixture
git add pnpm-workspace.yaml benchmarks/component-host
git commit -m "bench(component-host): add benchmark fixture"

# 2. benchmark scaffold
git add package.json scripts/bench/component-host.ts scripts/bench/component-host-config.ts scripts/bench/component-host-report.ts
git commit -m "bench(component-host): add benchmark scaffold"

# 3. size + tree-shaking
git add scripts/bench/component-host-build.ts scripts/bench/component-host-size.ts
git commit -m "bench(component-host): add size and tree-shaking checks"

# 4. compile benchmark
git add scripts/bench/component-host-compile.ts
git commit -m "bench(component-host): add compile benchmark"

# 5. runtime benchmark
git add scripts/bench/component-host-runtime.ts
git commit -m "bench(component-host): add browser runtime benchmark"

# 6. threshold + CI
git add scripts/bench/component-host-threshold.ts .github/workflows/component-host-bench.yml
git commit -m "ci: add component host benchmark gate"
```

---

# 19. 这一版 Phase 8 和上一版的区别

这一版是按当前分支重写过的：

```txt
1. 使用 packages/web-c/*，不再使用 addons/*
2. pnpm-workspace.yaml 需要新增 benchmarks/*
3. 不直接 import transformZeus，因为主入口没有导出它
4. React/Vue wrapper 走 zeus:wc virtual module，不再依赖 wcOutDir
5. output-wc 默认 outDir 已经是 wc，所以 benchmark 也统一用 wc/react/vue
6. 第一版 runtime benchmark 只测 WC，React/Vue wrapper runtime 后续再补
```

Phase 8 做完后，你就能定量回答：

```txt
单组件引入 runtime 成本是多少？
全量组件成本是多少？
React/Vue wrapper 比 WC 多多少？
tree-shaking 是否真的有效？
component-analyzer 扫描是否成为瓶颈？
构建所有输出会不会太慢？
运行时 mount/update/event 性能是否达标？
```

这一步完成后，`component-compiler-host` 就从“架构闭环”进入“可度量、可回归、可发版评估”的阶段。
