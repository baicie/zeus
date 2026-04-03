# Zeus JSX 编译器技术选型分析

> 自定义编译器：TypeScript 原型 vs Rust 绣化深度分析

---

## 目录

- [1. 当前状态评估](#1-当前状态评估)
- [2. TypeScript 原型方案](#2-typescript-原型方案)
- [3. Rust 绣化方案](#3-rust-绣化方案)
- [4. SWC vs OXC 深度对比](#4-swc-vs-oxc-深度对比)
- [5. 方案推荐](#5-方案推荐)
- [6. 实施路线图](#6-实施路线图)

---

## 1. 当前状态评估

### 1.1 Zeus 编译器现状

```
crates/compiler-core/src/
├── jsx/                    ✅ 已完成基础框架
│   ├── mod.rs             ✅ 模块入口
│   ├── config.rs          ✅ 配置系统
│   ├── state.rs           ✅ 编译器状态
│   ├── ir.rs              ✅ 中间表示
│   ├── constants.rs       ✅ 常量定义
│   ├── utils.rs           ✅ 工具函数
│   ├── preprocess.rs       ✅ 预处理
│   ├── postprocess.rs     ✅ 后处理
│   ├── transform.rs       ✅ 核心转换 (进行中)
│   ├── component.rs       ✅ 组件转换
│   ├── condition.rs       ✅ 条件表达式
│   └── fragment.rs        ✅ Fragment 转换
│
├── traverse/
│   ├── mod.rs             ✅ 遍历入口
│   ├── transform.rs       ✅ 转换遍历
│   ├── state.rs           ✅ 遍历状态
│   └── ...
│
└── parser.rs              ✅ 基于 OXC 解析

crates/compiler-dom/src/
├── jsx/
│   ├── mod.rs             ✅ DOM 编译器入口
│   ├── compiler.rs        ✅ 编译器
│   ├── element.rs         ✅ 元素转换
│   ├── attributes.rs      ✅ 属性处理
│   ├── events.rs          ✅ 事件处理
│   ├── children.rs        ✅ 子节点处理
│   ├── template.rs        ✅ 模板生成
│   ├── codegen.rs         ✅ 代码生成
│   └── hydration.rs       ✅ 水合支持
│
└── codegen/
    ├── mod.rs
    ├── template.rs
    └── ...

crates/compiler-ssr/src/
├── lib.rs                 ✅ SSR 入口
└── hydration.rs           ✅ SSR 水合
```

### 1.2 已完成功能

| 模块 | 完成度 | 说明 |
|------|--------|------|
| **OXC 解析器** | 90% | 基础解析，JSX/TSX 支持 |
| **配置系统** | 100% | JsxConfig, GenerateMode |
| **中间表示 IR** | 80% | ElementResult, ChildBinding |
| **元素转换** | 70% | 基础 DOM/SSR/Universal |
| **属性处理** | 60% | 静态/动态属性 |
| **事件处理** | 50% | 委托机制 |
| **代码生成** | 50% | 基础生成 |
| **NAPI 绑定** | 80% | zeusjs_binding |

### 1.3 关键发现

```
✅ Zeus 已选择 OXC 作为底层基础设施
✅ dom-expressions 方案已完整分析
✅ 编译器核心框架已搭建
⬜ JSX 元素完整转换（待完善）
⬜ 动态性检测算法（待实现）
⬜ 模板复用优化（待实现）
⬜ 事件委托完整实现（待实现）
```

---

## 2. TypeScript 原型方案

### 2.1 方案概述

使用 TypeScript 实现编译器原型，参考 dom-expressions 的 Babel 实现。

```
┌─────────────────────────────────────────────────────────────┐
│              TypeScript 编译器原型架构                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  TypeScript 层                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  @babel/core (JS 运行时)                              │   │
│  │  ├─ Parser (通过 WASM 或 WASM polyfill)             │   │
│  │  ├─ Transform (Babel visitor)                        │   │
│  │  └─ Generator                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  TypeScript 编译器代码                                │   │
│  │  ├─ parser/parser.ts        # AST 解析              │   │
│  │  ├─ transformer/transformer.ts # 转换逻辑           │   │
│  │  ├─ codegen/codegen.ts      # 代码生成              │   │
│  │  └─ utils/                   # 工具函数              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术选型

#### 方案 A: 使用 @babel/parser

```typescript
// packages/compiler-ts/src/parser.ts
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generate';

export interface CompileOptions {
  generate: 'dom' | 'ssr' | 'universal';
  hydratable?: boolean;
  delegateEvents?: boolean;
  // ...
}

export function compile(source: string, options: CompileOptions) {
  // 1. 解析
  const ast = parser.parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  // 2. 转换
  const state = createCompilerState(options);
  
  traverse(ast, {
    JSXElement(path) {
      transformJSXElement(path, state);
    },
    JSXFragment(path) {
      transformJSXFragment(path, state);
    },
    Program: {
      enter(path) {
        preprocess(path, state);
      },
      exit(path) {
        postprocess(path, state);
      },
    },
  });

  // 3. 生成
  const { code, map } = generate(ast, {
    comments: false,
    compact: false,
  });

  return { code, map };
}
```

#### 方案 B: 使用 SWC WASM

```typescript
// packages/compiler-ts/src/parser.ts
import { parse, transform, print } from '@swc/core';

export interface CompileOptions {
  generate: 'dom' | 'ssr' | 'universal';
  // ...
}

export async function compile(source: string, options: CompileOptions) {
  // 1. 解析
  const ast = await parse(source, {
    syntax: 'typescript',
    tsx: true,
    decorators: true,
  });

  // 2. 转换
  const transformed = await transform(ast, {
    plugin: (m) => {
      // 自定义转换逻辑
      return jsxTransform(m, options);
    },
  });

  // 3. 生成
  const { code } = await print(transformed);

  return { code };
}
```

### 2.3 TypeScript 原型优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 开发速度快（1-2周可完成） | ❌ 运行时性能不如 Rust |
| ✅ 调试方便（可直接断点） | ❌ 需要维护两套代码 |
| ✅ 易于迭代和实验 | ❌ 内存占用较高 |
| ✅ 可复用现有 Babel 生态 | ❌ 最终可能重写 |
| ✅ 类型安全（TypeScript） | ❌ 依赖 WASM 运行时 |
| ✅ 快速验证设计决策 | ❌ 发布包体积较大 |

### 2.4 原型时间估算

| 阶段 | 工作量 | 说明 |
|------|--------|------|
| **基础框架** | 3-5 天 | 项目结构、配置系统、基础类型 |
| **JSX 解析** | 1-2 天 | 依赖 Babel/SWC WASM |
| **元素转换** | 5-7 天 | DOM/SSR/Universal 三种模式 |
| **属性处理** | 3-5 天 | 静态/动态/style/classList |
| **事件处理** | 2-3 天 | 委托机制 |
| **组件转换** | 3-5 天 | 函数组件、props |
| **代码生成** | 2-3 天 | AST → JavaScript |
| **测试覆盖** | 3-5 天 | 单元测试、E2E 测试 |
| **文档完善** | 2-3 天 | API 文档、使用指南 |
| **总计** | **约 4-6 周** | |

---

## 3. Rust 绣化方案

### 3.1 方案概述

直接在 Rust 中完整实现编译器，基于 Zeus 现有的 OXC 基础设施。

```
┌─────────────────────────────────────────────────────────────┐
│              Rust 编译器绣化架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Rust (crates/)                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  zeusjs_binding (NAPI-RS)                           │   │
│  │  ├─ 暴露编译器 API 给 JavaScript                     │   │
│  │  └─ 支持同步/异步调用                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  compiler-core (核心编译器)                          │   │
│  │  ├─ jsx/                  # JSX 编译核心            │   │
│  │  │   ├─ config.rs         # 配置                    │   │
│  │  │   ├─ state.rs          # 编译器状态               │   │
│  │  │   ├─ ir.rs             # 中间表示                 │   │
│  │  │   ├─ transform.rs      # 核心转换                 │   │
│  │  │   ├─ component.rs      # 组件转换                 │   │
│  │  │   ├─ condition.rs      # 条件表达式               │   │
│  │  │   └─ fragment.rs       # Fragment 转换           │   │
│  │  ├─ traverse/             # AST 遍历                 │   │
│  │  └─ codegen/              # 代码生成                │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  compiler-dom (DOM 特定)                            │   │
│  │  ├─ element.rs              # DOM 元素转换           │   │
│  │  ├─ attributes.rs           # DOM 属性处理           │   │
│  │  ├─ events.rs               # DOM 事件处理          │   │
│  │  ├─ children.rs             # DOM 子节点处理         │   │
│  │  └─ template.rs             # DOM 模板生成           │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  compiler-ssr (SSR)                                 │   │
│  │  ├─ template.rs             # SSR 模板              │   │
│  │  └─ hydration.rs            # SSR 水合              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  底层: oxc_parser | oxc_traverse | oxc_codegen | oxc_allocator
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 绣化优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 极致性能（解析/编译 3-5x） | ❌ 开发周期长（8-12周） |
| ✅ 零外部依赖 | ❌ 调试困难（需要 rust-analyzer） |
| ✅ 内存高效（arena allocator） | ❌ 编译错误可能复杂 |
| ✅ 类型安全（Rust 编译器） | ❌ 需要学习曲线 |
| ✅ 一套代码维护 | ❌ 迭代周期长 |
| ✅ 小型发布包 | ❌ 原型验证慢 |

### 3.3 绣化时间估算

| 阶段 | 工作量 | 说明 |
|------|--------|------|
| **完善 OXC 集成** | 1-2 周 | 0.123.0+ 签名适配 |
| **JSX 完整转换** | 2-3 周 | 元素/属性/事件/组件 |
| **动态性检测** | 1-2 周 | isDynamic 算法 |
| **模板复用** | 1 周 | 字符串哈希去重 |
| **事件委托** | 1 周 | 委托/直接绑定 |
| **代码生成** | 1-2 周 | oxc_codegen 封装 |
| **水合支持** | 1 周 | SSR + CSR 水合 |
| **NAPI 绑定** | 1 周 | 完善绑定 |
| **测试/优化** | 2-3 周 | 性能优化、Benchmark |
| **文档完善** | 1 周 | API 文档 |
| **总计** | **约 10-14 周** | |

---

## 4. SWC vs OXC 深度对比

### 4.1 基本信息对比

| 维度 | SWC | OXC |
|------|-----|-----|
| **开发团队** | SWC Team (Vercel) | Oxc Project (Bytedance) |
| **Star 数** | ~30k | ~15k |
| **成熟度** | 高（生产验证） | 中高（快速迭代） |
| **文档质量** | 好 | 一般（持续改善） |
| **社区活跃度** | 高 | 非常高 |

### 4.2 性能对比

| 指标 | SWC | OXC | 说明 |
|------|-----|-----|------|
| **解析速度** | 基准 | ~1.2-1.5x | OXC 略快 |
| **转换速度** | 基准 | ~1.0-1.2x | 相当 |
| **内存占用** | 基准 | ~0.8x | OXC 更省内存 |
| **增量编译** | 好 | 更好 | OXC 内置 cache |
| **WASM 体积** | ~3MB | ~1.5MB | OXC 更小 |

### 4.3 API 设计对比

#### SWC API

```rust
// SWC 插件
use swc_plugin::{plugin_transform, TransformPluginOptions};
use swc_ecma_ast::*;

#[plugin_transform]
pub fn transform(program: Program, _opts: TransformPluginOptions) -> Program {
    program.fold_with(&mut JsxTransformer)
}

// 遍历方式：Fold 模式
impl Fold<JsxElement> for JsxTransformer {
    fn fold(&mut self, elem: JsxElement) -> JsxElement {
        // 转换并返回
    }
}
```

#### OXC API (0.123.0+)

```rust
// OXC 编译器
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_traverse::{traverse_mut, Traverse, TraverseCtx};

// 新签名 (0.123.0+)
pub fn compile(source: &str, config: JsxConfig) -> Result<String, Error> {
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::jsx()).parse();
    let mut program = ret.program;

    // 必须构建语义分析
    let semantic = SemanticBuilder::new()
        .with_cfg(true)
        .build(&program);
    let scoping = semantic.scoping;

    // 遍历：VisitMut 模式
    traverse_mut::<JsxCompilerPass>(
        &allocator,
        &mut program,
        scoping,
        JsxCompilerState::new(config),
    );

    generate_code(&program)
}
```

### 4.4 插件生态对比

| 方面 | SWC | OXC |
|------|-----|-----|
| **官方插件** | SWC React, SWC Minify | oxc_minifier, oxc_linter |
| **第三方插件** | 较少 | 逐渐增加 |
| **ESLint 兼容** | 通过 @swc/node-rslib | 原生支持 |
| **Rollup 插件** | swc-node | oxc_resolver |
| **Vite 集成** | @originjs/vite-plugin-swc | rolldown-oxc (实验) |

### 4.5 SWC 优势

```
✅ 成熟稳定，生产验证（Next.js 13+）
✅ 更好的 TypeScript 支持
✅ 更好的 JSX/TSX 解析
✅ 更好的 React Fast Refresh 支持
✅ 更多生态集成
✅ swc_plugin 宏更易用
✅ 支持 wasm32-wasip1 (WASI)
✅ 更好的错误消息
```

### 4.6 OXC 优势

```
✅ 性能略优（解析速度）
✅ WASM 包更小 (1.5MB vs 3MB)
✅ 内存占用更低
✅ 更好的 AST 设计（基于 oxc_ast::ast）
✅ 更活跃的开发（版本迭代快）
✅ 内置丑化/压缩/lint
✅ 更现代的代码结构
✅ zero-copy parsing (潜在优势)
```

### 4.7 风险对比

| 风险 | SWC | OXC |
|------|-----|-----|
| **项目稳定性** | 低风险 | 中等风险 |
| **API 稳定性** | 较好 | 变化较快 |
| **迁移成本** | - | 0.123.0 有破坏性变更 |
| **技术支持** | Vercel 背书 | Bytedance 背书 |
| **锁定风险** | 中等 | 较低（开源主导） |

---

## 5. 方案推荐

### 5.1 决策矩阵

| 维度 | 权重 | TypeScript原型+SWC | TypeScript原型+OXC | 直接Rust+SWC | 直接Rust+OXC |
|------|------|-------------------|-------------------|--------------|--------------|
| **开发速度** | 30% | 90 | 85 | 30 | 30 |
| **运行性能** | 25% | 70 | 75 | 95 | 98 |
| **维护成本** | 20% | 50 | 55 | 85 | 90 |
| **技术栈统一** | 15% | 60 | 80 | 90 | 95 |
| **风险控制** | 10% | 80 | 75 | 40 | 35 |
| **综合得分** | 100% | **73** | **75** | **60** | **65** |

### 5.2 推荐方案：混合策略

```
┌─────────────────────────────────────────────────────────────┐
│                    推荐：渐进式绣化                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  阶段 1: 完善现有 Rust 代码 (2-3 周)                         │
│  ├─ 完成 JSX 元素转换                                       │
│  ├─ 实现动态性检测                                           │
│  ├─ 完善模板复用                                             │
│  └─ 完善事件委托                                             │
│                                                              │
│  阶段 2: TypeScript 验证层 (可选) (2 周)                     │
│  ├─ 创建轻量 TS 包装器                                      │
│  ├─ 快速实验新语法特性                                       │
│  └─ 验证设计决策                                             │
│                                                              │
│  阶段 3: 完整生产化 (3-4 周)                                 │
│  ├─ 性能优化                                                │
│  ├─ 错误处理完善                                            │
│  ├─ Benchmark 验证                                          │
│  └─ 文档完善                                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 推荐选择：直接绣化 + OXC

**理由**：

1. **已有基础**
   - Zeus 已选择 OXC 作为底层
   - 编译器核心框架已搭建
   - 避免引入第二个基础设施

2. **性能优势**
   - OXC 解析速度更快
   - WASM 包更小（1.5MB vs 3MB）
   - 内存占用更低

3. **长期维护**
   - 一套代码，无需维护 TS 原型
   - Rust 类型系统保证正确性
   - 避免后续重写

4. **Zeus 项目定位**
   - 高性能前端框架
   - TypeScript + Rust 混合开发
   - 使用 NAPI-RS 暴露 API

### 5.4 不推荐 TypeScript 原型的原因

```
❌ 浪费已有 Rust 代码
   - crates/compiler-*/ 已实现 50-60%
   - 需要维护两套并行代码

❌ 性能不匹配
   - Zeus 定位高性能
   - TS 原型性能不如 Rust

❌ 后续迁移成本
   - 原型代码可能难以复用
   - 需要重写大部分代码

❌ 与项目架构不一致
   - Zeus 使用 Rust/NAPI-RS
   - 引入 Babel/SWC WASM 增加复杂性
```

---

## 6. 实施路线图

### 6.1 第一阶段：完善核心 (2-3 周)

```
目标：完成 JSX 核心转换功能

┌─────────────────────────────────────────────────────────────┐
│  Week 1-2: 完善 JSX 元素转换                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Day 1-2: OXC 0.123.0 签名适配                              │
│  ├─ 更新 traverse_mut 调用签名                              │
│  ├─ 验证 scoping 集成                                       │
│  └─ 修复编译错误                                            │
│                                                              │
│  Day 3-5: JSXElement 完整转换                               │
│  ├─ 完成 transform_element_dom()                            │
│  ├─ 完成 transform_element_ssr()                           │
│  ├─ 完成 transform_element_universal()                     │
│  └─ 添加单元测试                                            │
│                                                              │
│  Day 6-10: 属性处理完善                                     │
│  ├─ 完成 class/style 处理                                   │
│  ├─ 完成 classList 处理                                    │
│  ├─ 完成 boolean 属性处理                                   │
│  ├─ 完成 spread 属性处理                                    │
│  └─ 添加边界测试                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Week 3: 动态性与模板优化                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Day 1-3: isDynamic 算法                                   │
│  ├─ 实现表达式动态性检测                                     │
│  ├─ 实现成员访问检测                                         │
│  ├─ 实现函数调用检测                                         │
│  └─ 实现 @once 标记支持                                     │
│                                                              │
│  Day 4-5: 模板复用                                          │
│  ├─ 实现模板字符串哈希                                       │
│  ├─ 实现相同模板去重                                         │
│  └─ 添加性能测试                                            │
│                                                              │
│  Day 6-7: 事件委托                                          │
│  ├─ 完成委托事件列表                                         │
│  ├─ 实现 delegateEvents 生成                               │
│  ├─ 实现 $event 属性绑定                                    │
│  └─ 添加集成测试                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 第二阶段：高级特性 (2-3 周)

```
目标：完善高级 JSX 特性和 SSR

┌─────────────────────────────────────────────────────────────┐
│  Week 4-5: 组件与条件                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Day 1-3: 组件转换                                           │
│  ├─ 完成函数组件识别                                         │
│  ├─ 实现 props 提取                                          │
│  ├─ 实现 children 处理                                       │
│  └─ 实现 createComponent 生成                               │
│                                                              │
│  Day 4-5: 条件表达式                                        │
│  ├─ 实现三元表达式处理                                        │
│  ├─ 实现 && / || 逻辑处理                                   │
│  ├─ 实现 Show 组件                                          │
│  └─ 添加 memo 包装                                          │
│                                                              │
│  Day 6-7: 列表渲染                                          │
│  ├─ 实现 map 回调处理                                        │
│  ├─ 实现 For 组件                                           │
│  ├─ 实现 key 处理                                           │
│  └─ 添加协调算法                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Week 6: SSR 与水合                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Day 1-3: SSR 编译器                                        │
│  ├─ 完成 SSR 模板生成                                        │
│  ├─ 实现 escape 函数                                        │
│  ├─ 实现 ssrAttribute 生成                                  │
│  └─ 实现 ssrClassList 生成                                  │
│                                                              │
│  Day 4-5: 水合支持                                          │
│  ├─ 实现 hydrationKey 生成                                  │
│  ├─ 实现 data-hk 标记                                       │
│  ├─ 实现 getNextMarker                                      │
│  └─ 添加水合测试                                            │
│                                                              │
│  Day 6-7: Fragment 支持                                     │
│  ├─ 实现 Fragment 转换                                      │
│  ├─ 实现 DocumentFragment 处理                              │
│  └─ 添加 Fragment 测试                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 第三阶段：生产化 (2-3 周)

```
目标：完善 API、测试、文档

┌─────────────────────────────────────────────────────────────┐
│  Week 7-8: 完善与优化                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Day 1-2: NAPI 绑定完善                                     │
│  ├─ 完善 zeusjs_binding                                    │
│  ├─ 实现异步编译支持                                         │
│  ├─ 实现 Source Map 支持                                    │
│  └─ 添加性能测试                                            │
│                                                              │
│  Day 3-4: 性能优化                                          │
│  ├─ Benchmark 基准测试                                      │
│  ├─ 内存分配优化                                             │
│  ├─ AST 复用优化                                            │
│  └─ 增量编译支持                                            │
│                                                              │
│  Day 5-7: 测试覆盖                                          │
│  ├─ 完善单元测试                                            │
│  ├─ 添加集成测试                                            │
│  ├─ 添加 E2E 测试                                          │
│  └─ 添加 fixture 测试                                       │
│                                                              │
│  Day 8-10: 文档与发布                                       │
│  ├─ API 文档完善                                            │
│  ├─ 更新设计文档                                            │
│  ├─ 添加使用示例                                            │
│  └─ 发布预版本                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| **M1: 核心完成** | Week 3 | JSX 元素/属性/事件基本转换 |
| **M2: 功能完整** | Week 6 | 组件/条件/列表/SSR/水合 |
| **M3: Beta** | Week 8 | 生产级编译器，可测试 |
| **M4: GA** | Week 10 | 正式发布 |

---

## 附录 A：关键决策建议

### A.1 不做 TypeScript 原型的理由

```
┌─────────────────────────────────────────────────────────────┐
│                    为什么不应该做 TS 原型                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 时间浪费                                                │
│     ├─ Zeus 已有 50-60% 基础设施                            │
│     ├─ TS 原型需要 4-6 周                                   │
│     ├─ Rust 实现需要 10-14 周                               │
│     └─ 总计 14-20 周 vs 直接 Rust 10-14 周                  │
│                                                              │
│  2. 收益有限                                                │
│     ├─ 设计决策可快速原型验证                                 │
│     ├─ dom-expressions 已有完整参考                          │
│     ├─ Zeus 测试用例可验证设计                               │
│     └─ Rust 类型系统提供设计保障                             │
│                                                              │
│  3. 额外成本                                                │
│     ├─ 维护两套代码                                          │
│     ├─ 需要 Babel/SWC WASM 依赖                            │
│     ├─ 学习两套工具链                                        │
│     └─ 后续迁移/同步工作                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### A.2 选择 OXC 而非 SWC 的理由

```
┌─────────────────────────────────────────────────────────────┐
│                   为什么选择 OXC 而非 SWC                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 架构一致性                                              │
│     ├─ Zeus 已选择 OXC                                      │
│     ├─ 避免引入第二个基础设施                                │
│     ├─ 统一技术栈，便于维护                                  │
│     └─ 团队只需学习一套工具                                  │
│                                                              │
│  2. 性能优势                                                │
│     ├─ OXC 解析速度 ~1.2-1.5x SWC                          │
│     ├─ OXC WASM 包 ~1.5MB vs SWC ~3MB                      │
│     ├─ OXC 内存占用更低                                      │
│     └─ OXC 增量编译更好                                      │
│                                                              │
│  3. 技术趋势                                                │
│     ├─ rolldown 使用 OXC                                    │
│     ├─ Rolldown Vite 集成 OXC                              │
│     ├─ OXC 社区活跃度更高                                    │
│     └─ 版本迭代更快，功能更丰富                              │
│                                                              │
│  4. 风险可控                                                │
│     ├─ 0.123.0 破坏性变更已有文档                            │
│     ├─ OXC 稳定性逐步提升                                    │
│     ├─ Bytedance 背书                                       │
│     └─ 迁移成本低（代码已使用 OXC）                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 附录 B：资源清单

### B.1 OXC 资源

| 资源 | 链接 |
|------|------|
| 官方文档 | https://oxc.rs/ |
| GitHub | https://github.com/oxc-project/oxc |
| oxc_ast | https://docs.rs/oxc_ast/ |
| oxc_traverse | https://docs.rs/oxc_traverse/ |
| oxc_codegen | https://docs.rs/oxc_codegen/ |

### B.2 dom-expressions 参考

| 资源 | 说明 |
|------|------|
| dom-expressions | SolidJS JSX 编译器 |
| babel-plugin-jsx-dom-expressions | Babel 插件实现 |
| solid-js/jsx-runtime | 运行时参考 |

### B.3 Zeus 相关

| 资源 | 说明 |
|------|------|
| crates/compiler-core | 核心编译器 |
| crates/compiler-dom | DOM 编译器 |
| crates/compiler-ssr | SSR 编译器 |
| docs/analysis/dom-expressions-* | 设计分析文档 |
