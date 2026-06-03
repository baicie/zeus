# Issue 001：@babel/plugin-syntax-jsx CJS 导入兼容性问题

## 摘要

`@zeus-js/compiler@0.1.0-alpha.1` 的 CJS 构建产物中使用了 `SyntaxJSX__namespace.default`（ESM 命名空间导入语法），但 `@babel/plugin-syntax-jsx` 在 CJS 环境下的导出是函数本身，不存在 `.default` 属性。导致编译器包在作为 CJS 模块被消费时，`inherits` 字段为 `undefined`，破坏 Babel plugin 的实例化。

---

## 详细描述

### 问题现象

当消费端以 CJS 方式引入 `@zeus-js/compiler` 时：

```ts
// 消费端 (CJS)
const zeusCompiler = require('@zeus-js/compiler')
// zeusCompiler 内部的 Babel plugin 代码等价于：
//   const plugin = SyntaxJSX__namespace.default
//   但 SyntaxJSX__namespace.default === undefined
// 结果：plugin.inherits === undefined，Babel plugin 实例化失败
```

典型错误堆栈类似：

```
TypeError: Cannot read property 'inherits' of undefined
    at Object.<anonymous> (...node_modules/@zeus-js/compiler/dist/cjs/index.js)
```

### 根因分析

1. `@babel/plugin-syntax-jsx` 的 CJS 入口（`package.json` 中 `main` 字段）直接返回函数本身：

   ```js
   // @babel/plugin-syntax-jsx/lib/index.js (CJS 入口)
   module.exports = function (api, options) { ... }
   ```

2. Zeus 编译器源码中使用 ESM 风格导入：

   ```ts
   import * as SyntaxJSX__namespace from '@babel/plugin-syntax-jsx'
   ```

3. 在 ESM 环境下，`import * as ns from 'cjs-module'` 会把 module.exports 函数包装成 **default export**，所以 `ns.default` 正确指向该函数。

4. 但在 CJS 环境下，`import * as ns from 'cjs-module'` 时：
   - `ns` 直接就是 `module.exports` 的值（即那个函数本身）
   - `ns.default` 不存在（`undefined`）
   - 而 Zeus 编译器 CJS 构建产物仍然保留了 `import * as SyntaxJSX__namespace` 的语法，导致访问 `.default` 时得到 `undefined`

5. 最终，`zeusCompiler` 内部引用 `@babel/plugin-syntax-jsx` 时：

   ```js
   // dist/cjs/index.js 中等价的代码
   var SyntaxJSX__namespace = _interopNamespace(
     require('@babel/plugin-syntax-jsx'),
   )
   // _interopNamespace 在 CJS 下的行为导致 .default === undefined
   var plugin = SyntaxJSX__namespace.default
   // plugin === undefined → plugin.inherits === undefined
   ```

### 受影响版本

- `@zeus-js/compiler@0.1.0-alpha.1`（当前发版版本）
- 可能所有依赖 Rollup/Vite 等工具链将 ESM import 语法降级为 CJS 的构建产物

### 受影响场景

- 消费端使用 CommonJS (`require`) 加载编译器
- 消费端使用 Webpack (非 ESM mode) 构建
- 任何不经过 Babel 的直接 CJS 引用路径

---

## 当前临时方案

使用 `pnpm patch` 机制为 `@babel/plugin-syntax-jsx` 添加 CJS 兼容层补丁：

```bash
pnpm patch @babel/plugin-syntax-jsx
# 修改后：
# - ESM 入口 (exports.module) 返回 { default: fn }
# - CJS 入口 (exports.default) 返回 fn
```

---

## 建议的长期方案（按优先级）

### 方案 A：修复构建配置（推荐）

修改 `@zeus-js/compiler` 的 Rollup 构建配置，确保 `@babel/plugin-syntax-jsx` 被正确 external 且构建产物不依赖 ESM `import * as` 降级。

具体方向：

- 将 `@babel/plugin-syntax-jsx` 放入 `external` 列表
- 检查 Rollup 降级 CJS 时是否正确处理 `import * as ns from 'cjs-module'`
- 考虑使用 `@rollup/plugin-swc` 或 `rollup-plugin-babel` 的高级配置来保留正确的 CJS 引用语义

### 方案 B：修改源码导入方式

在 `@zeus-js/compiler` 源码中，将：

```ts
import * as SyntaxJSX__namespace from '@babel/plugin-syntax-jsx'
```

改为：

```ts
import SyntaxJSX from '@babel/plugin-syntax-jsx'
```

或在构建时通过 Babel 插件（如 `@babel/plugin-transform-modules-commonjs`）确保 CJS 降级后的引用路径正确。

### 方案 C：不再直接依赖 @babel/plugin-syntax-jsx

考虑在 Zeus 编译器内部自行处理 JSX 语法识别（通过 Babylon/Acorn 的 JSX plugin），或使用 Babel 的 standalone parser preset，减少对第三方插件 CJS 兼容性的依赖。

---

## 相关上下文

- 参考 Babel 文档：[Using the pipeline operator](https://babeljs.io/docs/en/babel-plugin-proposal-pipeline-operator) 中关于 CJS 导入的说明
- 参考 rollup 文档：[Converting-CommonJS-Plugins](https://rollupjs.org/guide/en/#converting-commonjs-plugins)

---

## 状态

- **状态**：已记录
- **临时方案**：pnpm patch（进行中）
- **长期方案**：待定（方案 A 最优）
- **严重性**：中（阻断 CJS 消费路径，ESM 不受影响）
- **发现日期**：2026-06-03
