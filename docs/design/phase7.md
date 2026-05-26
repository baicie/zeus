下面给你 **Phase 7：文档站、脚手架、发布体系与生态化** 的详细设计与代码草案。

Phase 7 的目标不是继续扩 runtime/compiler，而是让 Zeus 从“能开发”变成“能发布、能被别人安装、能被新人快速上手、能长期维护”。

# Phase 7：Docs / Create App / Release / Ecosystem

## 目标

Phase 7 要完成：

```txt id="dmxb03"
1. 文档站
2. create-zeus 脚手架
3. examples 示例集
4. npm 发布体系
5. changeset 版本管理
6. CI / Release workflow
7. 生态包发布策略
8. API 稳定性规范
9. 贡献指南
10. 路线图公开化
```

Phase 7 完成后，用户应该可以这样开始：

```bash id="gh6p1m"
pnpm create zeus
cd my-zeus-app
pnpm install
pnpm dev
```

然后写：

```tsx id="mianqv"
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>count: {count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```

---

# Phase 7 包结构

在前面已有包基础上：

```txt id="yx4uhl"
packages/
  shared/
  signal/
  runtime-dom/
  compiler/
  zeus/
  vite-plugin/
```

Phase 7 新增：

```txt id="rq2p84"
packages/
  create-zeus/       # 脚手架 CLI

docs/                # 文档站
examples/            # 独立示例项目
templates/           # create-zeus 模板
```

最终结构：

```txt id="dzxgsb"
zeus/
  docs/
  examples/
    basic/
    counter/
    todo/
    web-component/
    benchmark-demo/

  templates/
    basic-ts/
    web-component-ts/

  packages/
    shared/
    signal/
    runtime-dom/
    compiler/
    zeus/
    vite-plugin/
    create-zeus/

  .changeset/
  .github/
    workflows/
      ci.yml
      release.yml
```

---

# 1. 文档站设计

## 技术选型

建议用 **VitePress**。

原因：

```txt id="nqgdle"
1. 和 Vite 生态一致
2. 文档启动快
3. Markdown 友好
4. API 文档、指南、示例都好组织
5. 不影响框架本身
```

---

## docs 目录

```txt id="t5611w"
docs/
  package.json
  index.md
  guide/
    getting-started.md
    state.md
    jsx.md
    components.md
    refs.md
    control-flow.md
    web-components.md
    vite-plugin.md

  api/
    zeus.md
    signal.md
    runtime-dom.md
    compiler.md
    vite-plugin.md

  advanced/
    compiler.md
    runtime.md
    reactivity.md
    performance.md

  examples/
    counter.md
    todo.md
    web-component.md

  contributing.md
  roadmap.md

  .vitepress/
    config.ts
```

---

## `docs/package.json`

```json id="s9biej"
{
  "name": "@zeus-js/docs",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vitepress dev .",
    "build": "vitepress build .",
    "preview": "vitepress preview ."
  },
  "devDependencies": {
    "vitepress": "^2.0.0"
  }
}
```

---

## `docs/.vitepress/config.ts`

```ts id="zq06nd"
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Zeus',
  description: 'Compiler-first fine-grained UI framework',

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/zeus' },
      { text: 'Examples', link: '/examples/counter' },
      { text: 'Roadmap', link: '/roadmap' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'State', link: '/guide/state' },
            { text: 'JSX', link: '/guide/jsx' },
            { text: 'Components', link: '/guide/components' },
            { text: 'Refs', link: '/guide/refs' },
            { text: 'Control Flow', link: '/guide/control-flow' },
            { text: 'Web Components', link: '/guide/web-components' },
            { text: 'Vite Plugin', link: '/guide/vite-plugin' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API',
          items: [
            { text: '@zeus-js/zeus', link: '/api/zeus' },
            { text: '@zeus-js/signal', link: '/api/signal' },
            { text: '@zeus-js/runtime-dom', link: '/api/runtime-dom' },
            { text: '@zeus-js/compiler', link: '/api/compiler' },
            { text: '@zeus-js/vite-plugin', link: '/api/vite-plugin' },
          ],
        },
      ],

      '/advanced/': [
        {
          text: 'Advanced',
          items: [
            { text: 'Compiler', link: '/advanced/compiler' },
            { text: 'Runtime', link: '/advanced/runtime' },
            { text: 'Reactivity', link: '/advanced/reactivity' },
            { text: 'Performance', link: '/advanced/performance' },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/baicie/zeus',
      },
    ],
  },
})
```

---

## `docs/index.md`

````md id="vty44i"
# Zeus

Compiler-first fine-grained UI framework.

Zeus combines:

- unified `state()` API
- Vue-like object reactivity
- compiled JSX
- direct DOM updates
- optional Web Components output

```tsx
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>count: {count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```
````

## Start

```bash
pnpm create zeus
```

````

---

# 2. Getting Started 文档草案

## `docs/guide/getting-started.md`

```md id="tno9uq"
# Getting Started

## Create a Zeus app

```bash
pnpm create zeus
````

## Manual install

```bash
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/vite-plugin vite typescript
```

## Vite config

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

## TypeScript config

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"]
  }
}
```

## First component

```tsx
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>count: {count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```

````

---

# 3. State 文档草案

## `docs/guide/state.md`

```md id="x1ahjl"
# State

Zeus uses `state()` as the unified state API.

## Primitive state

Primitive values are wrapped in a value holder.

```ts
const count = state(0)

count.value++
````

## Object state

Objects are converted into reactive proxies.

```ts
const user = state({
  name: 'Zeus',
  age: 1,
})

user.name = 'ZeusJS'
```

## Arrays

```ts
const todos = state([{ id: 1, title: 'Learn Zeus' }])

todos.push({
  id: 2,
  title: 'Build app',
})
```

## Map / Set

```ts
const map = state(new Map<string, number>())

map.set('a', 1)
```

## Why not ref()?

Zeus reserves `ref` as a JSX attribute protocol:

```tsx
const input = state<HTMLInputElement | null>(null)

<input ref={input} />
```

Use `state()` for state creation.

````

---

# 4. create-zeus 脚手架设计

## 目标

用户可以运行：

```bash id="v8x32v"
pnpm create zeus
````

选择模板：

```txt id="in2bhj"
basic-ts
web-component-ts
```

生成项目。

---

## 包结构

```txt id="nhg12z"
packages/create-zeus/
  package.json
  index.js
  src/
    index.ts
    prompts.ts
    scaffold.ts
    templates.ts
```

---

## `packages/create-zeus/package.json`

```json id="u40qvg"
{
  "name": "create-zeus",
  "version": "0.0.1",
  "description": "Create a Zeus app",
  "type": "module",
  "bin": {
    "create-zeus": "./dist/index.js"
  },
  "files": ["dist", "templates"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts false --clean"
  },
  "dependencies": {
    "@clack/prompts": "^0.11.0",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^6.0.3"
  }
}
```

> 如果你不想额外引入 `tsup`，也可以让它接入 monorepo 统一 build。MVP 用 tsup 更简单。

---

## `packages/create-zeus/src/index.ts`

```ts id="b36djc"
#!/usr/bin/env node

import { cancel, intro, isCancel, outro, select, text } from '@clack/prompts'
import pc from 'picocolors'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { scaffold } from './scaffold'

const templates = [
  {
    value: 'basic-ts',
    label: 'Basic TypeScript',
    hint: 'Zeus + Vite + TSX',
  },
  {
    value: 'web-component-ts',
    label: 'Web Component TypeScript',
    hint: 'Zeus defineElement + Host + Slot',
  },
] as const

type TemplateName = (typeof templates)[number]['value']

async function main() {
  intro(pc.cyan('Create Zeus App'))

  const projectName = await text({
    message: 'Project name',
    placeholder: 'my-zeus-app',
    defaultValue: 'my-zeus-app',
    validate(value) {
      if (!value.trim()) return 'Project name is required.'
    },
  })

  if (isCancel(projectName)) {
    cancel('Operation cancelled.')
    process.exit(0)
  }

  const template = await select({
    message: 'Select a template',
    options: templates,
  })

  if (isCancel(template)) {
    cancel('Operation cancelled.')
    process.exit(0)
  }

  const root = resolve(process.cwd(), projectName)

  if (existsSync(root)) {
    const action = await select({
      message: `Directory "${projectName}" already exists.`,
      options: [
        { value: 'overwrite', label: 'Overwrite' },
        { value: 'cancel', label: 'Cancel' },
      ],
    })

    if (isCancel(action) || action === 'cancel') {
      cancel('Operation cancelled.')
      process.exit(0)
    }
  }

  await scaffold({
    root,
    projectName,
    template: template as TemplateName,
  })

  outro(`
Done.

Next steps:

  cd ${projectName}
  pnpm install
  pnpm dev
`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
```

---

## `packages/create-zeus/src/scaffold.ts`

```ts id="rt255k"
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ScaffoldOptions {
  root: string
  projectName: string
  template: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const templateRoot = resolve(__dirname, '../templates', options.template)

  if (!existsSync(templateRoot)) {
    throw new Error(`Template "${options.template}" not found.`)
  }

  if (existsSync(options.root)) {
    rmSync(options.root, {
      recursive: true,
      force: true,
    })
  }

  mkdirSync(options.root, {
    recursive: true,
  })

  cpSync(templateRoot, options.root, {
    recursive: true,
  })

  patchPackageJson(options.root, options.projectName)
}

function patchPackageJson(root: string, projectName: string): void {
  const packageJsonPath = join(root, 'package.json')
  const raw = readFileSync(packageJsonPath, 'utf-8')
  const json = JSON.parse(raw) as Record<string, unknown>

  json.name = normalizePackageName(projectName)

  writeFileSync(packageJsonPath, `${JSON.stringify(json, null, 2)}\n`)
}

function normalizePackageName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}
```

---

# 5. create-zeus 模板

## `packages/create-zeus/templates/basic-ts/package.json`

```json id="maljei"
{
  "name": "my-zeus-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@zeus-js/zeus": "latest"
  },
  "devDependencies": {
    "@zeus-js/vite-plugin": "latest",
    "typescript": "^6.0.3",
    "vite": "^7.0.0"
  }
}
```

---

## `templates/basic-ts/vite.config.ts`

```ts id="qa3imw"
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

---

## `templates/basic-ts/tsconfig.json`

```json id="o2s9o7"
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"],
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

---

## `templates/basic-ts/index.html`

```html id="usrgc3"
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Zeus App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## `templates/basic-ts/src/main.tsx`

```tsx id="ntezju"
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return (
    <main>
      <h1>Zeus</h1>

      <button onClick={() => count.value++}>count: {count.value}</button>
    </main>
  )
}

render(() => <App />, document.getElementById('root')!)
```

---

# 6. Web Component 模板

## `templates/web-component-ts/src/main.tsx`

```tsx id="4q37f3"
import { Host, Slot, defineElement, state } from '@zeus-js/zeus'

defineElement(
  'z-counter',
  {
    shadow: false,
    props: {
      title: String,
    },
  },
  props => {
    const count = state(0)

    return (
      <Host>
        <section>
          <h2>{props.title}</h2>

          <button onClick={() => count.value++}>count: {count.value}</button>

          <Slot />
        </section>
      </Host>
    )
  },
)
```

## `templates/web-component-ts/index.html`

```html id="fykmwb"
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Zeus Web Component</title>
  </head>
  <body>
    <z-counter title="Zeus Counter">
      <p>Light DOM content</p>
    </z-counter>

    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

# 7. Examples 设计

`examples/` 不是脚手架模板，而是仓库内长期维护的示例。

```txt id="feiwvx"
examples/
  counter/
  todo/
  web-component/
  form/
  benchmark-demo/
```

每个 example 都是独立 Vite 项目。

## `examples/todo/src/main.tsx`

```tsx id="z66k8j"
import { For, render, state } from '@zeus-js/zeus'

function App() {
  const title = state('')
  const todos = state([{ id: 1, title: 'Learn Zeus', done: false }])

  function addTodo() {
    if (!title.value.trim()) return

    todos.push({
      id: Date.now(),
      title: title.value,
      done: false,
    })

    title.value = ''
  }

  return (
    <main>
      <h1>Todo</h1>

      <input
        prop:value={title.value}
        onInput={event => {
          title.value = event.currentTarget.value
        }}
      />

      <button onClick={addTodo}>Add</button>

      <ul>
        <For each={todos} by={todo => todo.id}>
          {todo => (
            <li>
              <label>
                <input
                  type="checkbox"
                  prop:checked={todo.done}
                  onChange={event => {
                    todo.done = event.currentTarget.checked
                  }}
                />

                <span>{todo.title}</span>
              </label>
            </li>
          )}
        </For>
      </ul>
    </main>
  )
}

render(() => <App />, document.getElementById('root')!)
```

---

# 8. Release 体系

建议使用 **Changesets**。

## 安装

```bash id="va8izg"
pnpm add -D @changesets/cli
pnpm changeset init
```

---

## `.changeset/config.json`

```json id="zfz378"
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    [
      "@zeus-js/zeus",
      "@zeus-js/signal",
      "@zeus-js/runtime-dom",
      "@zeus-js/compiler",
      "@zeus-js/vite-plugin"
    ]
  ],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@zeus-js/docs", "@zeus-js/playground"]
}
```

### 版本策略

建议：

```txt id="3ct5rv"
0.1.x：内部预览
0.2.x：runtime/compiler 可用
0.3.x：Vite 插件稳定
0.4.x：Web Components
0.5.x：性能优化
1.0.0：API freeze
```

---

# 9. Root package scripts

```json id="3tci0r"
{
  "scripts": {
    "dev": "tsx scripts/build.ts --watch",
    "build": "tsx scripts/build.ts",
    "build-dts": "tsc -p tsconfig.build.json --noCheck && rolldown -c ./scripts/rolldown.dts.config.ts",
    "check": "tsc --incremental --noEmit",
    "lint": "eslint --cache .",
    "test": "vitest",
    "test-unit": "vitest --project 'unit*'",
    "test-coverage": "vitest run --project unit* --coverage",
    "docs:dev": "pnpm -C docs dev",
    "docs:build": "pnpm -C docs build",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && pnpm build-dts && changeset publish",
    "create-zeus:build": "pnpm -F create-zeus build",
    "examples:check": "pnpm -r --filter './examples/**' check"
  }
}
```

当前仓库已经有 `build/check/test/lint` 这类根脚本，Phase 7 是在这些基础上补文档、release 和 examples。

---

# 10. GitHub Actions：CI

## `.github/workflows/ci.yml`

```yaml id="u9dyww"
name: CI

on:
  push:
    branches:
      - main
      - feat/**
  pull_request:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm check

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test-unit

      - name: Build
        run: pnpm build

      - name: Build docs
        run: pnpm docs:build
```

---

# 11. GitHub Actions：Release

## `.github/workflows/release.yml`

```yaml id="gvno9x"
name: Release

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest

    permissions:
      contents: write
      pull-requests: write
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build && pnpm build-dts

      - name: Test
        run: pnpm test-unit

      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          version: pnpm version
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

# 12. npm 发布顺序

建议发布这些包：

```txt id="hl8i4z"
@zeus-js/shared
@zeus-js/signal
@zeus-js/runtime-dom
@zeus-js/compiler
@zeus-js/zeus
@zeus-js/vite-plugin
create-zeus
```

依赖关系：

```txt id="2vg48z"
shared
  ↓
signal
  ↓
runtime-dom
  ↓
zeus

compiler
  ↓
vite-plugin
```

发布时 Changesets 会处理 workspace 内依赖版本。

---

# 13. API 稳定性规范

新增：

```txt id="l89irb"
docs/contributing.md
docs/api-stability.md
```

## `docs/api-stability.md`

```md id="szn44c"
# API Stability

Zeus is currently in 0.x stage.

## Stable in 0.x

- `state()`
- `computed()`
- `effect()`
- `watch()`
- `scope()`
- `render()`
- `Show`
- `For`
- `defineElement()`

## Experimental

- `Host`
- `Slot`
- event delegation internals
- compiler IR
- runtime helper names

## Internal APIs

Do not rely on:

- generated helper names
- compiler IR node shape
- runtime internal context
- `@zeus-js/signal/compat`
```

---

# 14. CONTRIBUTING 草案

## `CONTRIBUTING.md`

````md id="uglo2v"
# Contributing

## Setup

```bash
pnpm install
```
````

## Development

```bash
pnpm dev
```

## Test

```bash
pnpm test
```

## Type check

```bash
pnpm check
```

## Build

```bash
pnpm build
```

## Changesets

Every user-facing change should include a changeset:

```bash
pnpm changeset
```

## Package responsibilities

- `@zeus-js/signal`: reactivity core
- `@zeus-js/runtime-dom`: DOM runtime helpers
- `@zeus-js/compiler`: JSX compiler
- `@zeus-js/zeus`: framework entry
- `@zeus-js/vite-plugin`: Vite integration

````

---

# 15. Roadmap 文档

## `docs/roadmap.md`

```md id="lycqcm"
# Roadmap

## Phase 0: Project Baseline

- Monorepo structure
- Build/test baseline
- API naming decision

## Phase 1: Unified State API

- `state()`
- `computed()`
- `effect()`
- `watch()`
- `scope()`

## Phase 2: Runtime DOM MVP

- template clone
- text/attr/prop/class/style/event/ref bindings
- render/dispose

## Phase 3: Compiler MVP

- JSX to runtime helper calls
- static template hoist
- Show/For
- component props

## Phase 4: Framework DX

- `@zeus-js/zeus`
- Vite plugin
- JSX types
- playground

## Phase 5: Web Components

- defineElement
- Host
- Slot
- light DOM slot

## Phase 6: Performance

- keyed For
- event delegation
- DynamicRange
- benchmark

## Phase 7: Ecosystem

- docs
- create-zeus
- examples
- release workflow
````

---

# 16. README 最终结构

根 README 建议改成：

````md id="pzugok"
# Zeus

Compiler-first fine-grained UI framework.

```tsx
import { render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  return <button onClick={() => count.value++}>count: {count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```
````

## Features

- unified `state()` API
- object reactivity
- compiled JSX
- no Virtual DOM
- fine-grained DOM updates
- Web Components support

## Packages

- `@zeus-js/zeus`
- `@zeus-js/signal`
- `@zeus-js/runtime-dom`
- `@zeus-js/compiler`
- `@zeus-js/vite-plugin`

## Quick Start

```bash
pnpm create zeus
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```

````

---

# 17. Phase 7 测试与验收

## 脚手架测试

新增：

```txt id="kcegqz"
packages/create-zeus/__tests__/scaffold.spec.ts
````

```ts id="cr6bzg"
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { scaffold } from '../src/scaffold'

describe('create-zeus scaffold', () => {
  it('creates basic-ts project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zeus-'))

    await scaffold({
      root,
      projectName: 'my-app',
      template: 'basic-ts',
    })

    expect(existsSync(join(root, 'package.json'))).toBe(true)
    expect(existsSync(join(root, 'src/main.tsx'))).toBe(true)

    rmSync(root, {
      recursive: true,
      force: true,
    })
  })
})
```

---

# 18. Phase 7 任务拆分

## Phase 7.1：文档站

```txt id="mduunr"
- docs/package.json
- VitePress config
- getting-started
- state
- jsx
- components
- refs
- control-flow
- web-components
- api docs
```

---

## Phase 7.2：create-zeus

```txt id="rjmebj"
- create-zeus package
- CLI prompt
- scaffold function
- basic-ts template
- web-component-ts template
- scaffold test
```

---

## Phase 7.3：examples

```txt id="ye0wca"
- counter
- todo
- web-component
- form
- benchmark-demo
```

---

## Phase 7.4：release system

```txt id="v46asq"
- changesets
- config
- release script
- npm publish workflow
- package exports check
```

---

## Phase 7.5：CI

```txt id="ezmd78"
- type check
- lint
- unit test
- build
- docs build
- create-zeus scaffold test
```

---

## Phase 7.6：贡献与维护规范

```txt id="rh1uax"
- CONTRIBUTING.md
- API stability doc
- Roadmap
- issue templates
- PR template
```

---

# 19. GitHub issue templates

## `.github/ISSUE_TEMPLATE/bug_report.yml`

```yaml id="qzlj4b"
name: Bug report
description: Report a bug
title: '[Bug]: '
labels: ['bug']

body:
  - type: textarea
    id: reproduction
    attributes:
      label: Reproduction
      description: Provide a minimal reproduction.
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true

  - type: input
    id: version
    attributes:
      label: Zeus version
    validations:
      required: true
```

---

## `.github/pull_request_template.md`

```md id="c58t5o"
## Summary

## Changes

## Tests

- [ ] pnpm check
- [ ] pnpm test
- [ ] pnpm build

## Changeset

- [ ] Added changeset
- [ ] Not needed
```

---

# 20. Phase 7 完成标准

Phase 7 完成后，需要满足：

```txt id="t6mbvk"
1. 文档站能本地启动和构建
2. pnpm create zeus 能创建项目
3. basic-ts 模板能 pnpm dev 跑起来
4. web-component-ts 模板能跑起来
5. examples 至少有 counter / todo / web-component
6. changeset 能生成版本变更
7. release workflow 能发布 npm 包
8. CI 能跑 check / lint / test / build / docs
9. README 清晰说明 Zeus 定位
10. CONTRIBUTING 和 Roadmap 完成
```

---

# 21. 最终结论

Phase 7 是 Zeus 的 **生态化和发布阶段**。

前面 Phase 0~6 让 Zeus 技术上能跑；Phase 7 让 Zeus 能被别人真正使用：

```txt id="lip51k"
文档让人看得懂
create-zeus 让人起得来
examples 让人学得会
changesets 让版本发得稳
CI 让质量守得住
release workflow 让包能持续发布
```

到 Phase 7 结束，Zeus 才从个人实验项目变成一个具备最小生态闭环的前端框架项目。
