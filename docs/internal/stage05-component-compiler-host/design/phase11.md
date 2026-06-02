# Phase 11：Docs + Release Candidate + Examples Polish 详细设计与代码草案

Phase 11 的目标是把 Phase 0–10 做出来的能力收口成一个 **可发布候选版本**。

它不是继续做大功能，而是做：

```txt
1. 文档站
2. 示例工程 polish
3. 发布前 smoke test
4. 包 exports 校验
5. CLI 使用链路验证
6. benchmark baseline 固化
7. release candidate 流程
```

最终目标：

```txt
开发者第一次看到 Zeus component compiler host 时，可以理解、安装、运行、添加组件、查看类型提示，并完成一个最小项目。
```

---

# 1. Phase 11 定位

前面阶段已经完成：

```txt
Phase 0-1：runtime / Host / defineElement 基础
Phase 2：component-analyzer
Phase 3：bundler-plugin
Phase 4：output-wc
Phase 5：component-dts
Phase 6：react/vue wrapper
Phase 7：headless primitives
Phase 8：benchmark & quality gates
Phase 9：icon no-runtime output
Phase 10：shadcn-like registry + CLI
```

Phase 11 要做的是：

```txt
把它们组织成一个可以对外说明、可以跑通、可以准备发版的 Release Candidate。
```

---

# 2. Phase 11 目标

## 做什么

```txt
1. 新增 docs 站点结构
2. 写完整 Quick Start
3. 写 Web Component / React / Vue 三条使用路径
4. 写 Component Compiler Host 架构文档
5. 写 Registry / CLI 文档
6. 写 Headless Components 文档
7. 写 Icons no-runtime 文档
8. 整理 examples
9. 新增 smoke test
10. 新增 package exports 校验脚本
11. 新增 release candidate checklist
12. 新增 canary release 流程草案
13. 固化 benchmark baseline
```

## 不做什么

```txt
1. 不再新增大型组件
2. 不做完整官网视觉设计
3. 不做复杂交互 playground
4. 不做正式稳定版 release
5. 不继续扩大 compiler API
```

---

# 3. 推荐目录结构

```txt
docs/
  package.json
  vite.config.ts
  index.html
  src/
    main.tsx
    App.tsx
    routes.ts

    pages/
      home.mdx
      guide/
        quick-start.mdx
        installation.mdx
        web-components.mdx
        react.mdx
        vue.mdx
        registry.mdx
        icons.mdx
        theming.mdx

      compiler-host/
        overview.mdx
        define-element.mdx
        host-slot.mdx
        component-analyzer.mdx
        bundler-plugin.mdx
        output-wc.mdx
        output-react-vue.mdx
        output-icons.mdx
        manifest.mdx
        dts.mdx
        performance.mdx

      components/
        button.mdx
        switch.mdx
        checkbox.mdx
        tabs.mdx
        dialog.mdx
        icon.mdx

      reference/
        package-exports.mdx
        cli.mdx
        config.mdx
        release.mdx

examples/
  web-component/
  react-wrapper/
  vue-wrapper/
  registry-react/
  registry-vue/
  icons-no-runtime/

scripts/
  release/
    check-package-exports.ts
    check-smoke-examples.ts
    check-registry-cli.ts
    create-rc-notes.ts
```

如果你不想现在做完整 docs app，也可以先用 markdown 文档：

```txt
docs/guide/*.md
docs/compiler-host/*.md
docs/components/*.md
```

但我建议 Phase 11 至少把文档结构先搭起来。

---

# 4. Docs 站点方案

你当前项目主要是前端框架/组件生态，所以 docs 站点可以先用最简单的 Vite + React + MDX。

后续也可以换 VitePress / Astro / Nextra，但 Phase 11 不建议在文档框架上耗太多时间。

## `docs/package.json`

```json
{
  "name": "@zeus-js/docs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@mdx-js/react": "^3.1.1",
    "@vitejs/plugin-react": "catalog:",
    "vite": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

## `docs/vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  plugins: [mdx(), react()],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

---

# 5. Docs App 草案

## `docs/src/routes.ts`

```ts
export interface DocRoute {
  title: string
  path: string
  group: string
  loader: () => Promise<{ default: React.ComponentType }>
}

export const routes: DocRoute[] = [
  {
    title: 'Quick Start',
    path: '/guide/quick-start',
    group: 'Guide',
    loader: () => import('./pages/guide/quick-start.mdx'),
  },
  {
    title: 'Web Components',
    path: '/guide/web-components',
    group: 'Guide',
    loader: () => import('./pages/guide/web-components.mdx'),
  },
  {
    title: 'React',
    path: '/guide/react',
    group: 'Guide',
    loader: () => import('./pages/guide/react.mdx'),
  },
  {
    title: 'Vue',
    path: '/guide/vue',
    group: 'Guide',
    loader: () => import('./pages/guide/vue.mdx'),
  },
  {
    title: 'Registry',
    path: '/guide/registry',
    group: 'Guide',
    loader: () => import('./pages/guide/registry.mdx'),
  },
  {
    title: 'Compiler Host Overview',
    path: '/compiler-host/overview',
    group: 'Compiler Host',
    loader: () => import('./pages/compiler-host/overview.mdx'),
  },
  {
    title: 'Component Analyzer',
    path: '/compiler-host/component-analyzer',
    group: 'Compiler Host',
    loader: () => import('./pages/compiler-host/component-analyzer.mdx'),
  },
  {
    title: 'Bundler Plugin',
    path: '/compiler-host/bundler-plugin',
    group: 'Compiler Host',
    loader: () => import('./pages/compiler-host/bundler-plugin.mdx'),
  },
  {
    title: 'Button',
    path: '/components/button',
    group: 'Components',
    loader: () => import('./pages/components/button.mdx'),
  },
  {
    title: 'Dialog',
    path: '/components/dialog',
    group: 'Components',
    loader: () => import('./pages/components/dialog.mdx'),
  },
  {
    title: 'CLI',
    path: '/reference/cli',
    group: 'Reference',
    loader: () => import('./pages/reference/cli.mdx'),
  },
]
```

## `docs/src/App.tsx`

```tsx
import React from 'react'
import { routes } from './routes'

export function App() {
  const [pathname, setPathname] = React.useState(() => window.location.pathname)
  const [Page, setPage] = React.useState<React.ComponentType | null>(null)

  React.useEffect(() => {
    const route = routes.find(item => item.path === pathname) ?? routes[0]

    route.loader().then(mod => {
      setPage(() => mod.default)
    })
  }, [pathname])

  const groups = groupRoutes()

  return (
    <div className="docs-shell">
      <aside className="docs-sidebar">
        <div className="docs-logo">Zeus</div>

        {Object.entries(groups).map(([group, items]) => (
          <section key={group}>
            <h2>{group}</h2>
            {items.map(route => (
              <button
                key={route.path}
                className={route.path === pathname ? 'active' : ''}
                onClick={() => {
                  window.history.pushState(null, '', route.path)
                  setPathname(route.path)
                }}
              >
                {route.title}
              </button>
            ))}
          </section>
        ))}
      </aside>

      <main className="docs-content">{Page ? <Page /> : null}</main>
    </div>
  )
}

function groupRoutes() {
  return routes.reduce<Record<string, typeof routes>>((acc, route) => {
    acc[route.group] ??= []
    acc[route.group].push(route)
    return acc
  }, {})
}
```

## `docs/src/main.tsx`

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './style.css'

createRoot(document.getElementById('root')!).render(<App />)
```

---

# 6. Quick Start 文档草案

## `docs/src/pages/guide/quick-start.mdx`

````mdx
# Quick Start

Zeus Component Compiler Host lets you write Web Components once and consume them from Web Components, React and Vue.

## Install

```bash
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/bundler-plugin @zeus-js/output-wc
```
````

## Create a component

```tsx
import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface ButtonProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
}

export const ZButton = defineElement<ButtonProps>(
  'z-button',
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
  },
  props => {
    return (
      <Host
        data-slot="button"
        data-variant={props.variant}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button disabled={props.disabled}>
          <Slot />
        </button>
      </Host>
    )
  },
)
```

## Configure Vite

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [
        wc({
          outDir: 'wc',
        }),
      ],
    }),
  ],
})
```

## Use it

```ts
import './wc/z-button.js'
```

```html
<z-button variant="outline">Button</z-button>
```

````

---

# 7. React 文档草案

## `docs/src/pages/guide/react.mdx`

```mdx
# React

Zeus can generate React wrappers for Web Components.

## Install

```bash
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/bundler-plugin @zeus-js/output-wc @zeus-js/output-react-wrapper
````

## Configure

```ts
import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import react from '@zeus-js/output-react-wrapper'

export default {
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [wc({ outDir: 'wc' }), react({ outDir: 'react' })],
    }),
  ],
}
```

## Use generated wrapper

```tsx
import { ZButton } from './react'

export function App() {
  return (
    <ZButton
      variant="outline"
      onPress={event => {
        console.log(event.detail.nativeEvent)
      }}
    >
      Button
    </ZButton>
  )
}
```

React wrappers use DOM property sync and native `addEventListener` internally, so boolean/object props and CustomEvent are handled consistently.

````

---

# 8. Registry 文档草案

## `docs/src/pages/guide/registry.mdx`

```mdx
# Registry

The Zeus UI registry provides copyable UI components built on top of `@zeus-ui/headless`.

## Init

```bash
pnpm dlx zeus-ui init
````

This creates:

```txt
components.json
src/lib/utils.ts
src/styles/zeus-theme.css
```

## Add a component

```bash
pnpm dlx zeus-ui add button
```

This writes:

```txt
src/components/ui/button.tsx
```

## Use the component

```tsx
import { Button } from '@/components/ui/button'

export function App() {
  return <Button variant="outline">Button</Button>
}
```

The generated source belongs to your project. You can edit it freely.

````

---

# 9. Compiler Host 架构文档草案

## `docs/src/pages/compiler-host/overview.mdx`

```mdx
# Component Compiler Host

The Component Compiler Host is the build-time layer that turns Zeus Web Component source into multiple outputs.

```txt
defineElement source
  ↓
component-analyzer
  ↓
ComponentManifest
  ↓
bundler-plugin
  ↓
output-wc
output-react-wrapper
output-vue-wrapper
output-icons
````

## Packages

```txt
@zeus-js/component-analyzer
@zeus-js/component-dts
@zeus-js/bundler-plugin
@zeus-js/output-wc
@zeus-js/output-react-wrapper
@zeus-js/output-vue-wrapper
@zeus-js/output-icons
```

## Source of truth

`defineElement` is the source of truth.

```tsx
export const ZButton = defineElement('z-button', options, setup)
```

The analyzer extracts:

```txt
tag
props
events
slots
host attributes
css parts
css variables
```

Outputs consume the manifest and generate framework-specific artifacts.

````

---

# 10. Component 文档生成思路

Phase 11 可以先手写组件文档，但建议同时准备一个自动生成基础 API 表格的工具。

输入：

```txt
dist/zeus.components.json
````

输出：

```md
## Props

| Name | Type | Default |

## Events

| Name | Detail |

## Slots

| Name | Description |

## CSS Parts

| Name |
```

## `scripts/docs/generate-component-api.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

interface Manifest {
  components: Array<{
    tag: string
    name: string
    description?: string
    props: Record<string, any>
    events: Record<string, any>
    slots: Record<string, any>
    cssParts: string[]
    cssVars: string[]
  }>
}

async function main() {
  const manifestPath = process.argv[2]
  const outDir = process.argv[3] ?? 'docs/generated/components'

  if (!manifestPath) {
    throw new Error(
      'Usage: tsx scripts/docs/generate-component-api.ts <manifest> [outDir]',
    )
  }

  const manifest = JSON.parse(
    await fs.readFile(manifestPath, 'utf-8'),
  ) as Manifest

  await fs.mkdir(outDir, {
    recursive: true,
  })

  for (const component of manifest.components) {
    const md = renderComponent(component)

    await fs.writeFile(path.join(outDir, `${component.tag}.md`), md)
  }
}

function renderComponent(component: Manifest['components'][number]): string {
  const lines: string[] = []

  lines.push(`# ${component.tag}`)
  lines.push('')

  if (component.description) {
    lines.push(component.description)
    lines.push('')
  }

  lines.push('## Props')
  lines.push('')
  lines.push('| Name | Type | Default | Description |')
  lines.push('|---|---|---|---|')

  for (const [name, prop] of Object.entries(component.props)) {
    lines.push(
      `| ${name} | ${formatPropType(prop)} | ${formatDefault(prop.default)} | ${prop.description ?? ''} |`,
    )
  }

  lines.push('')
  lines.push('## Events')
  lines.push('')
  lines.push('| Name | Detail | Description |')
  lines.push('|---|---|---|')

  for (const [name, event] of Object.entries(component.events)) {
    lines.push(
      `| ${name} | \`${formatDetail(event.detail)}\` | ${event.description ?? ''} |`,
    )
  }

  lines.push('')
  lines.push('## Slots')
  lines.push('')
  lines.push('| Name | Description |')
  lines.push('|---|---|')

  for (const [name, slot] of Object.entries(component.slots)) {
    lines.push(`| ${name} | ${(slot as any).description ?? ''} |`)
  }

  lines.push('')
  lines.push('## CSS Parts')
  lines.push('')

  for (const part of component.cssParts) {
    lines.push(`- \`${part}\``)
  }

  lines.push('')
  lines.push('## CSS Variables')
  lines.push('')

  for (const cssVar of component.cssVars) {
    lines.push(`- \`${cssVar}\``)
  }

  lines.push('')

  return lines.join('\n')
}

function formatPropType(prop: any): string {
  if (prop.values?.length) {
    return prop.values
      .map((item: string) => `\`${JSON.stringify(item)}\``)
      .join(' \\| ')
  }

  return `\`${prop.type ?? 'unknown'}\``
}

function formatDefault(value: unknown): string {
  if (value === undefined) return ''
  return `\`${JSON.stringify(value)}\``
}

function formatDetail(detail: Record<string, string> | undefined): string {
  if (!detail) return ''

  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
```

---

# 11. Examples Polish

Phase 11 需要把 examples 明确分层。

## 推荐 examples

```txt
examples/web-component
  验证原生 WC 使用

examples/react-wrapper
  验证 React wrapper 使用

examples/vue-wrapper
  验证 Vue wrapper 使用

examples/registry-react
  验证 zeus-ui add 后的 React 项目形态

examples/registry-vue
  验证 zeus-ui add 后的 Vue 项目形态

examples/icons-no-runtime
  验证 output-icons 产物
```

---

## `examples/registry-react/src/App.tsx`

```tsx
import { Button } from './components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog'
import { Switch } from './components/ui/switch'

export function App() {
  return (
    <main className="min-h-screen bg-[hsl(var(--z-background))] p-8 text-[hsl(var(--z-foreground))]">
      <section className="mx-auto flex max-w-xl flex-col gap-6">
        <h1 className="text-2xl font-semibold">Zeus UI Registry</h1>

        <div className="flex gap-3">
          <Button>Default</Button>
          <Button variant="outline">Outline</Button>
        </div>

        <Switch
          onCheckedChange={event => {
            console.log(event.detail.checked)
          }}
        />

        <Dialog>
          <DialogTrigger>Open dialog</DialogTrigger>

          <DialogContent>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>
              This dialog is built on Zeus headless primitives.
            </DialogDescription>
          </DialogContent>
        </Dialog>
      </section>
    </main>
  )
}
```

---

# 12. Smoke Test 设计

Phase 11 最重要的是 smoke test。

目标：

```txt
1. 所有 packages 可以 build
2. 所有 examples 可以 build
3. zeus-ui init 可以跑
4. zeus-ui add button 可以跑
5. 生成的 registry project 可以 tsc
6. package exports 都能 resolve
7. benchmark 可以生成 report
```

## `scripts/release/check-smoke-examples.ts`

```ts
import { spawnSync } from 'node:child_process'

const examples = [
  'examples/web-component',
  'examples/react-wrapper',
  'examples/vue-wrapper',
  'examples/registry-react',
  'examples/registry-vue',
  'examples/icons-no-runtime',
]

for (const example of examples) {
  run('pnpm', ['-C', example, 'build'])
}

function run(command: string, args: string[]) {
  console.log(`\n$ ${command} ${args.join(' ')}\n`)

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}
```

根脚本：

```json
{
  "scripts": {
    "check:examples": "tsx scripts/release/check-smoke-examples.ts"
  }
}
```

---

# 13. Package Exports 校验

这个脚本用于发现：

```txt
exports 指向不存在文件
types 指向不存在文件
import 指向不存在文件
```

## `scripts/release/check-package-exports.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

const packageDirs = [
  'packages/core/signal',
  'packages/core/runtime-dom',
  'packages/core/compiler',
  'packages/core/zeus',

  'packages/web-c/component-analyzer',
  'packages/web-c/component-dts',
  'packages/web-c/bundler-plugin',
  'packages/web-c/output-wc',
  'packages/web-c/output-react-wrapper',
  'packages/web-c/output-vue-wrapper',
  'packages/web-c/output-icons',

  'packages/headless',
  'packages/registry',
  'create/zeus-ui',
]

async function main() {
  const errors: string[] = []

  for (const dir of packageDirs) {
    await checkPackage(dir, errors)
  }

  if (errors.length) {
    console.error('\nPackage exports check failed:\n')

    for (const error of errors) {
      console.error(`  - ${error}`)
    }

    process.exit(1)
  }

  console.log('Package exports check passed.')
}

async function checkPackage(dir: string, errors: string[]) {
  const pkgPath = path.join(dir, 'package.json')

  let pkg: any

  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))
  } catch {
    errors.push(`${pkgPath} not found or invalid.`)
    return
  }

  const exportsField = pkg.exports

  if (!exportsField) return

  const entries = flattenExports(exportsField)

  for (const file of entries) {
    if (!file.startsWith('./')) continue

    const fullPath = path.join(dir, file)

    if (!(await exists(fullPath))) {
      errors.push(`${pkg.name}: exports points to missing file ${file}`)
    }
  }
}

function flattenExports(value: unknown): string[] {
  const result: string[] = []

  visit(value)

  return result

  function visit(node: unknown) {
    if (!node) return

    if (typeof node === 'string') {
      result.push(node)
      return
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }

    if (typeof node === 'object') {
      for (const item of Object.values(node)) {
        visit(item)
      }
    }
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
```

根脚本：

```json
{
  "scripts": {
    "check:exports": "tsx scripts/release/check-package-exports.ts"
  }
}
```

---

# 14. Registry CLI Smoke Test

这个脚本在临时目录里模拟用户：

```txt
pnpm create vite
zeus-ui init
zeus-ui add button
tsc
```

为了速度，Phase 11 可以不真的 create vite，而是手写最小 package。

## `scripts/release/check-registry-cli.ts`

```ts
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-ui-smoke-'))

  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        type: 'module',
        scripts: {
          check: 'tsc --noEmit',
        },
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
          '@zeus-ui/headless': 'workspace:*',
          clsx: '^2.1.1',
          'tailwind-merge': '^3.3.1',
          'class-variance-authority': '^0.7.1',
        },
        devDependencies: {
          typescript: '^6.0.3',
        },
      },
      null,
      2,
    ),
  )

  await fs.writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          strict: true,
          moduleResolution: 'Bundler',
          module: 'ESNext',
          target: 'ES2022',
          paths: {
            '@/*': ['./src/*'],
          },
        },
        include: ['src'],
      },
      null,
      2,
    ),
  )

  run('pnpm', ['zeus-ui', 'init', '--framework', 'react', '--yes'], root)
  run('pnpm', ['zeus-ui', 'add', 'button', '--yes'], root)

  await fs.mkdir(path.join(root, 'src'), {
    recursive: true,
  })

  await fs.writeFile(
    path.join(root, 'src', 'App.tsx'),
    `
import { Button } from './components/ui/button'

export function App() {
  return <Button variant="outline">Button</Button>
}
`,
  )

  run('pnpm', ['check'], root)

  console.log(`Registry CLI smoke test passed: ${root}`)
}

function run(command: string, args: string[], cwd: string) {
  console.log(`\n$ ${command} ${args.join(' ')}\n`)

  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
```

> 如果本地 workspace 下 `pnpm zeus-ui` 无法直接调用，需要先保证 CLI 包在 workspace 中有 bin 链接，或者脚本改为直接执行 `node create/zeus-ui/dist/index.js`。

---

# 15. Release Candidate Notes 生成

## `scripts/release/create-rc-notes.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const benchmarkPath = 'temp/bench/component-host/report.md'

  const sections: string[] = []

  sections.push('# Zeus Component Compiler Host RC Notes')
  sections.push('')
  sections.push('## Included')
  sections.push('')
  sections.push('- Runtime Host / Slot enhancements')
  sections.push('- Component analyzer')
  sections.push('- Bundler plugin host')
  sections.push('- Web Component output')
  sections.push('- React / Vue wrappers')
  sections.push('- Component DTS generator')
  sections.push('- Headless primitives')
  sections.push('- Icon no-runtime output')
  sections.push('- Registry CLI')
  sections.push('')

  sections.push('## Validation')
  sections.push('')
  sections.push('- pnpm build')
  sections.push('- pnpm build-dts')
  sections.push('- pnpm check')
  sections.push('- pnpm test-unit')
  sections.push('- pnpm bench:component-host')
  sections.push('- pnpm check:examples')
  sections.push('- pnpm check:exports')
  sections.push('')

  try {
    const benchmark = await fs.readFile(benchmarkPath, 'utf-8')
    sections.push('## Benchmark')
    sections.push('')
    sections.push(benchmark)
  } catch {
    sections.push('## Benchmark')
    sections.push('')
    sections.push('Benchmark report not found.')
  }

  await fs.mkdir('temp/release', {
    recursive: true,
  })

  await fs.writeFile(
    path.join('temp/release', 'component-host-rc.md'),
    `${sections.join('\n')}\n`,
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
```

根脚本：

```json
{
  "scripts": {
    "release:rc-notes": "tsx scripts/release/create-rc-notes.ts"
  }
}
```

---

# 16. RC 校验总脚本

根 `package.json` 增加：

```json
{
  "scripts": {
    "check:component-host-rc": "pnpm build && pnpm build-dts && pnpm check && pnpm test-unit && pnpm check:exports && pnpm check:examples && pnpm bench:component-host && pnpm release:rc-notes"
  }
}
```

如果太慢，可以拆成：

```json
{
  "scripts": {
    "check:component-host-rc:fast": "pnpm build && pnpm check && pnpm test-unit && pnpm check:exports",
    "check:component-host-rc:full": "pnpm check:component-host-rc"
  }
}
```

---

# 17. GitHub Actions 草案

```yaml
name: Component Host RC

on:
  pull_request:
    paths:
      - 'packages/core/**'
      - 'packages/web-c/**'
      - 'packages/headless/**'
      - 'packages/registry/**'
      - 'create/zeus-ui/**'
      - 'examples/**'
      - 'benchmarks/**'
      - 'scripts/**'
      - 'docs/**'
      - 'package.json'
      - 'pnpm-workspace.yaml'

jobs:
  rc:
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

      - run: pnpm check:component-host-rc:fast

      - run: pnpm bench:component-host
        if: always()

      - run: pnpm release:rc-notes
        if: always()

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: component-host-rc-report
          path: |
            temp/bench/component-host
            temp/release
```

---

# 18. 发布前 Checklist

新增：

```txt
docs/internal/stage05-component-compiler-host/release-checklist.md
```

内容：

```md
# Component Compiler Host Release Checklist

## Build

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm build`
- [ ] `pnpm build-dts`
- [ ] `pnpm check`
- [ ] `pnpm test-unit`

## Packages

- [ ] `@zeus-js/component-analyzer`
- [ ] `@zeus-js/component-dts`
- [ ] `@zeus-js/bundler-plugin`
- [ ] `@zeus-js/output-wc`
- [ ] `@zeus-js/output-react-wrapper`
- [ ] `@zeus-js/output-vue-wrapper`
- [ ] `@zeus-js/output-icons`
- [ ] `@zeus-ui/headless`
- [ ] `@zeus-ui/registry`
- [ ] `zeus-ui`

## Exports

- [ ] `pnpm check:exports`
- [ ] package exports point to existing files
- [ ] package types point to existing files
- [ ] sideEffects config checked

## Examples

- [ ] `examples/web-component`
- [ ] `examples/react-wrapper`
- [ ] `examples/vue-wrapper`
- [ ] `examples/registry-react`
- [ ] `examples/registry-vue`
- [ ] `examples/icons-no-runtime`

## CLI

- [ ] `zeus-ui init`
- [ ] `zeus-ui add button`
- [ ] generated React component typechecks
- [ ] generated Vue component typechecks

## Benchmark

- [ ] `pnpm bench:component-host`
- [ ] size baseline reviewed
- [ ] compile baseline reviewed
- [ ] runtime baseline reviewed

## Docs

- [ ] Quick Start
- [ ] Web Component usage
- [ ] React usage
- [ ] Vue usage
- [ ] Registry usage
- [ ] Icons usage
- [ ] Component API pages
- [ ] Release notes generated
```

---

# 19. Phase 11 验收标准

```txt
[ ] docs 站点能 build
[ ] Quick Start 完成
[ ] Web Component 文档完成
[ ] React wrapper 文档完成
[ ] Vue wrapper 文档完成
[ ] Registry CLI 文档完成
[ ] Icons no-runtime 文档完成
[ ] Component Compiler Host 架构文档完成
[ ] 组件 API 文档生成脚本可用
[ ] examples 全部可 build
[ ] check:exports 可通过
[ ] check:examples 可通过
[ ] check:registry-cli 可通过
[ ] check:component-host-rc:fast 可通过
[ ] bench:component-host 可生成报告
[ ] release checklist 完成
[ ] rc notes 可生成
```

---

# 20. 推荐提交顺序

```bash
# 1. docs scaffold
git add docs/package.json docs/vite.config.ts docs/src
git commit -m "docs: add documentation site scaffold"

# 2. guide docs
git add docs/src/pages/guide
git commit -m "docs: add getting started guides"

# 3. compiler host docs
git add docs/src/pages/compiler-host
git commit -m "docs: add component compiler host docs"

# 4. component docs
git add docs/src/pages/components scripts/docs/generate-component-api.ts
git commit -m "docs: add component api documentation"

# 5. examples polish
git add examples/web-component examples/react-wrapper examples/vue-wrapper examples/registry-react examples/registry-vue examples/icons-no-runtime
git commit -m "example: polish component host examples"

# 6. release check scripts
git add scripts/release/check-package-exports.ts scripts/release/check-smoke-examples.ts scripts/release/check-registry-cli.ts
git commit -m "chore(release): add component host smoke checks"

# 7. rc notes and checklist
git add scripts/release/create-rc-notes.ts docs/internal/stage05-component-compiler-host/release-checklist.md
git commit -m "chore(release): add rc notes and checklist"

# 8. CI
git add .github/workflows/component-host-rc.yml package.json
git commit -m "ci: add component host rc validation"
```

---

# 21. Phase 11 完成后的状态

完成 Phase 11 后，你这个链路就从：

```txt
架构和功能基本跑通
```

进入：

```txt
可演示
可验证
可发 RC
可让别人试用
```

最终对外可以这样描述：

```txt
Zeus Component Compiler Host allows you to author Web Components once,
analyze them into a manifest, and generate Web Component, React, Vue,
DTS, no-runtime icons, and shadcn-like registry outputs.
```

后续 Phase 12 就可以进入：

```txt
Release Candidate hardening
bugfix only
版本发布策略
canary / alpha 发布
用户反馈收集
```

也就是从“开发路线”切换到“发版路线”。
