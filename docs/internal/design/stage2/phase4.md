下面给你 **Phase D：DX 与发布准备** 的详细设计与代码草案。

Phase D 的目标是把 Zeus 从：

```txt
技术 MVP 能跑
```

推进到：

```txt
可发布 MVP 能被别人安装、创建项目、阅读文档、跑示例、通过发布前检查
```

---

# Phase D 总目标

Phase D 主要做 6 件事：

```txt
D1. create-zeus 本地 smoke test
D2. docs/getting-started 完整跑通
D3. examples/counter、todo、web-component 全部 build/check
D4. release precheck：build / dts / check / lint / test / examples / docs
D5. size report 输出核心包体积
D6. changeset release dry-run
```

完成后，Zeus 可以进入：

```txt
v0.1.0-alpha 发布准备状态
```

---

# Phase D 目录结构

建议整理成：

```txt
zeus/
  docs/
    guide/
      getting-started.md
      state.md
      jsx.md
      context.md
      runtime-semantics.md
      web-components.md
    api/
      zeus.md
      signal.md
      runtime-dom.md
      compiler.md
      vite-plugin.md

  examples/
    counter/
    todo/
    web-component/

  packages/
    create-zeus/
    zeus/
    signal/
    runtime-dom/
    compiler/
    vite-plugin/

  scripts/
    check-package-exports.ts
    check-examples.ts
    size-report.ts
    release-precheck.ts
```

---

# D1：create-zeus 本地 smoke test

## 目标

确保：

```bash
pnpm create zeus
```

或者本地等价命令能生成项目，并且生成的项目可以：

```bash
pnpm install
pnpm check
pnpm build
```

---

## create-zeus 模板结构

建议 `packages/create-zeus/templates` 下至少有：

```txt
packages/create-zeus/templates/
  basic-ts/
    package.json
    index.html
    vite.config.ts
    tsconfig.json
    src/main.tsx

  web-component-ts/
    package.json
    index.html
    vite.config.ts
    tsconfig.json
    src/main.tsx
```

---

## basic-ts 模板

### `packages/create-zeus/templates/basic-ts/package.json`

```json
{
  "name": "my-zeus-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit",
    "preview": "vite preview"
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

### `packages/create-zeus/templates/basic-ts/vite.config.ts`

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

### `packages/create-zeus/templates/basic-ts/tsconfig.json`

```json
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

### `packages/create-zeus/templates/basic-ts/src/main.tsx`

```tsx
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

## create-zeus smoke 测试

新增：

```txt
packages/create-zeus/__tests__/scaffold.spec.ts
```

```ts
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { scaffold } from '../src/scaffold'

describe('create-zeus scaffold', () => {
  it('creates basic-ts project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zeus-basic-'))

    await scaffold({
      root,
      projectName: 'my-zeus-app',
      template: 'basic-ts',
    })

    expect(existsSync(join(root, 'package.json'))).toBe(true)
    expect(existsSync(join(root, 'vite.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(root, 'src/main.tsx'))).toBe(true)

    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf-8'),
    ) as {
      name: string
    }

    expect(pkg.name).toBe('my-zeus-app')

    rmSync(root, {
      recursive: true,
      force: true,
    })
  })

  it('creates web-component-ts project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zeus-wc-'))

    await scaffold({
      root,
      projectName: 'my-zeus-wc',
      template: 'web-component-ts',
    })

    expect(existsSync(join(root, 'package.json'))).toBe(true)
    expect(existsSync(join(root, 'src/main.tsx'))).toBe(true)

    const main = readFileSync(join(root, 'src/main.tsx'), 'utf-8')

    expect(main).toContain('defineElement')
    expect(main).toContain('Host')
    expect(main).toContain('Slot')

    rmSync(root, {
      recursive: true,
      force: true,
    })
  })
})
```

---

# D2：docs/getting-started 完整跑通

## 目标

文档不能只是介绍概念，要能复制运行。

建议新增或完善：

```txt
docs/guide/getting-started.md
docs/guide/state.md
docs/guide/jsx.md
docs/guide/context.md
docs/guide/runtime-semantics.md
docs/guide/web-components.md
```

---

## `docs/guide/getting-started.md` 草案

````md
# Getting Started

## Create a Zeus app

```bash
pnpm create zeus
```

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

## `docs/guide/runtime-semantics.md` 草案

````md
# Runtime Semantics

## Events

Zeus uses delegated events by default.

```tsx
<input
  onInput={event => {
    console.log(event.currentTarget.value)
  }}
/>
```

`event.currentTarget` points to the element where the handler is declared.

## Refs

```tsx
const input = state<HTMLInputElement | null>(null)

<input ref={input} />
```

When the owner scope is disposed, `input.value` becomes `null`.

## Show

`Show` removes old nodes before rendering the next branch.

## For

`For` reuses DOM nodes by key.

```tsx
<For each={todos} by={todo => todo.id}>
  {todo => <li>{todo.title}</li>}
</For>
```

Items should usually be reactive objects. Replacing a plain object with the same key may reuse the old DOM subtree.

## render

`render()` returns a dispose function.

```ts
const dispose = render(() => <App />, root)

dispose()
```

Calling dispose clears the container and stops effects.
````

---

## docs package 脚本

`docs/package.json`：

```json
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

# D3：examples 全部 build/check

## 目标

至少维护三个示例：

```txt
examples/counter
examples/todo
examples/web-component
```

每个 example 都要有统一脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit"
  }
}
```

---

## `examples/todo/src/main.tsx`

```tsx
import { For, render, state } from '@zeus-js/zeus'

type Todo = {
  id: number
  title: string
  done: boolean
}

function App() {
  const title = state('')
  const todos = state<Todo[]>([
    {
      id: 1,
      title: 'Learn Zeus',
      done: false,
    },
  ])

  function addTodo() {
    const value = title.value.trim()

    if (!value) return

    todos.push({
      id: Date.now(),
      title: value,
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
            <li class={{ done: todo.done }}>
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

## `examples/web-component/src/main.tsx`

```tsx
import { Host, Slot, defineElement, state } from '@zeus-js/zeus'

defineElement(
  'z-counter-card',
  {
    shadow: false,
    props: {
      title: String,
      active: Boolean,
    },
  },
  (props, ctx) => {
    const count = state(0)

    return (
      <Host>
        <article class={{ active: props.active }}>
          <h2>{props.title}</h2>

          <section>
            <Slot />
          </section>

          <footer>
            <Slot name="footer">
              <button onClick={() => count.value++}>
                count: {count.value}
              </button>
            </Slot>
          </footer>

          <button
            onClick={() => {
              ctx.emit('select', {
                title: props.title,
                count: count.value,
              })
            }}
          >
            select
          </button>
        </article>
      </Host>
    )
  },
)
```

---

## examples 检查脚本

新增：

```txt
scripts/check-examples.ts
```

```ts
import { spawnSync } from 'node:child_process'

const examples = [
  '@zeus-js/example-counter',
  '@zeus-js/example-todo',
  '@zeus-js/example-web-component',
]

for (const example of examples) {
  run('pnpm', ['--filter', example, 'check'])
  run('pnpm', ['--filter', example, 'build'])
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
```

根目录 `package.json`：

```json
{
  "scripts": {
    "examples:check": "tsx scripts/check-examples.ts"
  }
}
```

---

# D4：release precheck

## 目标

发布前统一跑：

```txt
build
build-dts
check
lint
test-unit
examples:check
docs:build
size
package exports check
```

---

## 新增脚本：`scripts/release-precheck.ts`

```ts
import { spawnSync } from 'node:child_process'

const steps: Array<[string, string[]]> = [
  ['pnpm', ['build']],
  ['pnpm', ['build-dts']],
  ['pnpm', ['check']],
  ['pnpm', ['lint']],
  ['pnpm', ['test-unit']],
  ['pnpm', ['examples:check']],
  ['pnpm', ['docs:build']],
  ['pnpm', ['size']],
  ['pnpm', ['check:exports']],
]

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(' ')}\n`)

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    console.error(`\nFailed: ${command} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nRelease precheck passed.\n')
```

根目录 `package.json`：

```json
{
  "scripts": {
    "release:precheck": "tsx scripts/release-precheck.ts"
  }
}
```

---

# D5：package exports 检查

## 目标

防止发布后用户出现：

```txt
Cannot find module '@zeus-js/zeus/jsx-runtime'
Cannot find module '@zeus-js/signal/compat'
types path not found
```

---

## 新增 `scripts/check-package-exports.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')

const packages = [
  'packages/zeus/package.json',
  'packages/signal/package.json',
  'packages/runtime-dom/package.json',
  'packages/compiler/package.json',
  'packages/vite-plugin/package.json',
]

let hasError = false

for (const pkgPath of packages) {
  const fullPath = resolve(root, pkgPath)
  const pkg = JSON.parse(readFileSync(fullPath, 'utf-8')) as {
    name: string
    exports?: Record<string, unknown>
  }

  if (!pkg.exports) {
    error(`${pkg.name}: missing exports`)
    continue
  }

  checkExports(pkg.name, dirname(fullPath), pkg.exports)
}

if (hasError) {
  process.exit(1)
}

console.log('Package exports check passed.')

function checkExports(
  pkgName: string,
  pkgDir: string,
  exportsField: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(exportsField)) {
    checkExportValue(pkgName, pkgDir, key, value)
  }
}

function checkExportValue(
  pkgName: string,
  pkgDir: string,
  key: string,
  value: unknown,
): void {
  if (typeof value === 'string') {
    checkFile(pkgName, pkgDir, key, value)
    return
  }

  if (!value || typeof value !== 'object') return

  for (const [condition, target] of Object.entries(value)) {
    if (typeof target === 'string') {
      checkFile(pkgName, pkgDir, `${key}:${condition}`, target)
    }

    if (target && typeof target === 'object') {
      checkExportValue(pkgName, pkgDir, `${key}:${condition}`, target)
    }
  }
}

function checkFile(
  pkgName: string,
  pkgDir: string,
  key: string,
  target: string,
): void {
  if (!target.startsWith('./')) return
  if (target.includes('*')) return

  const file = resolve(pkgDir, target)

  if (!existsSync(file)) {
    error(`${pkgName} export "${key}" points to missing file: ${target}`)
  }
}

function error(message: string): void {
  hasError = true
  console.error(message)
}
```

根目录：

```json
{
  "scripts": {
    "check:exports": "tsx scripts/check-package-exports.ts"
  }
}
```

---

# D6：size report

## 目标

发布前知道核心包大小：

```txt
@zeus-js/signal
@zeus-js/runtime-dom
@zeus-js/zeus
@zeus-js/compiler
@zeus-js/vite-plugin
```

---

## `scripts/size-report.ts`

```ts
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

type SizeTarget = {
  name: string
  file: string
}

const targets: SizeTarget[] = [
  {
    name: '@zeus-js/signal',
    file: 'packages/signal/dist/signal.esm-browser.prod.js',
  },
  {
    name: '@zeus-js/runtime-dom',
    file: 'packages/runtime-dom/dist/runtime-dom.esm-browser.prod.js',
  },
  {
    name: '@zeus-js/zeus',
    file: 'packages/zeus/dist/zeus.esm-browser.prod.js',
  },
  {
    name: '@zeus-js/compiler',
    file: 'packages/compiler/dist/compiler.esm-bundler.js',
  },
  {
    name: '@zeus-js/vite-plugin',
    file: 'packages/vite-plugin/dist/vite-plugin.esm-bundler.js',
  },
]

console.log('\nPackage size report\n')

for (const target of targets) {
  const path = resolve(process.cwd(), target.file)

  if (!existsSync(path)) {
    console.log(`${target.name}: missing ${target.file}`)
    continue
  }

  const raw = readFileSync(path)
  const gzip = gzipSync(raw)

  console.log(`${target.name}`)
  console.log(`  file: ${target.file}`)
  console.log(`  raw:  ${formatSize(statSync(path).size)}`)
  console.log(`  gzip: ${formatSize(gzip.length)}`)
  console.log('')
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`
}
```

根目录：

```json
{
  "scripts": {
    "size": "pnpm build && tsx scripts/size-report.ts"
  }
}
```

---

# D7：changeset release dry-run

## 目标

发布前验证 changeset、包版本、npm 打包内容。

---

## changeset 配置

`.changeset/config.json`：

```json
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
  "ignore": [
    "@zeus-js/docs",
    "@zeus-js/example-counter",
    "@zeus-js/example-todo",
    "@zeus-js/example-web-component"
  ]
}
```

---

## dry-run 脚本

根目录：

```json
{
  "scripts": {
    "release:dry": "pnpm release:precheck && changeset publish --dry-run"
  }
}
```

如果使用 pnpm publish，也可以加：

```json
{
  "scripts": {
    "pack:dry": "pnpm -r --filter './packages/*' pack --dry-run"
  }
}
```

---

# D8：CI 工作流

## `.github/workflows/ci.yml`

```yaml
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

      - name: Release precheck
        run: pnpm release:precheck
```

---

# D9：Release Workflow

## `.github/workflows/release.yml`

```yaml
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

      - name: Precheck
        run: pnpm release:precheck

      - name: Create release PR or publish
        uses: changesets/action@v1
        with:
          version: pnpm version
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

# D10：根 package scripts 最终建议

根 `package.json` 建议整理成：

```json
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
    "test:bench": "vitest bench",
    "docs:dev": "pnpm -C docs dev",
    "docs:build": "pnpm -C docs build",
    "examples:check": "tsx scripts/check-examples.ts",
    "check:exports": "tsx scripts/check-package-exports.ts",
    "size": "pnpm build && tsx scripts/size-report.ts",
    "release:precheck": "tsx scripts/release-precheck.ts",
    "release:dry": "pnpm release:precheck && changeset publish --dry-run",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && pnpm build-dts && changeset publish"
  }
}
```

---

# Phase D 验收标准

Phase D 完成后，需要保证：

```txt
1. pnpm release:precheck 通过
2. pnpm release:dry 能跑
3. docs 能 build
4. examples/counter 能 build/check
5. examples/todo 能 build/check
6. examples/web-component 能 build/check
7. create-zeus scaffold 测试通过
8. package exports 检查通过
9. size report 能输出
10. CI 使用 release:precheck 作为主闸门
```

---

# Phase D 推荐提交顺序

```txt
1. chore(scripts): add release precheck pipeline
2. chore(scripts): add package exports checker
3. chore(scripts): add size report
4. test(create-zeus): add scaffold smoke tests
5. example(todo): add todo example
6. example(web-component): add web component example
7. docs: add getting started and runtime semantics
8. ci: add release precheck workflow
9. chore(release): add changeset dry-run script
```

---

# 最终结论

Phase D 是 Zeus 的 **可发布 MVP 准备阶段**。

Phase A/B/C 解决的是：

```txt
核心功能稳定
API 边界稳定
runtime 行为稳定
```

Phase D 解决的是：

```txt
别人能否创建项目
文档能否指导上手
examples 是否能验证能力
发布前是否有自动化闸门
包出口和体积是否可控
```

Phase D 完成后，Zeus 可以进入：

```txt
v0.1.0-alpha
```

这个版本不需要 SSR、Router、DevTools，但必须能稳定证明：

```txt
Zeus 是一个 compiler-first、fine-grained、no-VDOM、TSX-first 的实验性前端框架。
```
