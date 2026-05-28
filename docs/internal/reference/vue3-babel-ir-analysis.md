# Vue 3 编译器中的 Babel 与 IR 使用分析

## 一、整体编译架构概述

Vue 3 的编译器分为两大块，各自走不同的技术路线：

| 编译器模块                     | 是否用 Babel                              | 是否用 IR                                     |
| ------------------------------ | ----------------------------------------- | --------------------------------------------- |
| `compiler-core`（传统模式）    | 仅在表达式转换阶段少量使用                | **不使用** — AST 直接作为 codegen 输入        |
| `compiler-sfc`（SFC 编译）     | 是，用 `@babel/parser` 解析 `<script>` 块 | **不使用**                                    |
| `compiler-vapor`（Vapor 模式） | 仅处理 JS 表达式时用 Babel AST            | **大量使用** — 有独立的 `ir/` 目录专门定义 IR |

---

## 二、Babel 的使用场景

### 2.1 Babel 出现的具体位置

Babel 在 Vue 3 中扮演的是**辅助工具**角色，并非编译主力。主要是以下两处：

#### 场景一：`compiler-sfc` 解析 `<script>` 块

`@vue/compiler-sfc` 的 `compileScript` 函数在编译 `<script>` 和 `<script setup>` 块时，需要把 JavaScript/TypeScript 代码解析成 AST。这个解析器就是 `@babel/parser`。

```typescript
// packages/compiler-sfc/src/script/context.ts
import { parse as babelParse } from '@babel/parser'

// 解析 script 块内容
const ast = babelParse(scriptContent, {
  sourceType: 'module',
  plugins: babelParserPlugins, // 可配置：['typescript', 'jsx', 'decorators-legacy', ...]
})
```

用途包括：

- 解析 `defineProps`、`defineEmits`、`defineExpose` 等宏调用
- 分析 `import` / `export` 语句
- 处理 `with` 作用域代理（将模板中的变量如 `count` 映射为 `ctx.count`）

#### 场景二：`compiler-core` 中的 `babelUtils.ts`

在 `compiler-core/src/babelUtils.ts` 中定义了两个核心工具函数，用于在**表达式转换阶段**遍历 Babel AST：

##### `walkIdentifiers` — 遍历 Babel AST 中的标识符

```typescript
// compiler-core/src/babelUtils.ts
export function walkIdentifiers(
  root: BabelNode, // Babel AST 节点
  onIdentifier: (
    // 遍历到每个标识符时的回调
    node: BabelNodeIdentifier,
    parent: BabelNode,
    parentStack: BabelNode[],
    isReference: boolean,
    isLocal: boolean,
  ) => void,
  includeAll = false, // 是否处理所有标识符，还是仅处理引用
)
```

这个函数用来：

- 识别模板中哪些变量是**引用**（需要加 `_ctx.` 前缀），哪些是**局部声明**
- 追踪 `v-for` 的迭代变量、`v-slot` 的插槽参数等
- 支持解构模式、函数参数、块级 `const/let` 等作用域分析

##### `isReferencedIdentifier` — 判断标识符是否被引用

```typescript
export function isReferencedIdentifier(
  node: BabelNode,
  parent: BabelNode,
  parentStack: BabelNode[],
): boolean
```

用于判断一个标识符是在读取还是赋值，以便决定是否需要加 `_ctx.` 前缀。

**Babel 在此的角色**：Vue 3 的模板编译器并不自己解析 JS 表达式，而是借助 Babel 将 `\{\{ foo + bar() \}\}` 这样的插值表达式解析成 Babel AST，然后用 `estree-walker` 遍历它，再把 Vue 自己的作用域规则应用到 Babel AST 上。

---

## 三、IR 的使用情况

### 3.1 传统模式（`compiler-core`）：没有独立的 IR

在 Vue 3 传统的 Virtual DOM 渲染模式下，编译链路是：

```
模板字符串
    │
    ▼
compiler-core 解析器（自定义正则 + 手写递归下降）
    │  → 生成 Vue 自己定义的 AST（RootNode, ElementNode, TextNode, ...）
    ▼
compiler-core 转换器（transforms/）
    │  → AST → 另一套 AST（codegen 节点：VNodeCall, JS_CALL_EXPRESSION, ...）
    ▼
compiler-core 代码生成器（codegen.ts）
    │  → 直接把 codegen AST 节点打印成 JS 代码字符串
    ▼
render function / h() 调用
```

**关键点**：在传统模式中，codegen 用的 AST 节点（如 `VNodeCall`、`JS_CALL_EXPRESSION`）本质上是**另一种形式的 IR**，但 Vue 并没有把它抽象成独立的 `ir/` 模块。codegen 直接在 `codegen.ts` 中通过 switch-case 模式匹配这些节点并拼接代码字符串。

```typescript
// compiler-core/src/codegen.ts（传统模式 codegen）
export function generate(
  ast: RootNode,
  options: CodegenOptions,
): CodegenResult {
  const context = createCodegenContext(source, options)
  genFunctionPreamble(context, ast) // 生成 import / helpers
  genBody(ast, context) // 生成 render 函数体
  // ...
}
```

codegen 节点被定义在 `ast.ts` 的 `NodeTypes` 枚举末尾段：

```typescript
// compiler-core/src/ast.ts
export enum NodeTypes {
  // ... Plain nodes
  // ... Container nodes
  // codegen 节点
  VNODE_CALL,
  JS_CALL_EXPRESSION,
  JS_OBJECT_EXPRESSION,
  JS_PROPERTY,
  JS_ARRAY_EXPRESSION,
  JS_FUNCTION_EXPRESSION,
  JS_CONDITIONAL_EXPRESSION,
  JS_CACHE_EXPRESSION,
  // ssr codegen 节点
  JS_BLOCK_STATEMENT,
  JS_TEMPLATE_LITERAL,
  JS_IF_STATEMENT,
  JS_ASSIGNMENT_EXPRESSION,
  JS_SEQUENCE_EXPRESSION,
  JS_RETURN_STATEMENT,
}
```

这些节点在 `transform` 阶段由 `transform.ts` 中的各个 transform 函数生成，然后在 `codegen.ts` 中被消费。**这是一种隐式 IR**。

### 3.2 Vapor 模式（`compiler-vapor`）：有独立的 IR 层

Vue 3 的 Vapor 模式（无 Virtual DOM 的编译优化路径）引入了显式的、独立的 IR 层。IR 在 `compiler-vapor/src/ir/` 目录下有专门的定义文件。

#### 为什么 Vapor 需要显式 IR？

传统模式中 AST 直接映射到 codegen 节点的方式，对于 Vapor 模式不再够用。Vapor 模式的输出目标是细粒度的 DOM 操作（如 `set_text`、`insert_node`），而不是 `h()` 调用。因此需要一个中间层来：

1. **屏蔽**模板 AST 的复杂性
2. **表达** Vapor 特有的语义（effects、operations、blocks）
3. **解耦**变换阶段和代码生成阶段

#### IR 的结构

```typescript
// compiler-vapor/src/ir/index.ts
export interface RootIRNode {
  type: IRNodeTypes.ROOT
  node: RootNode // Vue 标准模板 AST
  source: string
  template: string[] // 提取出的静态模板字符串数组
  component: Set<string>
  directive: Set<string>
  block: BlockIRNode // 核心：Vapor 的执行单元
}

export interface BlockIRNode {
  type: IRNodeTypes.BLOCK
  node: RootNode | TemplateChildNode
  dynamic: IRDynamicInfo // 动态节点树（带 flag 标记静态/动态）
  effect: IREffect[] // 响应式副作用
  operation: OperationNode[] // DOM 操作
  returns: number[] // 返回的节点引用
}
```

#### Vapor IR 与 codegen 的关系

```
模板 AST（compiler-core 的 RootNode）
    │
    ▼  transform() 函数转换
Vapor IR（RootIRNode / BlockIRNode）
    │
    ▼  generate() 函数
最终 JS 代码
```

codegen 通过 `genBlockContent` → `genOperations` + `genEffects` + `genChildren` 将 IR 逐层展开为代码：

```typescript
// compiler-vapor/src/generators/block.ts
export function genBlockContent(block: BlockIRNode, context, root?) {
  // 1. 生成子节点
  for (const child of block.dynamic.children) {
    push(...genChildren(child, context, child.id!))
  }
  // 2. 生成 DOM 操作（SET_TEXT, INSERT_NODE, ...）
  push(...genOperations(operation, context))
  // 3. 生成响应式副作用
  push(...genEffects(effect, context))
  // 4. 生成 return
  push(NEWLINE, `return `)
  // ...
}
```

IR 中的 `OperationNode` 覆盖了所有 Vapor 特有的操作：

| IR 节点                            | 含义             |
| ---------------------------------- | ---------------- |
| `SET_TEXT`                         | 设置文本节点内容 |
| `SET_PROP`                         | 设置元素属性     |
| `SET_DYNAMIC_PROPS`                | 批量设置动态属性 |
| `SET_EVENT` / `SET_DYNAMIC_EVENTS` | 绑定事件         |
| `SET_HTML`                         | 设置 innerHTML   |
| `SET_TEMPLATE_REF`                 | 设置模板 ref     |
| `SET_MODEL_VALUE`                  | v-model 双向绑定 |
| `CREATE_TEXT_NODE`                 | 创建文本节点     |
| `INSERT_NODE` / `PREPEND_NODE`     | 插入节点         |
| `IF` / `FOR`                       | 条件/循环操作    |
| `CREATE_COMPONENT_NODE`            | 创建组件节点     |
| `SLOT_OUTLET_NODE`                 | 插槽操作         |

---

## 四、总结对比

### 4.1 Babel 在 Vue 3 中的定位

```
定位：辅助工具（不是主力）
作用域：
  1. compiler-sfc → 解析 <script> 块的 JS/TS 代码
  2. compiler-core → 解析模板中的 JS 表达式（通过 @babel/parser）
  3. 表达式转换 → 遍历 Babel AST 做作用域分析（walkIdentifiers）
工具：@babel/parser + @babel/types + estree-walker
```

### 4.2 IR 在 Vue 3 中的定位

```
传统模式（VNode渲染）：隐式 IR = codegen AST 节点，定义在 ast.ts 的 NodeTypes 末尾段
Vapor模式（无VNode）：显式 IR，有独立 ir/index.ts，结构为 RootIRNode → BlockIRNode → Operations/Effects
```

### 4.3 关键差异

| 维度             | 传统 Vue 3                        | Vapor 模式 Vue 3                                  |
| ---------------- | --------------------------------- | ------------------------------------------------- |
| Babel 用途       | JS 表达式解析 + 作用域分析        | 同左（共用 compiler-core）                        |
| 是否有独立 IR 层 | 无（codegen AST 即隐式 IR）       | 有（`compiler-vapor/src/ir/`）                    |
| IR 节点示例      | VNodeCall, JS_FUNCTION_EXPRESSION | SET_TEXT, INSERT_NODE, BlockIRNode                |
| codegen 输入     | 转换后的 Vue AST                  | Vapor IR                                          |
| 输出目标         | `h(tag, props, children)` 调用树  | 精确的 `_template()` + `_set_text()` 等细粒度操作 |

### 4.4 设计启示

Vue 3 的编译器设计体现了两种路线的演进：

- **传统模式**：轻量级设计，AST 和 codegen 节点边界模糊，没有额外抽象层，换来的是简单和可控。
- **Vapor 模式**：为了支撑无 VNode 的细粒度 DOM 操作，引入了独立的 IR 层作为变换与生成之间的缓冲带，使得 compiler-vapor 可以独立演进而不污染 compiler-core。

这也印证了 Zeus 项目 AGENTS.md 中的设计思路：独立的 IR 层（Zeus IR）是必要的，它让编译器后续迁移到 Rust、引入 SSR、或扩展 Web Components 支持时，都不需要改动核心语义定义。
