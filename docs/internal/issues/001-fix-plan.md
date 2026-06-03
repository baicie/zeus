结论：**最优方案不是继续 patch `@babel/plugin-syntax-jsx`，也不是调 Rolldown external，而是彻底移除 `@babel/plugin-syntax-jsx` 依赖，在 Zeus compiler 自己的 Babel plugin 里用 `manipulateOptions` 注入 parser plugin `jsx`。**

这个分支当前已经基本按这个方向改了：`packages/core/compiler/src/index.ts` 已经没有再 import `@babel/plugin-syntax-jsx`，而是在插件对象里通过 `manipulateOptions` 检查并 push `'jsx'`。

---

## 1. 根因判断

issue 文档记录的问题是：`@zeus-js/compiler@0.1.0-alpha.1` 的 CJS 构建里访问了 `SyntaxJSX__namespace.default`，但 `@babel/plugin-syntax-jsx` 的 CJS 入口导出的是函数本身，没有 `.default`，最终导致 Babel plugin 的 `inherits` 为 `undefined`。

这类问题本质不是 Babel JSX 解析能力缺失，而是 **ESM/CJS interop 语义和构建产物不一致**。issue 里也写到 CJS 消费路径、Webpack 非 ESM mode、直接 `require` 都会受影响。

所以修复思路应该是：**避免 compiler 运行时依赖这个 CJS/ESM 边界有歧义的第三方插件。**

---

## 2. 最优方案

### 采用方案：内置 JSX parser plugin 注入

不要写：

```ts
import syntaxJsx from '@babel/plugin-syntax-jsx'

export default declare((api, options) => {
  return {
    inherits: syntaxJsx,
    visitor: createVisitor(config),
  }
})
```

改成：

```ts
export default declare((api, options) => {
  return {
    manipulateOptions(_opts, parserOpts) {
      parserOpts.plugins.push('jsx')
    },
    visitor: createVisitor(config),
  }
})
```

`@babel/plugin-syntax-jsx` 本质上也只是让 Babel parser 开启 JSX 语法；Zeus compiler 已经是 Babel plugin，直接在自己的 plugin 里做 parser option 注入更短、更稳定。

---

## 3. 为什么比 issue 里的 A/B/C 更优

| 方案                                              | 结论                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| patch `@babel/plugin-syntax-jsx`                  | 临时可用，但会把发布稳定性依赖在 pnpm patch 上，消费者环境不可控。 |
| 构建 external / 调 interop                        | 不够根治。不同 bundler、CJS loader、Node 版本下仍可能复现。        |
| 默认导入 `import syntaxJsx from`                  | 比 namespace import 好，但仍依赖第三方包导出形态和构建器 interop。 |
| **移除依赖，直接 `manipulateOptions` 注入 `jsx`** | 最优。一处源码修复，CJS/ESM 都不需要处理第三方 interop。           |

当前 compiler package 的依赖里也已经没有 `@babel/plugin-syntax-jsx`，只保留了 `@babel/helper-plugin-utils`、`@babel/types`、`@zeus-js/shared` 等依赖。

---

## 4. 推荐最终代码

你当前分支已有实现，但我建议再做一点增强：**让 `parserOpts.plugins` 可选，避免极端情况下 Babel 传入空 parserOpts 导致报错。**

文件：

```txt
packages/core/compiler/src/index.ts
```

推荐最终版：

```ts
import { declare } from '@babel/helper-plugin-utils'

import { resolveConfig, type CompilerOptions } from './config'
import { createVisitor } from './visitor'

import type { BabelPlugin } from './types'

type ParserPlugin = string | [string, ...unknown[]]

interface ParserOptions {
  plugins?: ParserPlugin[]
}

function hasParserPlugin(
  plugins: readonly ParserPlugin[],
  name: string,
): boolean {
  return plugins.some(
    plugin => (Array.isArray(plugin) ? plugin[0] : plugin) === name,
  )
}

export default declare<CompilerOptions>((api, options): BabelPlugin => {
  api.assertVersion(7)

  const config = resolveConfig(options)

  return {
    name: 'babel-plugin-zeus-compiler',

    manipulateOptions(_opts: unknown, parserOpts: ParserOptions) {
      parserOpts.plugins ??= []

      if (!hasParserPlugin(parserOpts.plugins, 'jsx')) {
        parserOpts.plugins.push('jsx')
      }
    },

    visitor: createVisitor(config),
  }
})

export type { CompilerOptions } from './config'
```

这个版本有几个好处：

1. 没有 `@babel/plugin-syntax-jsx` runtime import。
2. 没有 `inherits`。
3. 不受 CJS `.default` interop 影响。
4. 用户已有 `jsx` parser plugin 时不会重复 push。
5. 对 `parserOpts.plugins` 不存在的情况更稳。

---

## 5. package 清理

文件：

```txt
packages/core/compiler/package.json
```

确认不要出现：

```json
{
  "dependencies": {
    "@babel/plugin-syntax-jsx": "..."
  },
  "devDependencies": {
    "@babel/plugin-syntax-jsx": "..."
  }
}
```

当前分支 compiler package 已经没有这个依赖，这是对的。

根目录也不需要补回 `@babel/plugin-syntax-jsx`，当前 root devDependencies 里也没有这个包。

---

## 6. 测试设计

需要补两类测试：**源码级 transform 测试** 和 **构建后 CJS smoke 测试**。

### 6.1 源码级：不配置 syntax-jsx 也能编译 JSX

新增：

```txt
packages/core/compiler/__tests__/jsx-parser.spec.ts
```

代码草案：

```ts
import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import zeusCompiler from '../src'

describe('compiler JSX parser plugin', () => {
  it('enables JSX syntax without @babel/plugin-syntax-jsx', () => {
    const result = transformSync('const view = <div id="app">hello</div>', {
      filename: 'input.jsx',
      babelrc: false,
      configFile: false,
      plugins: [[zeusCompiler, {}]],
    })

    expect(result?.code).toBeTruthy()
    expect(result?.code).not.toContain('<div')
  })

  it('does not duplicate existing jsx parser plugin', () => {
    const result = transformSync('const view = <span />', {
      filename: 'input.jsx',
      babelrc: false,
      configFile: false,
      parserOpts: {
        plugins: ['jsx'],
      },
      plugins: [[zeusCompiler, {}]],
    })

    expect(result?.code).toBeTruthy()
  })
})
```

这个测试覆盖的是：Zeus compiler 自己能开启 JSX parser，不再靠 `@babel/plugin-syntax-jsx`。

---

### 6.2 构建后：CJS require 不炸

新增脚本：

```txt
scripts/check/check-compiler-cjs.ts
```

代码草案：

```ts
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { transformSync } from '@babel/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')
const require = createRequire(import.meta.url)

const compilerEntry = path.resolve(root, 'packages/core/compiler/index.js')
const zeusCompiler = require(compilerEntry)

const plugin = zeusCompiler.default ?? zeusCompiler

const result = transformSync('const view = <div data-id="ok">ok</div>', {
  filename: 'input.jsx',
  babelrc: false,
  configFile: false,
  plugins: [[plugin, {}]],
})

if (!result?.code) {
  throw new Error('CJS compiler smoke test failed: empty transform result.')
}

if (result.code.includes('<div')) {
  throw new Error('CJS compiler smoke test failed: JSX was not transformed.')
}

console.log('[check-compiler-cjs] ok')
```

然后在 root `package.json` 增加：

```json
{
  "scripts": {
    "check:compiler-cjs": "pnpm build compiler -f cjs && tsx scripts/check/check-compiler-cjs.ts"
  }
}
```

注意：compiler package 的 `require` 入口现在走 `index.js`，再根据 `NODE_ENV` 加载 `dist/compiler.cjs.js` 或 `dist/compiler.cjs.prod.js`。
所以这个 smoke test 必须先 build cjs，再 require `packages/core/compiler/index.js`，这样才能真正验证发布后的 CJS 路径。

---

## 7. 构建配置是否还要改？

基本不用大改。

当前 Rolldown 配置里，CJS 产物输出是：

```ts
cjs: {
  file: resolve(`dist/${name}.cjs.js`),
  format: 'cjs',
}
```

并且 CJS build 会设置 `output.esModule = true`。

这本身不是 bug。bug 的触发点是 compiler 源码中依赖了 `@babel/plugin-syntax-jsx` 的导入形态。既然源码不再导入它，构建配置就不需要为它做专门 interop。

我只建议加一个防回归检查：构建完成后扫描 compiler CJS 产物，确保里面没有 `plugin-syntax-jsx`。

可以放进 `check-compiler-cjs.ts`：

```ts
import fs from 'node:fs'

const cjsFile = path.resolve(
  root,
  'packages/core/compiler/dist/compiler.cjs.js',
)
const code = fs.readFileSync(cjsFile, 'utf-8')

if (code.includes('@babel/plugin-syntax-jsx')) {
  throw new Error(
    'CJS compiler output should not depend on @babel/plugin-syntax-jsx.',
  )
}
```

---

## 8. 发布修复流程

建议这次按 patch/fix 流程发：

```bash
pnpm build compiler -f cjs,esm-bundler
pnpm test-unit -- packages/core/compiler
pnpm check:compiler-cjs
pnpm check
pnpm test-unit
```

如果你要最小验证：

```bash
pnpm build compiler -f cjs
tsx scripts/check/check-compiler-cjs.ts
```

---

## 9. 建议改 issue 状态

这份 issue 里的“长期方案”目前写的是“方案 A：修复构建配置（推荐）”。
我建议改成：

```md
## 最终方案

采用方案 C'：移除 `@babel/plugin-syntax-jsx` runtime 依赖，在 `@zeus-js/compiler` 自身 Babel plugin 中通过 `manipulateOptions` 注入 parser plugin `jsx`。

原因：

- `@babel/plugin-syntax-jsx` 对 Zeus compiler 来说只承担 parser plugin 注入职责。
- Zeus compiler 本身就是 Babel plugin，可以直接注入 `parserOpts.plugins`。
- 避免 CJS/ESM interop 差异导致 `inherits` 为 `undefined`。
- 避免发布包依赖 pnpm patch 或构建器 external 细节。

已实施内容（2026-06-03）：

- `packages/core/compiler/src/index.ts`：移除 `@babel/plugin-syntax-jsx` import，改用 `manipulateOptions` 注入 `'jsx'`，添加 `parserOpts.plugins ??= []` guard 和 `hasParserPlugin` 辅助函数。
- `packages/core/compiler/__tests__/jsx-parser.spec.ts`：新增测试验证 compiler 无需 `@babel/plugin-syntax-jsx` 也能编译 JSX。
- `scripts/check/check-compiler-cjs.ts`：新增 CJS 构建后 smoke test，验证 CJS 产物不含 `syntax-jsx` 且 transform 正常工作。
- `package.json`：新增 `check:compiler-cjs` 脚本。
```

---

## 10. 推荐 PR / commit

PR title：

```txt
fix(compiler): remove syntax-jsx dependency from Babel plugin entry
```

commit 拆法：

```txt
fix(compiler): enable JSX parser via manipulateOptions
test(compiler): add CJS require smoke test
docs(compiler): document syntax-jsx CJS interop fix
```

最终判断：**当前分支的修复方向是正确的，但需要补 `parserOpts.plugins ??= []` 和 CJS 构建后 smoke test。只改源码不加构建后 require 测试，后面很容易被构建配置或依赖调整重新打穿。**
