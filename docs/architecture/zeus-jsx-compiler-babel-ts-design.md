# Zeus JSX 编译器设计方案 (Babel + TypeScript)

> 基于 SolidJS dom-expressions 思想，使用 Babel + TypeScript 实现高性能 JSX 编译器

---

## 目录

- [1. 概述](#1-概述)
- [2. 设计目标](#2-设计目标)
- [3. 整体架构](#3-整体架构)
- [4. 核心模块设计](#4-核心模块设计)
- [5. 编译流程详解](#5-编译流程详解)
- [6. 运行时设计](#6-运行时设计)
- [7. 功能模块设计](#7-功能模块设计)
- [8. API 设计](#8-api-设计)
- [9. 实现计划](#9-实现计划)
- [10. 技术风险与应对](#10-技术风险与应对)

---

## 1. 概述

### 1.1 背景

当前 Zeus 项目使用 Rust + OXC 作为编译器基础设施。虽然 OXC 方案性能优异，但在 MVP 阶段存在以下问题：

1. **开发迭代慢**：Rust 编译时间长，类型系统严格
2. **调试困难**：Rust 的错误处理和调试不如 TypeScript 直观
3. **团队熟悉度**：TypeScript 团队更容易理解和维护
4. **生态丰富**：Babel 生态有大量可参考的插件和工具

### 1.2 方案选择

采用 **渐进式方案**：

```
┌─────────────────────────────────────────────────────────────┐
│                    长期目标                                  │
│                 Rust + OXC 高性能方案                       │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ 核心算法和架构稳定后迁移
                            │
┌─────────────────────────────────────────────────────────────┐
│                    MVP 阶段                                  │
│                 Babel + TypeScript 快速迭代                  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Babel 插件   │  │ TypeScript   │  │ Babel preset │     │
│  │ JSX 转换     │  │ 配置层       │  │ 集成        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 核心参考

本方案核心参考 `babel-plugin-jsx-dom-expressions` (dom-expressions) 的实现：

- **仓库**：[ryansolid/dom-expressions](https://github.com/ryansolid/dom-expressions)
- **核心思想**：JSX → 模板字符串 + 细粒度响应式包装
- **关键创新**：模板复用、事件委托、动态性检测

---

## 2. 设计目标

### 2.1 功能目标

| 目标 | 描述 | 优先级 |
|------|------|--------|
| **无虚拟 DOM** | 直接编译为 DOM 操作，消除 VDOM 开销 | P0 |
| **最小化运行时** | 静态计算在编译时完成，运行时只保留必要逻辑 | P0 |
| **精细化响应式** | 基于 alien-signal 的细粒度更新，只更新变化的 DOM 节点 | P0 |
| **多模式支持** | DOM 渲染、SSR、水合 | P1 |
| **ES5 兼容** | 编译输出兼容 ES5，无现代语法依赖 | P1 |
| **开发者体验** | 友好的错误提示、SourceMap 支持 | P2 |

### 2.2 性能目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 编译速度 | < 50ms/文件 | 1000 行 JSX |
| 输出体积 | < 原始 VDOM 的 30% | 运行时 + helpers |
| 运行时开销 | < 5KB (gzipped) | 核心运行时 |

### 2.3 兼容性目标

| 环境 | 最低版本 |
|------|----------|
| Chrome | 49+ |
| Firefox | 44+ |
| Safari | 9+ |
| Edge | 79+ |
| Node.js | 14+ |

---

## 3. 整体架构

### 3.1 包结构

```
zeus/
├── packages/
│   └── compiler/                         # JSX 编译器核心包
│       ├── src/
│       │   ├── index.ts                  # 插件入口
│       │   ├── config.ts                  # 默认配置
│       │   │
│       │   ├── shared/                   # 共享模块
│       │   │   ├── types.ts              # 类型定义
│       │   │   ├── utils.ts              # 工具函数
│       │   │   ├── dynamic.ts            # 动态性检测
│       │   │   ├── escape.ts             # HTML 转义
│       │   │   └── constants.ts          # 常量定义
│       │   │
│       │   ├── transform/                # 转换模块
│       │   │   ├── jsx.ts                # JSX 主转换
│       │   │   ├── element.ts            # 元素转换
│       │   │   ├── component.ts          # 组件转换
│       │   │   ├── fragment.ts           # Fragment 转换
│       │   │   ├── attribute.ts          # 属性转换
│       │   │   ├── child.ts              # 子节点转换
│       │   │   └── directive.ts         # 指令转换
│       │   │
│       │   ├── dom/                      # DOM 模式
│       │   │   ├── element.ts            # DOM 元素处理
│       │   │   ├── template.ts           # DOM 模板处理
│       │   │   └── set-attr.ts          # 属性设置
│       │   │
│       │   ├── ssr/                      # SSR 模式
│       │   │   ├── element.ts            # SSR 元素处理
│       │   │   ├── template.ts           # SSR 模板处理
│       │   │   └── escape.ts             # SSR 转义处理
│       │   │
│       │   └── universal/                # 通用模式
│       │       ├── element.ts
│       │       └── template.ts
│       │
│       ├── __tests__/                    # 测试
│       │   ├── fixtures/                 # 测试用例
│       │   └── *.test.ts
│       │
│       └── package.json
│
├── addons/                               # 插件和集成包（构建工具集成）
│   ├── babel-preset-zeus/                # Babel preset
│   │   ├── src/
│   │   │   ├── index.ts                  # preset 入口
│   │   │   └── options.ts                # preset 选项
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── rollup-plugin-zeus/               # Rollup 插件
│   │   ├── src/
│   │   │   ├── index.ts                  # 插件入口
│   │   │   └── cache.ts                  # 缓存逻辑
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   └── vite-plugin-zeus/                 # Vite 插件（后续扩展）
│       ├── src/
│       │   └── index.ts
│       ├── __tests__/
│       └── package.json
│
└── packages/
    └── runtime/                          # 运行时（已有）
        ├── runtime-core/
        ├── runtime-dom/
        └── runtime-ssr/
```

**包职责划分**：

| 包 | 职责 | 说明 |
|---|------|------|
| `compiler` | JSX 编译核心 | 只包含 Babel 插件形式的编译逻辑，不关心构建工具 |
| `babel-preset-zeus` | Babel preset 封装 | 组合 `@babel/preset-typescript` 和 `compiler`，提供开箱即用体验 |
| `rollup-plugin-zeus` | Rollup 集成 | 调用 `compiler`，处理缓存和 SourceMap |
| `vite-plugin-zeus` | Vite 集成 | 开发服务器支持，热更新 |

### 3.2 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           编译流程                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  JSX/TSX 源文件                                                         │
│       │                                                                   │
│       ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  1. Babel 解析                                                   │     │
│  │     - @babel/parser (支持 JSX, TypeScript)                       │     │
│  │     - 生成 Babel AST                                             │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│       │                                                                   │
│       ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  2. 配置处理 (config.ts)                                          │     │
│  │     - 合并用户配置与默认配置                                       │     │
│  │     - 确定生成模式 (dom/ssr/universal)                            │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│       │                                                                   │
│       ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  3. 预处理 (preprocess.ts)                                       │     │
│  │     - Program:enter 钩子                                         │     │
│  │     - 初始化 scope.data                                          │     │
│  │     - 检查 import source                                          │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│       │                                                                   │
│       ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  4. JSX 转换 (transform/jsx.ts)                                  │     │
│  │     ┌─────────────────────────────────────────────────────────┐ │     │
│  │     │  transformJSX(path, state)                              │ │     │
│  │     │    │                                                    │ │     │
│  │     │    ├── isComponent() 判断元素类型                         │ │     │
│  │     │    ├── isDynamic() 检测动态性                             │ │     │
│  │     │    │                                                    │ │     │
│  │     │    ├── transformElement() → DOM/SSR/Universal           │ │     │
│  │     │    │    │                                               │ │     │
│  │     │    │    ├── transformAttributes()                       │ │     │
│  │     │    │    ├── transformChildren()                          │ │     │
│  │     │    │    └── generateTemplate()                           │ │     │
│  │     │    │                                                    │ │     │
│  │     │    └── transformComponent()                             │ │     │
│  │     │         │                                                │ │     │
│  │     │         ├── transformProps()                              │ │     │
│  │     │         └── transformChildren()                          │ │     │
│  │     └─────────────────────────────────────────────────────────┘ │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│       │                                                                   │
│       ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  5. 后处理 (postprocess.ts)                                      │     │
│  │     - Program:exit 钩子                                          │     │
│  │     - 注册模板到模块顶部                                           │     │
│  │     - 注册委托事件                                                │     │
│  │     - 验证 HTML 有效性                                            │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│       │                                                                   │
│       ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  6. Babel 输出                                                   │     │
│  │     - 生成 import 语句                                           │     │
│  │     - 生成模板声明                                               │     │
│  │     - 生成 JSX 转换代码                                          │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│       │                                                                   │
│       ▼                                                                   │
│  JavaScript/TypeScript 输出                                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 核心模块设计

### 4.1 配置模块 (config.ts)

```typescript
// packages/compiler/src/config.ts

export interface CompilerOptions {
  /**
   * 运行时模块名
   * @default "zeus"
   */
  moduleName?: string;
  
  /**
   * 生成模式
   * - dom: 客户端 DOM 渲染
   * - ssr: 服务端渲染
   * - universal: 通用模式
   * @default "dom"
   */
  generate?: 'dom' | 'ssr' | 'universal';
  
  /**
   * 是否支持 hydration
   * @default false
   */
  hydratable?: boolean;
  
  /**
   * 是否启用事件委托
   * @default true
   */
  delegateEvents?: boolean;
  
  /**
   * 额外的委托事件列表
   * @default []
   */
  delegatedEvents?: string[];
  
  /**
   * 是否要求特定的 import source
   * @default false
   */
  requireImportSource?: string | false;
  
  /**
   * 是否包装条件表达式
   * @default true
   */
  wrapConditionals?: boolean;
  
  /**
   * 是否省略嵌套闭合标签
   * @default false
   */
  omitNestedClosingTags?: boolean;
  
  /**
   * 是否省略最后一个闭合标签
   * @default true
   */
  omitLastClosingTag?: boolean;
  
  /**
   * 是否省略属性引号
   * @default true
   */
  omitQuotes?: boolean;
  
  /**
   * 是否传递上下文到自定义元素
   * @default false
   */
  contextToCustomElements?: boolean;
  
  /**
   * 静态标记注释
   * @default "@once"
   */
  staticMarker?: string;
  
  /**
   * 副作用包装函数名
   * @default "effect"
   */
  effectWrapper?: string;
  
  /**
   * 记忆化包装函数名
   * @default "memo"
   */
  memoWrapper?: string;
  
  /**
   * 是否验证 HTML 有效性
   * @default true
   */
  validate?: boolean;
  
  /**
   * 是否内联静态样式
   * @default true
   */
  inlineStyles?: boolean;
}

export const DEFAULT_CONFIG: Required<CompilerOptions> = {
  moduleName: 'zeus',
  generate: 'dom',
  hydratable: false,
  delegateEvents: true,
  delegatedEvents: [],
  requireImportSource: false,
  wrapConditionals: true,
  omitNestedClosingTags: false,
  omitLastClosingTag: true,
  omitQuotes: true,
  contextToCustomElements: false,
  staticMarker: '@once',
  effectWrapper: 'effect',
  memoWrapper: 'memo',
  validate: true,
  inlineStyles: true,
};
```

### 4.2 类型定义 (shared/types.ts)

```typescript
// packages/compiler/src/shared/types.ts

import type * as t from '@babel/types';

// ==================== 配置相关 ====================

export interface TransformInfo {
  topLevel?: boolean;
  lastElement?: boolean;
  toBeClosed?: Set<string>;
  componentChild?: boolean;
  fragmentChild?: boolean;
  skipId?: boolean;
  doNotEscape?: boolean;
}

export interface TransformResult {
  // 模板相关
  template: string;
  templateWithClosingTags?: string;
  id?: t.Identifier;
  
  // 声明语句
  declarations: t.VariableDeclarator[];
  
  // 表达式语句
  exprs: t.Statement[];
  
  // 动态属性
  dynamics: DynamicAttr[];
  
  // 后置表达式
  postExprs: t.Statement[];
  
  // 元信息
  tagName?: string;
  renderer?: 'dom' | 'ssr' | 'universal';
  isSVG?: boolean;
  hasCustomElement?: boolean;
  isImportNode?: boolean;
  skipTemplate?: boolean;
  text?: boolean;
  component?: boolean;
  dynamic?: boolean;
  spreadElement?: boolean;
  hasHydratableEvent?: boolean;
}

// ==================== 属性相关 ====================

export interface DynamicAttr {
  elem: t.Identifier;
  key: string;
  value: t.Expression;
  isSVG?: boolean;
  isCE?: boolean;
  tagName?: string;
  prevId?: t.Identifier;
}

export interface AttributeTransformOptions {
  isSVG: boolean;
  dynamic: boolean;
  prevId?: t.Identifier;
  isCE?: boolean;
  tagName?: string;
}

// ==================== 作用域数据 ====================

export interface ScopeData {
  // 模板列表
  templates?: TemplateInfo[];
  
  // 导入的方法
  imports?: Map<string, Map<string, t.Identifier>>;
  
  // 委托事件
  events?: Set<string>;
  
  // 渲染器配置
  config?: CompilerOptions;
}

// ==================== 模板信息 ====================

export interface TemplateInfo {
  id: t.Identifier;
  template: string;
  templateWithClosingTags: string;
  isSVG: boolean;
  isCE: boolean;
  isImportNode: boolean;
  renderer: 'dom' | 'ssr' | 'universal';
}

// ==================== 渲染器配置 ====================

export interface RendererConfig extends Required<CompilerOptions> {
  renderers?: RendererInfo[];
}

// ==================== 辅助类型 ====================

export type JSXName =
  | t.JSXIdentifier
  | t.JSXMemberExpression
  | t.JSXNamespacedName;

export type DynamicCheckOptions = {
  checkMember?: boolean;
  checkTags?: boolean;
  checkCallExpressions?: boolean;
  native?: boolean;
};
```

### 4.3 动态性检测 (shared/dynamic.ts)

```typescript
// packages/compiler/src/shared/dynamic.ts

import type * as t from '@babel/types';
import type { DynamicCheckOptions } from './types';

/**
 * 检测表达式是否为动态的
 * 
 * 核心算法参考 dom-expressions 的 isDynamic 实现：
 * 1. 函数表达式 → 静态（事件处理器、组件函数）
 * 2. @once 注释标记 → 静态
 * 3. 函数调用 → 动态
 * 4. 成员访问 → 动态
 * 5. JSX 元素/片段 → 动态
 * 6. 深度遍历查找
 */
export function isDynamic(
  path: NodePath<t.Expression>,
  options: DynamicCheckOptions = {}
): boolean {
  const { checkMember = true, checkTags = false, checkCallExpressions = true, native = false } = options;
  const expr = path.node;
  const config = getConfig(path);
  
  // SSR 模式下，native 检查更严格
  if (config.generate === 'ssr' && native) {
    checkMember = false;
    checkCallExpressions = false;
  }
  
  // 1. 函数表达式 → 静态
  if (isFunction(expr)) {
    return false;
  }
  
  // 2. @once 静态标记 → 静态
  if (hasStaticMarker(path)) {
    return false;
  }
  
  // 3. 函数调用 → 动态
  if (checkCallExpressions && isCallExpression(expr)) {
    return true;
  }
  
  // 4. 可选调用 → 动态
  if (checkCallExpressions && isOptionalCallExpression(expr)) {
    return true;
  }
  
  // 5. 成员访问 → 动态
  if (checkMember && isMemberExpression(expr)) {
    const object = path.get('object').node;
    
    // 命名空间导入的成员不算动态
    if (isIdentifier(object) && isImportNamespaceSpecifier(path)) {
      return false;
    }
    
    // 递归检查属性
    if (expr.computed) {
      return isDynamic(path.get('property') as NodePath<t.Expression>, {
        checkMember: true,
        checkTags,
        checkCallExpressions,
        native
      });
    }
    
    return true;
  }
  
  // 6. 可选成员访问 → 动态
  if (checkMember && isOptionalMemberExpression(expr)) {
    return true;
  }
  
  // 7. 展开元素 → 动态
  if (checkMember && isSpreadElement(expr)) {
    return true;
  }
  
  // 8. binary in 表达式 → 动态
  if (checkMember && isBinaryExpression(expr) && expr.operator === 'in') {
    return true;
  }
  
  // 9. JSX 元素/片段 → 动态
  if (checkTags && isJSXElement(expr)) {
    return true;
  }
  
  if (checkTags && isJSXFragment(expr) && expr.children.length > 0) {
    return true;
  }
  
  // 10. 深度遍历
  return hasDynamicDescendant(path, options);
}

/**
 * 深度遍历查找动态子表达式
 */
function hasDynamicDescendant(
  path: NodePath<t.Expression>,
  options: DynamicCheckOptions
): boolean {
  let dynamic = false;
  
  path.traverse({
    // 函数跳过
    Function(p) {
      if (isObjectMethod(p.node) && p.node.computed) {
        dynamic = isDynamic(p.get('key') as NodePath<t.Expression>, options);
      }
      p.skip();
    },
    
    // 函数调用
    CallExpression(p) {
      if (options.checkCallExpressions) {
        dynamic = true;
        p.stop();
      }
    },
    
    OptionalCallExpression(p) {
      if (options.checkCallExpressions) {
        dynamic = true;
        p.stop();
      }
    },
    
    // 成员访问
    MemberExpression(p) {
      if (options.checkMember) {
        dynamic = true;
        p.stop();
      }
    },
    
    OptionalMemberExpression(p) {
      if (options.checkMember) {
        dynamic = true;
        p.stop();
      }
    },
    
    // 展开
    SpreadElement(p) {
      if (options.checkMember) {
        dynamic = true;
        p.stop();
      }
    },
    
    // in 操作符
    BinaryExpression(p) {
      if (options.checkMember && p.node.operator === 'in') {
        dynamic = true;
        p.stop();
      }
    },
    
    // JSX 元素
    JSXElement(p) {
      if (options.checkTags) {
        dynamic = true;
        p.stop();
      } else {
        p.skip();
      }
    },
    
    // JSX 片段
    JSXFragment(p) {
      if (options.checkTags && p.node.children.length) {
        dynamic = true;
        p.stop();
      } else {
        p.skip();
      }
    },
  });
  
  return dynamic;
}

/**
 * 判断是否为函数表达式
 */
function isFunction(node: t.Node): boolean {
  return (
    isArrowFunctionExpression(node) ||
    isFunctionExpression(node) ||
    isClassMethod(node)
  );
}

// ==================== 元素类型判断 ====================

/**
 * 判断标签名是否为组件
 * 
 * 规则：
 * 1. 首字母大写 → 组件
 * 2. 包含点号 → 属性访问组件 (如 Foo.Bar)
 * 3. 非字母开头 → 组件 (如 <_Component>)
 */
export function isComponent(tagName: string): boolean {
  if (!tagName || !tagName[0]) return false;
  
  return (
    // 首字母大写
    tagName[0] !== tagName[0].toLowerCase() ||
    // 包含点号
    tagName.includes('.') ||
    // 非字母开头
    !/^[a-zA-Z]/.test(tagName)
  );
}

/**
 * 获取 JSX 元素的标签名
 */
export function getTagName(node: t.JSXElement): string {
  const name = node.openingElement.name;
  return jsxNameToString(name);
}

function jsxNameToString(node: t.JSXName): string {
  if (isJSXMemberExpression(node)) {
    return `${jsxNameToString(node.object)}.${jsxPropertyName(node.property)}`;
  }
  if (isJSXIdentifier(node) || isIdentifier(node)) {
    return node.name;
  }
  if (isJSXNamespacedName(node)) {
    return `${node.namespace.name}:${node.name.name}`;
  }
  return '';
}

function jsxPropertyName(node: t.JSXIdentifier | t.JSXMemberExpression): string {
  if (isJSXIdentifier(node)) {
    return node.name;
  }
  return jsxNameToString(node);
}
```

### 4.4 HTML 转义 (shared/escape.ts)

```typescript
// packages/compiler/src/shared/escape.ts

/**
 * HTML 转义
 * 
 * 转义规则：
 * - & → &amp;
 * - < → &lt;
 * - > → &gt;
 * - " → &quot; (属性内)
 * - ' → &#39; (属性内)
 */
export function escapeHTML(str: string, isAttr: boolean = false): string {
  if (typeof str !== 'string') return str;
  
  const delim = isAttr ? '"' : '<';
  const escDelim = isAttr ? '&quot;' : '&lt;';
  
  let iDelim = str.indexOf(delim);
  let iAmp = str.indexOf('&');
  
  // 无需转义
  if (iDelim < 0 && iAmp < 0) return str;
  
  let left = 0;
  let out = '';
  
  while (iDelim >= 0 && iAmp >= 0) {
    if (iDelim < iAmp) {
      if (left < iDelim) out += str.substring(left, iDelim);
      out += escDelim;
      left = iDelim + 1;
      iDelim = str.indexOf(delim, left);
    } else {
      if (left < iAmp) out += str.substring(left, iAmp);
      out += '&amp;';
      left = iAmp + 1;
      iAmp = str.indexOf('&', left);
    }
  }
  
  // 处理剩余的定界符
  if (iDelim >= 0) {
    do {
      if (left < iDelim) out += str.substring(left, iDelim);
      out += escDelim;
      left = iDelim + 1;
      iDelim = str.indexOf(delim, left);
    } while (iDelim >= 0);
  } else {
    while (iAmp >= 0) {
      if (left < iAmp) out += str.substring(left, iAmp);
      out += '&amp;';
      left = iAmp + 1;
      iAmp = str.indexOf('&', left);
    }
  }
  
  return left < str.length ? out + str.substring(left) : out;
}

/**
 * 模板字符串转义
 * 用于模板字符串的原始内容
 */
export function escapeForTemplate(str: string): string {
  return str.replace(/[\\`\n\t\b\f\v\r\u2028\u2029]/g, char => templateEscapes.get(char) || char);
}

const templateEscapes = new Map([
  ['\\', '\\\\'],
  ['`', '\\`'],
  ['\n', '\\n'],
  ['\t', '\\t'],
  ['\b', '\\b'],
  ['\f', '\\f'],
  ['\v', '\\v'],
  ['\r', '\\r'],
  ['\u2028', '\\u2028'],
  ['\u2029', '\\u2029'],
]);

/**
 * 移除字符串首尾空白
 * 并规范化内部空白
 */
export function trimWhitespace(text: string): string {
  // 移除回车
  text = text.replace(/\r/g, '');
  
  // 处理换行
  if (/\n/g.test(text)) {
    text = text
      .split('\n')
      .map((t, i) => (i ? t.replace(/^\s*/g, '') : t))
      .filter(s => !/^\s*$/.test(s))
      .join(' ');
  }
  
  // 规范化空格
  return text.replace(/\s+/g, ' ');
}
```

### 4.5 常量定义 (shared/constants.ts)

```typescript
// packages/compiler/src/shared/constants.ts

/**
 * 自闭合元素列表
 */
export const VOID_ELEMENTS = [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
  // 表格相关
  'colgroup',
  // MathML
  'math', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace', 'mglyph', 'malert',
  // SVG
  'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect',
  'stop', 'use', 'image', 'symbol', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
  'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
  'feTile', 'feTurbulence',
] as const;

/**
 * SVG 元素集合
 */
export const SVG_ELEMENTS = new Set([
  'svg', 'a', 'altGlyph', 'altGlyphDef', 'altGlyphItem',
  'animate', 'animateColor', 'animateMotion', 'animateTransform',
  'circle', 'clipPath', 'color-profile', 'cursor', 'defs',
  'desc', 'ellipse', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
  'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur',
  'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset',
  'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'filter', 'font', 'font-face', 'font-face-format',
  'font-face-name', 'font-face-src', 'font-face-uri', 'foreignObject',
  'g', 'glyph', 'glyphRef', 'hkern', 'image', 'line', 'linearGradient',
  'marker', 'mask', 'metadata', 'missing-glyph', 'mpath', 'path',
  'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'set', 'stop', 'style', 'switch', 'symbol', 'text', 'textPath',
  'title', 'tref', 'tspan', 'use', 'view', 'vkern',
] as const);

/**
 * 委托事件列表
 * 这些事件支持事件委托到 document
 */
export const DELEGATED_EVENTS = new Set([
  // 鼠标事件
  'onClick', 'onMouseDown', 'onMouseUp', 'onMouseMove', 'onMouseEnter', 'onMouseLeave',
  'onMouseOver', 'onMouseOut', 'onContextMenu', 'onDblClick',
  // 触摸事件
  'onTouchStart', 'onTouchEnd', 'onTouchMove', 'onTouchCancel',
  // 键盘事件
  'onKeyDown', 'onKeyUp', 'onKeyPress',
  // 表单事件
  'onInput', 'onChange', 'onSubmit', 'onReset', 'onFocus', 'onBlur',
  // 资源事件
  'onLoad', 'onError', 'onAbort', 'onScroll',
  // 拖拽事件
  'onDrag', 'onDragEnd', 'onDragEnter', 'onDragExit', 'onDragLeave',
  'onDragOver', 'onDragStart', 'onDrop',
  // 粘贴事件
  'onPaste', 'onCopy', 'onCut',
  // 合成事件
  'onCompositionEnd', 'onCompositionStart', 'onCompositionUpdate',
] as const);

/**
 * DOM 属性映射
 * JSX 属性名 → DOM 属性名
 */
export const DOM_PROPERTIES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  tabIndex: 'tabindex',
  readOnly: 'readOnly',
  maxLength: 'maxLength',
  autoComplete: 'autoComplete',
  autoCapitalize: 'autoCapitalize',
  autoFocus: 'autoFocus',
  noValidate: 'noValidate',
  formAction: 'formAction',
  formEncType: 'formEncType',
  formMethod: 'formMethod',
  formNoValidate: 'formNoValidate',
  formTarget: 'formTarget',
  crossOrigin: 'crossOrigin',
  tabIndex: 'tabIndex',
  accessKey: 'accessKey',
  autoPlay: 'autoPlay',
  encType: 'encType',
  noShade: 'noShade',
  playInline: 'playInline',
  rows: 'rows',
  cols: 'cols',
  rowSpan: 'rowSpan',
  colSpan: 'colSpan',
  frameBorder: 'frameBorder',
  useMap: 'useMap',
  wrap: 'wrap',
  contentEditable: 'contentEditable',
  spellCheck: 'spellCheck',
  translate: 'translate',
  // SVG
  viewBox: 'viewBox',
  xLink: 'xlink',
  xmlBase: 'xml:base',
  xmlLang: 'xml:lang',
  xmlSpace: 'xml:space',
};

/**
 * 子节点属性
 * 这些属性会覆盖 children
 */
export const CHILD_PROPERTIES = new Set([
  'innerHTML', 'textContent', 'innerText', 'value', 'checked',
] as const);

/**
 * 布尔属性
 * 这些属性只关心是否存在，不关心值
 */
export const BOOLEAN_ATTRIBUTES = new Set([
  'async', 'autofocus', 'autoplay', 'checked', 'controls',
  'default', 'defer', 'disabled', 'formNoValidate', 'hidden',
  'indeterminate', 'ismap', 'loop', 'multiple', 'muted',
  'nomodule', 'novalidate', 'open', 'playsinline', 'readonly',
  'required', 'reversed', 'seamless', 'selected', 'truespeed',
] as const);

/**
 * SVG 命名空间
 */
export const SVG_NAMESPACES: Record<string, string> = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xmlns: 'http://www.w3.org/2000/xmlns/',
  svg: 'http://www.w3.org/2000/svg',
};

/**
 * 保留命名空间
 */
export const RESERVED_NAMESPACES = new Set([
  'class',    // class:active → classList.toggle
  'on',       // on:click → addEventListener
  'oncapture', // oncapture:click → addEventListener with capture
  'style',    // style:color → setStyleProperty
  'use',      // use:action → directive
  'prop',     // prop:value → property 设置
  'attr',     // attr:data → setAttribute
  'bool',     // bool:disabled → setBoolAttribute
] as const);
```

---

## 5. 编译流程详解

### 5.1 主入口 (index.ts)

```typescript
// packages/compiler/src/index.ts

import type { PluginObj, PluginPass } from '@babel/core';
import SyntaxJSX from '@babel/plugin-syntax-jsx';
import { transformJSX } from './transform/jsx';
import { preprocess } from './transform/preprocess';
import { postprocess } from './transform/postprocess';
import { mergeConfig, DEFAULT_CONFIG, type CompilerOptions } from './config';

export default function zeusJSXPlugin(): PluginObj<PluginPass & { opts: CompilerOptions }> {
  return {
    name: 'zeus-jsx',
    inherits: SyntaxJSX,
    
    visitor: {
      // JSX 元素转换
      JSXElement: transformJSX,
      JSXFragment: transformJSX,
      
      // Program 钩子
      Program: {
        enter: preprocess,
        exit: postprocess,
      },
    },
  };
}

// 导出类型和配置
export type { CompilerOptions } from './config';
export { DEFAULT_CONFIG, mergeConfig } from './config';
```

### 5.2 预处理 (transform/preprocess.ts)

```typescript
// packages/compiler/src/transform/preprocess.ts

import type { NodePath } from '@babel/core';
import type { Program } from '@babel/types';
import type { PluginPass } from '@babel/core';

export interface PreprocessState extends PluginPass {
  opts: CompilerOptions;
}

/**
 * 预处理钩子
 * 
 * 职责：
 * 1. 合并配置
 * 2. 检查 import source
 * 3. 初始化 scope.data
 */
export function preprocess(
  path: NodePath<Program>,
  state: PreprocessState
): void {
  // 合并配置
  const merged = Object.assign(
    {},
    DEFAULT_CONFIG,
    state.opts
  );
  (path.hub.file as any).metadata.config = merged;
  
  // 检查 requireImportSource
  const { requireImportSource } = merged;
  if (requireImportSource) {
    const hasValidImport = checkImportSource(path, requireImportSource);
    if (!hasValidImport) {
      // 跳过此文件的转换
      (state as any).skip = true;
      return;
    }
  }
  
  // 初始化 scope.data
  path.scope.getProgramParent().data = {
    templates: [],
    imports: new Map(),
    events: new Set(),
    config: merged,
  };
}

/**
 * 检查文件是否有指定的 import source
 */
function checkImportSource(path: NodePath<Program>, source: string): boolean {
  const comments = path.hub.file.ast.comments || [];
  
  for (const comment of comments) {
    const pieces = comment.value.split('@jsxImportSource');
    if (pieces.length === 2 && pieces[1].trim() === source) {
      return true;
    }
  }
  
  return false;
}
```

### 5.3 JSX 转换主逻辑 (transform/jsx.ts)

```typescript
// packages/compiler/src/transform/jsx.ts

import type * as t from '@babel/types';
import type { NodePath } from '@babel/core';
import type { JSXElement, JSXFragment } from '@babel/types';
import type { TransformResult, TransformInfo } from '../shared/types';

import { getConfig } from '../shared/utils';
import { isComponent, getTagName } from '../shared/dynamic';
import { transformElement as transformElementDOM } from './dom/element';
import { transformElement as transformElementSSR } from './ssr/element';
import { transformElement as transformElementUniversal } from './universal/element';
import { transformComponent } from './component';
import { transformFragmentChildren } from './fragment';
import { createTemplate, type TemplateCreator } from './codegen/template';

/**
 * JSX 主转换函数
 * 
 * 流程：
 * 1. 获取配置
 * 2. 处理 this 引用
 * 3. 转换 JSX 节点
 * 4. 生成模板
 * 5. 替换原节点
 */
export function transformJSX(
  path: NodePath<JSXElement | JSXFragment>,
  state: any
): void {
  // 跳过已标记的文件
  if (state.skip) return;
  
  const config = getConfig(path);
  
  // 处理 this 引用
  const handleThis = transformThis(path);
  
  // 转换节点
  const result = transformNode(
    path,
    t.isJSXFragment(path.node)
      ? {}
      : { topLevel: true, lastElement: true }
  );
  
  // 选择模板创建函数
  const createTemplateFn = getTemplateCreator(config, path, result);
  
  // 生成模板调用
  const template = createTemplateFn(path, result);
  
  // 替换节点
  const replacement = handleThis(template);
  path.replaceWith(replacement);
  
  // 清理 @once 注释
  path.traverse({
    enter(p) {
      if (p.node.leadingComments) {
        p.node.leadingComments = p.node.leadingComments.filter(
          c => c.value.trim() !== config.staticMarker
        );
      }
    },
  });
}

/**
 * 获取模板创建函数
 */
function getTemplateCreator(
  config: any,
  path: NodePath<any>,
  result: TransformResult
): TemplateCreator {
  if (result.tagName && result.renderer === 'dom') {
    return createTemplate;
  }
  
  if (result.renderer === 'ssr' || config.generate === 'ssr') {
    return createTemplateSSR;
  }
  
  return createTemplate;
}

/**
 * 转换 JSX 节点
 */
function transformNode(
  path: NodePath<JSXElement | JSXFragment>,
  info: TransformInfo = {}
): TransformResult {
  const node = path.node;
  
  // JSX 元素
  if (t.isJSXElement(node)) {
    return transformElement(path, info);
  }
  
  // JSX 片段
  if (t.isJSXFragment(node)) {
    return transformFragment(path, info);
  }
  
  // JSX 文本
  if (t.isJSXText(node)) {
    return transformText(path, info);
  }
  
  // JSX 表达式容器
  if (t.isJSXExpressionContainer(node)) {
    return transformExpression(path, info);
  }
  
  // JSX 展开子节点
  if (t.isJSXSpreadChild(node)) {
    return transformSpreadChild(path, info);
  }
  
  return { template: '', declarations: [], exprs: [], dynamics: [], postExprs: [] };
}

/**
 * 转换元素
 */
function transformElement(
  path: NodePath<JSXElement>,
  info: TransformInfo
): TransformResult {
  const config = getConfig(path);
  const tagName = getTagName(path.node);
  
  // 组件
  if (isComponent(tagName)) {
    return transformComponent(path);
  }
  
  // 根据配置选择渲染器
  if (config.generate === 'ssr') {
    return transformElementSSR(path, info);
  }
  
  if (config.generate === 'universal') {
    return transformElementUniversal(path, info);
  }
  
  // 默认 DOM
  return transformElementDOM(path, info);
}

/**
 * 处理 this 引用
 * 将 this 替换为捕获的变量
 */
function transformThis(path: NodePath<any>): (node: t.Node) => t.Node {
  const parent = path.scope.getFunctionParent();
  let thisId: t.Identifier | undefined;
  
  path.traverse({
    ThisExpression(p) {
      const target = getTargetFunctionParent(p, parent);
      if (target === parent) {
        thisId ||= path.scope.generateUidIdentifier('self$');
        p.replaceWith(thisId);
      }
    },
    
    JSXElement(p) {
      const name = p.get('openingElement').get('name');
      if (isJSXIdentifier(name) && name.node.name === 'this') {
        const target = getTargetFunctionParent(p, parent);
        if (target === parent) {
          thisId ||= path.scope.generateUidIdentifier('self$');
          (name as NodePath<t.JSXIdentifier>).replaceWith(
            t.jsxIdentifier(thisId.name)
          );
          
          // 更新闭合标签
          if (p.node.closingElement) {
            p.node.closingElement.name = p.node.openingElement.name;
          }
        }
      }
    },
  });
  
  return (node) => {
    if (!thisId) return node;
    
    if (!parent || t.isClassMethod(parent.block)) {
      // 顶级：包装为立即调用函数
      const decl = t.variableDeclaration('const', [
        t.variableDeclarator(thisId, t.thisExpression()),
      ]);
      
      if (parent) {
        // 在函数内：在开头插入声明
        const stmt = path.getStatementParent();
        stmt.insertBefore(decl);
      } else {
        // 顶级：包装函数
        return t.callExpression(
          t.arrowFunctionExpression([], t.blockStatement([decl, t.returnStatement(node)])),
          []
        );
      }
    } else {
      // 函数内：添加到参数
      parent.push({ id: thisId, init: t.thisExpression(), kind: 'const' });
    }
    
    return node;
  };
}
```

### 5.4 DOM 元素转换 (transform/dom/element.ts)

```typescript
// packages/compiler/src/transform/dom/element.ts

import type * as t from '@babel/types';
import type { NodePath } from '@babel/core';
import type { JSXElement } from '@babel/types';
import type { TransformResult, TransformInfo, DynamicAttr } from '../../shared/types';

import {
  VOID_ELEMENTS,
  SVG_ELEMENTS,
  DELEGATED_EVENTS,
  CHILD_PROPERTIES,
  RESERVED_NAMESPACES,
} from '../../shared/constants';
import {
  getConfig,
  getTagName,
  isComponent,
  isDynamic,
  registerImportMethod,
  getRendererConfig,
  filterChildren,
  checkLength,
  toEventName,
  toPropertyName,
  escapeHTML,
} from '../../shared/utils';
import { transformNode } from '../jsx';
import { setAttr } from './set-attr';

/**
 * DOM 元素转换
 * 
 * 核心逻辑：
 * 1. 生成静态 HTML 模板
 * 2. 静态属性内联到模板
 * 3. 动态属性包装为 effect
 * 4. 处理子节点
 */
export function transformElement(
  path: NodePath<JSXElement>,
  info: TransformInfo
): TransformResult {
  // 预处理：尝试内联静态属性值
  preprocessAttributes(path);
  
  const config = getConfig(path);
  const tagName = getTagName(path.node);
  
  // 检测 SVG 包装
  const wrapSVG = info.topLevel && tagName !== 'svg' && SVG_ELEMENTS.has(tagName);
  const voidTag = VOID_ELEMENTS.includes(tagName);
  
  // 检测自定义元素
  const isCustomElement =
    tagName.includes('-') ||
    path.get('openingElement').get('attributes').some(
      (a: any) => a.node?.name?.name === 'is'
    );
  
  // 检测导入节点 (img, iframe)
  const isImportNode =
    (tagName === 'img' || tagName === 'iframe') &&
    path.get('openingElement').get('attributes').some(
      (a: any) => a.node.name?.name === 'loading'
    );
  
  // 初始化结果
  const results: TransformResult = {
    template: `<${tagName}`,
    templateWithClosingTags: `<${tagName}`,
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    isSVG: wrapSVG,
    hasCustomElement: isCustomElement,
    isImportNode,
    tagName,
    renderer: 'dom',
    skipTemplate: false,
  };
  
  // SVG 包装
  if (wrapSVG) {
    results.template = '<svg>' + results.template;
    results.templateWithClosingTags = '<svg>' + results.templateWithClosingTags;
  }
  
  // 生成元素 ID
  if (!info.skipId) {
    results.id = path.scope.generateUidIdentifier('el$');
  }
  
  // 处理属性
  transformAttributes(path, results);
  
  // 闭合标签
  results.template += '>';
  results.templateWithClosingTags += '>';
  
  // 处理子节点
  if (!voidTag) {
    const toBeClosed = shouldCloseTag(info, tagName, config);
    transformChildren(path, results, config, toBeClosed);
    
    if (toBeClosed) {
      results.template += `</${tagName}>`;
      results.templateWithClosingTags += `</${tagName}>`;
    }
  }
  
  // SVG 闭合
  if (wrapSVG) {
    results.template += '</svg>';
    results.templateWithClosingTags += '</svg>';
  }
  
  return results;
}

/**
 * 预处理属性：尝试内联静态值
 */
function preprocessAttributes(path: NodePath<JSXElement>): void {
  path.get('openingElement').get('attributes').forEach((attr: any) => {
    const value = attr.node.value;
    if (!value) return;
    
    // 尝试求值静态表达式
    const evaluated = tryEvaluate(attr.get('value'));
    if (evaluated !== undefined) {
      // 可以内联
    }
  });
}

/**
 * 转换属性
 */
function transformAttributes(
  path: NodePath<JSXElement>,
  results: TransformResult
): void {
  const elem = results.id!;
  const config = getConfig(path);
  const tagName = results.tagName!;
  const isSVG = results.isSVG!;
  const isCE = results.hasCustomElement!;
  
  // 检测是否有 spread 属性
  const hasSpread = path.get('openingElement').get('attributes').some(
    (a: any) => t.isJSXSpreadAttribute(a.node)
  );
  
  if (hasSpread) {
    const [attrs, spreadExpr] = processSpreads(path, { elem, isSVG, isCE });
    results.exprs.push(spreadExpr);
    // 更新属性列表
  }
  
  // 预处理 inline styles
  if (config.inlineStyles) {
    inlineStyleAttributes(path, results);
  }
  
  // 预处理 classList
  if (config.inlineStyles) {
    inlineClassList(path, results);
  }
  
  // 合并 class 属性
  mergeClassAttributes(path, results);
  
  // 处理每个属性
  path.get('openingElement').get('attributes').forEach((attr: any) => {
    const node = attr.node;
    const key = getAttributeKey(node);
    
    // 跳过已处理的
    if (node.processed) return;
    
    const value = node.value;
    
    // 处理 ref
    if (key === 'ref') {
      handleRef(attr, results, elem);
      return;
    }
    
    // 处理 use: 指令
    if (key.startsWith('use:')) {
      handleUseDirective(attr, results, elem);
      return;
    }
    
    // 处理事件
    if (key.startsWith('on')) {
      handleEvent(attr, results, elem, key, isSVG);
      return;
    }
    
    // 处理 classList
    if (key === 'classList') {
      handleClassList(attr, results, elem, isSVG);
      return;
    }
    
    // 处理 style
    if (key === 'style') {
      handleStyle(attr, results, elem, isSVG, isCE);
      return;
    }
    
    // 处理 class
    if (key === 'class' || key === 'className') {
      handleClass(attr, results, elem, isSVG);
      return;
    }
    
    // 处理 children (特殊属性)
    if (key === 'children') {
      // children 会通过子节点处理
      return;
    }
    
    // 处理动态属性
    if (value && t.isJSXExpressionContainer(value)) {
      const expr = value.expression;
      
      // 检查是否是动态的
      if (isDynamic(attr.get('value').get('expression'), { checkMember: true })) {
        // 动态属性
        if (isSimpleSetter(key)) {
          results.dynamics.push({
            elem,
            key,
            value: expr,
            isSVG,
            isCE,
            tagName,
          });
        } else {
          // 使用 setAttr helper
          results.exprs.push(t.expressionStatement(
            setAttr(path, elem, key, expr, { isSVG, isCE, tagName })
          ));
        }
      } else {
        // 静态属性
        inlineStaticAttribute(results, key, expr);
      }
    } else {
      // 静态属性
      inlineStaticAttribute(results, key, value);
    }
  });
}

/**
 * 处理事件
 */
function handleEvent(
  attr: NodePath<any>,
  results: TransformResult,
  elem: t.Identifier,
  key: string,
  isSVG: boolean
): void {
  const config = getConfig(attr);
  const ev = toEventName(key);
  const handler = attr.node.value?.expression;
  
  if (!handler) return;
  
  // 事件委托
  if (config.delegateEvents && DELEGATED_EVENTS.has(ev)) {
    // 收集到 scope
    const events = attr.scope.getProgramParent().data.events || new Set();
    events.add(ev);
    attr.scope.getProgramParent().data.events = events;
    
    // 存储处理器引用
    results.exprs.unshift(t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(elem, t.identifier(`$$${ev}`)),
        handler
      )
    ));
  } else {
    // 直接绑定
    results.exprs.unshift(t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(elem, t.identifier(`on${ev}`)),
        handler
      )
    ));
  }
}

/**
 * 处理 classList
 */
function handleClassList(
  attr: NodePath<any>,
  results: TransformResult,
  elem: t.Identifier,
  isSVG: boolean
): void {
  const config = getConfig(attr);
  const classListExpr = attr.node.value.expression;
  
  if (!t.isObjectExpression(classListExpr)) {
    // 动态 classList
    const classListHelper = registerImportMethod(attr, 'classList');
    results.dynamics.push({
      elem,
      key: 'classList',
      value: classListExpr,
      isSVG,
    });
    return;
  }
  
  // 分析 classList 对象
  const staticParts: string[] = [];
  const dynamicParts: Array<{key: string; value: t.Expression}> = [];
  
  for (const prop of classListExpr.properties) {
    if (t.isObjectProperty(prop) && !prop.computed) {
      const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key)?.value;
      const value = prop.value;
      
      if (t.isBooleanLiteral(value) && value.value === true) {
        // 静态 true → 添加到模板
        staticParts.push(String(key));
      } else if (t.isStringLiteral(value) || t.isNumericLiteral(value)) {
        staticParts.push(String(key));
      } else {
        // 动态
        dynamicParts.push({ key: String(key), value: prop.value });
      }
    }
  }
  
  if (staticParts.length) {
    // 静态部分添加到模板
    // ...
  }
  
  if (dynamicParts.length) {
    // 动态部分包装
    results.dynamics.push({
      elem,
      key: 'classList',
      value: t.objectExpression(
        dynamicParts.map(p => t.objectProperty(t.stringLiteral(p.key), p.value))
      ),
      isSVG,
    });
  }
}
```

---

## 6. 运行时设计

### 6.1 核心运行时 API

```typescript
// packages/runtime/zeus/src/runtime.ts

/**
 * 创建 DOM 模板
 * 
 * @param html 静态 HTML 模板
 * @param isImportNode 是否使用 importNode
 * @param isSVG 是否为 SVG 片段
 * @returns 模板元素
 */
export function template(html: string, isImportNode?: boolean, isSVG?: boolean): Node {
  const t = document.createElement('template');
  t.innerHTML = html;
  
  if (isSVG) {
    return t.content.firstChild.firstChild;
  }
  if (isImportNode) {
    return document.importNode(t.content, true);
  }
  return t.content.firstChild;
}

/**
 * 获取下一个元素（用于 hydration）
 */
export function getNextElement(marker?: Identifier): Node {
  // ...
}

/**
 * 插入动态内容
 * 
 * @param parent 父元素
 * @param value 动态值或获取函数
 * @param current 当前值标识
 */
export function insert(
  parent: Node,
  value: any,
  current?: Node | (() => Node | null) | null,
  meta?: InsertMeta
): void {
  // 响应式更新逻辑
  if (typeof value === 'function') {
    // 函数 → 响应式追踪
    EFFECT(() => {
      const v = value();
      insert(parent, v, current, meta);
    });
  } else {
    // 直接设置
    // ...
  }
}

/**
 * 委托事件
 */
export function delegateEvents(events: string[]): void {
  // 委托到 document
  // ...
}

/**
 * 设置属性
 */
export function setAttribute(
  el: Element,
  name: string,
  value: any,
  isSVG?: boolean
): void {
  if (value == null) {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, String(value));
  }
}

/**
 * 设置类名
 */
export function className(el: Element, value: string): void {
  el.className = value;
}

/**
 * 设置样式
 */
export function style(
  el: Element,
  value: string | Record<string, string | number>,
  prev?: Record<string, string | number>
): void {
  // ...
}

/**
 * classList 操作
 */
export function classList(
  el: Element,
  classList: Record<string, boolean | (() => boolean)>
): void {
  // ...
}
```

### 6.2 运行时输出示例

**输入 JSX**：
```jsx
<div class={props.class} onClick={handleClick}>
  <h1>{title()}</h1>
  <Show when={visible()} fallback={<div>Loading...</div>}>
    <p>Content</p>
  </Show>
</div>
```

**编译后输出**：
```javascript
import { template as _$template } from 'zeus';
import { insert as _$insert } from 'zeus';
import { effect as _$effect } from 'zeus';
import { createComponent as _$createComponent } from 'zeus';
import { Show as _$Show } from 'zeus';
import { delegateEvents as _$delegateEvents } from 'zeus';

const _tmpl$ = /*#__PURE__*/_$template(
  `<div><h1></h1><div>Loading...</div><p>Content</p></div>`
);

_$delegateEvents(['click']);

export default () => {
  var _el = _tmpl$(),
      _el2 = _el.firstChild,
      _el3 = _el2.nextSibling,
      _el4 = _el3.nextSibling;
  
  // 类名
  _$effect(() => (_el.className = props.class));
  
  // 事件
  _el.onclick = handleClick;
  
  // 动态文本
  _$insert(_el2, () => title());
  
  // Show 组件
  _$insert(
    _el,
    () => _$createComponent(_$Show, {
      get when() { return visible(); },
      get fallback() { return _el3; },
      get children() { return _el4; },
    }),
    _el3
  );
  
  return _el;
};
```

---

## 7. 功能模块设计

### 7.1 组件转换

```typescript
// packages/compiler/src/transform/component.ts

import type * as t from '@babel/types';
import type { NodePath } from '@babel/core';
import type { JSXElement } from '@babel/types';
import type { TransformResult } from '../shared/types';

import {
  getConfig,
  isDynamic,
  registerImportMethod,
  filterChildren,
  convertJSXIdentifier,
} from '../shared/utils';
import { transformNode, getTemplateCreator } from './jsx';

/**
 * 组件转换
 * 
 * 组件与元素的区别：
 * 1. 组件调用 createComponent
 * 2. 属性作为 getter 传递（延迟求值）
 * 3. 子节点作为 children prop
 */
export function transformComponent(path: NodePath<JSXElement>): TransformResult {
  const config = getConfig(path);
  const tagId = convertComponentIdentifier(path.node.openingElement.name);
  const props: t.Expression[] = [];
  const runningObject: t.ObjectProperty[] = [];
  let dynamicSpread = false;
  
  // 处理属性
  path.get('openingElement').get('attributes').forEach((attr: any) => {
    const node = attr.node;
    
    if (t.isJSXSpreadAttribute(node)) {
      // Spread 属性
      if (runningObject.length) {
        props.push(t.objectExpression(runningObject));
        runningObject = [];
      }
      
      const spreadExpr = isDynamic(attr.get('argument'), { checkMember: true })
        ? (dynamicSpread = true) && (
            t.isCallExpression(node.argument) &&
            !node.argument.arguments.length &&
            !t.isCallExpression(node.argument.callee) &&
            !t.isMemberExpression(node.argument.callee)
              ? node.argument.callee
              : t.arrowFunctionExpression([], node.argument)
          )
        : node.argument;
      
      props.push(spreadExpr);
    } else {
      // 普通属性
      const value = node.value || t.booleanLiteral(true);
      const id = convertJSXIdentifier(node.name);
      const key = id.name;
      
      if (key === 'children') {
        // children 特殊处理
        return;
      }
      
      if (key === 'ref') {
        // ref 处理
        handleComponentRef(attr, runningObject);
        return;
      }
      
      // 分析值
      if (t.isJSXExpressionContainer(value)) {
        const expr = value.expression;
        
        if (isDynamic(attr.get('value').get('expression'), { checkMember: true, checkTags: true })) {
          // 动态属性 → getter
          runningObject.push(
            t.objectMethod(
              'get',
              id,
              [],
              t.blockStatement([t.returnStatement(expr)]),
              !t.isValidIdentifier(key)
            )
          );
        } else {
          // 静态属性
          runningObject.push(t.objectProperty(id, expr));
        }
      } else {
        // 字符串/布尔属性
        runningObject.push(t.objectProperty(id, value));
      }
    }
  });
  
  // 处理子节点作为 children
  const childResult = transformComponentChildren(path.get('children'), config);
  if (childResult) {
    if (childResult[1]) {
      // 动态 children
      runningObject.push(
        t.objectMethod(
          'get',
          t.identifier('children'),
          [],
          t.isExpression(childResult[0])
            ? t.blockStatement([t.returnStatement(childResult[0])])
            : t.blockStatement([t.returnStatement(childResult[0])])
        )
      );
    } else {
      runningObject.push(t.objectProperty(t.identifier('children'), childResult[0]));
    }
  }
  
  // 合并 props
  if (runningObject.length || !props.length) {
    props.push(t.objectExpression(runningObject));
  }
  
  // 合并多个 props
  if (props.length > 1 || dynamicSpread) {
    const merged = registerImportMethod(path, 'mergeProps');
    props[0] = t.callExpression(merged, props);
  }
  
  // 生成 createComponent 调用
  const createComponent = registerImportMethod(path, 'createComponent');
  const componentCall = t.callExpression(createComponent, [tagId, props[0]]);
  
  return {
    template: '',
    declarations: [],
    exprs: [componentCall],
    dynamics: [],
    postExprs: [],
    component: true,
    dynamic: true,
  };
}
```

### 7.2 SSR 转换

```typescript
// packages/compiler/src/transform/ssr/element.ts

import type * as t from '@babel/types';
import type { NodePath } from '@babel/core';
import type { JSXElement } from '@babel/types';
import type { TransformResult, TransformInfo } from '../../shared/types';

import { getConfig, getTagName, escapeHTML, registerImportMethod } from '../../shared/utils';
import { transformNode } from '../jsx';

/**
 * SSR 元素转换
 * 
 * SSR 模式特点：
 * 1. 生成 HTML 字符串拼接
 * 2. 动态内容使用 ssrElement/ssrAttribute helpers
 * 3. 避免不必要的 hydration 标记
 */
export function transformElement(
  path: NodePath<JSXElement>,
  info: TransformInfo
): TransformResult {
  const config = getConfig(path);
  const tagName = getTagName(path.node);
  
  // 检测 spread
  const hasSpread = path.node.openingElement.attributes.some(
    a => t.isJSXSpreadAttribute(a)
  );
  
  if (hasSpread) {
    return transformElementWithSpread(path, info);
  }
  
  // 初始化结果
  const results: TransformResult = {
    template: [`<${tagName}`],
    templateValues: [],
    declarations: [],
    exprs: [],
    dynamics: [],
    tagName,
    renderer: 'ssr',
  };
  
  // 处理 hydration key
  if (info.topLevel && config.hydratable) {
    results.template.push('');
    results.templateValues.push(
      t.callExpression(registerImportMethod(path, 'ssrHydrationKey'), [])
    );
  }
  
  // 处理属性
  transformSSRAttributes(path, results);
  
  // 闭合开始标签
  results.template.push('>');
  
  // 处理子节点
  transformSSRChildren(path, results);
  
  // 闭合标签
  if (!isVoidElement(tagName)) {
    results.template.push(`</${tagName}>`);
  }
  
  return results;
}
```

---

## 8. API 设计

### 8.1 Babel 插件 API

```typescript
// packages/compiler/src/index.ts

/**
 * Zeus JSX 编译器 Babel 插件
 * 
 * @example
 * ```javascript
 * // .babelrc
 * {
 *   "plugins": [
 *     ["@zeus-js/compiler", {
 *       "moduleName": "zeus",
 *       "generate": "dom",
 *       "delegateEvents": true
 *     }]
 *   ]
 * }
 * ```
 */
export default function zeusJSXPlugin(): PluginObj {
  // ...
}
```

### 8.2 Programmatic API

```typescript
// packages/compiler/src/api.ts

import { transformSync } from '@babel/core';
import zeusJSXPlugin from './index';
import type { CompilerOptions } from './config';

export interface TransformResult {
  code: string;
  map?: SourceMap;
  metadata?: {
    templates: string[];
    events: string[];
  };
}

export interface TransformOptions {
  code: string;
  filename?: string;
  options?: CompilerOptions;
  sourcemap?: boolean;
}

/**
 * 同步转换 JSX 代码
 */
export function transformSync(options: TransformOptions): TransformResult {
  const { code, filename = 'input.jsx', options: compilerOptions = {}, sourcemap = false } = options;
  
  const result = babel.transformSync(code, {
    filename,
    presets: ['@babel/preset-typescript'],
    plugins: [[zeusJSXPlugin, compilerOptions]],
    sourceMaps: sourcemap,
    configFile: false,
    babelrc: false,
  });
  
  return {
    code: result!.code!,
    map: result!.map,
    metadata: extractMetadata(result!),
  };
}

/**
 * 异步转换 JSX 代码
 */
export async function transformAsync(options: TransformOptions): Promise<TransformResult> {
  // ... 类似实现
}
```

### 8.3 Babel Preset API

```typescript
// addons/babel-preset-zeus/src/index.ts

import type { ConfigItem, ConfigFunction } from '@babel/core';
import type { CompilerOptions } from '@zeus-js/compiler';
import zeusJSXPlugin from '@zeus-js/compiler';

/**
 * Babel preset for Zeus
 * 
 * 组合 @babel/preset-typescript 和 compiler
 * 提供开箱即用的开发体验
 */
export default function zeusPreset(
  api: { cache: boolean; env: (key: string) => boolean },
  options: CompilerOptions = {}
): { presets: ConfigItem[]; plugins: ConfigItem[] } {
  const isDevelopment = api.env('development');
  
  return {
    presets: [
      // TypeScript 支持
      [require('@babel/preset-typescript'), {
        onlyRemoveTypeImports: true,
        allowDeclareFields: true,
      }],
    ],
    plugins: [
      // Zeus JSX 编译器
      [zeusJSXPlugin, {
        ...options,
        // 开发环境注入 dev runtime
        moduleName: isDevelopment ? 'zeus/dev' : 'zeus',
      }],
    ],
  };
}
```

### 8.4 Rollup 插件 API

```typescript
// addons/rollup-plugin-zeus/src/index.ts

import type { Plugin } from 'rollup';
import type { CompilerOptions } from '@zeus-js/compiler';
import { transformSync } from '@zeus-js/compiler';

export interface RollupPluginOptions {
  /**
   * 编译选项
   */
  options?: CompilerOptions;
  
  /**
   * 包含的文件
   * @default /\.[jt]sx?$/
   */
  include?: RegExp | string[];
  
  /**
   * 排除的文件
   * @default /node_modules/
   */
  exclude?: RegExp | string[];
  
  /**
   * 缓存目录
   */
  cacheDir?: string;
}

export function zeusRollupPlugin(options: RollupPluginOptions = {}): Plugin {
  const {
    options: compilerOptions = {},
    include = /\.[jt]sx?$/,
    exclude = /node_modules/,
  } = options;
  
  return {
    name: 'zeus-jsx',
    
    transform(code, id) {
      if (exclude.test(id)) return null;
      if (!include.test(id)) return null;
      
      const result = transformSync({
        code,
        filename: id,
        options: compilerOptions,
      });
      
      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}
```

### 8.5 Vite 插件 API

```typescript
// addons/vite-plugin-zeus/src/index.ts

import type { Plugin } from 'vite';
import type { CompilerOptions } from '@zeus-js/compiler';
import { transformSync } from '@zeus-js/compiler';

export interface VitePluginOptions {
  /**
   * 编译选项
   */
  options?: CompilerOptions;
  
  /**
   * 包含的文件
   * @default /\.[jt]sx?$/
   */
  include?: RegExp | string[];
  
  /**
   * 排除的文件
   * @default /node_modules/
   */
  exclude?: RegExp | string[];
}

export function zeusVitePlugin(options: VitePluginOptions = {}): Plugin {
  const {
    options: compilerOptions = {},
    include = /\.[jt]sx?$/,
    exclude = /node_modules/,
  } = options;
  
  return {
    name: 'zeus-jsx',
    
    transform(code, id) {
      if (exclude.test(id)) return null;
      if (!include.test(id)) return null;
      
      const result = transformSync({
        code,
        filename: id,
        options: compilerOptions,
      });
      
      return {
        code: result.code,
        map: result.map,
      };
    },
    
    // HMR 支持
    handleHotUpdate(ctx) {
      // 通知 Vite 进行 HMR
    },
  };
}
```

---

## 9. 实现计划

### 9.1 阶段划分

```
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 1: 核心基础设施 (2 周)                                           │
├─────────────────────────────────────────────────────────────────────┤
│ - [ ] 项目结构搭建                                                   │
│ - [ ] 配置模块 (config.ts)                                          │
│ - [ ] 类型定义 (types.ts)                                           │
│ - [ ] 工具函数 (utils.ts, dynamic.ts, escape.ts)                   │
│ - [ ] 常量定义 (constants.ts)                                        │
│ - [ ] Babel 插件入口 (index.ts)                                     │
│ - [ ] 预处理/后处理钩子                                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 2: DOM 元素转换 (2 周)                                          │
├─────────────────────────────────────────────────────────────────────┤
│ - [ ] 基础元素转换 (div, span 等)                                   │
│ - [ ] 静态属性内联                                                   │
│ - [ ] 动态属性处理                                                   │
│ - [ ] 事件处理 (onClick 等)                                         │
│ - [ ] class/className 处理                                          │
│ - [ ] style 处理                                                    │
│ - [ ] 子节点处理                                                     │
│ - [ ] Fragment 支持                                                 │
│ - [ ] 模板生成                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 3: 组件和高级特性 (2 周)                                         │
├─────────────────────────────────────────────────────────────────────┤
│ - [ ] 组件转换 (createComponent)                                     │
│ - [ ] ref 支持                                                      │
│ - [ ] 展开属性 (...props)                                           │
│ - [ ] 条件表达式包装                                                 │
│ - [ ] 列表渲染优化                                                   │
│ - [ ] SVG 支持                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 4: SSR 支持 (1 周)                                              │
├─────────────────────────────────────────────────────────────────────┤
│ - [ ] SSR 元素转换                                                  │
│ - [ ] SSR 属性处理                                                  │
│ - [ ] Hydration 支持                                                │
│ - [ ] SSR 运行时                                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 5: 集成和优化 (1 周)                                            │
├─────────────────────────────────────────────────────────────────────┤
│ - [ ] Rollup 插件                                                   │
│ - [ ] Vite 插件                                                     │
│ - [ ] 测试用例完善                                                  │
│ - [ ] 性能优化                                                      │
│ - [ ] 文档完善                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 测试计划

```
测试覆盖率目标：> 80%

测试分类：
├── 单元测试
│   ├── transform/
│   │   ├── element.test.ts
│   │   ├── component.test.ts
│   │   ├── fragment.test.ts
│   │   └── directive.test.ts
│   ├── shared/
│   │   ├── dynamic.test.ts
│   │   ├── escape.test.ts
│   │   └── utils.test.ts
│   └── ssr/
│       └── element.test.ts
│
├── 集成测试
│   ├── fixtures/
│   │   ├── dom/
│   │   │   ├── simple-element/
│   │   │   ├── dynamic-attrs/
│   │   │   ├── events/
│   │   │   ├── components/
│   │   │   └── ...
│   │   ├── ssr/
│   │   └── universal/
│   └── compare.test.ts
│
└── E2E 测试
    ├── playground/
    └── real-world/
```

---

## 10. 技术风险与应对

### 10.1 风险清单

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| Babel 编译速度瓶颈 | 高 | 中 | 1. 使用 Babel 的 `passPerPreset` 优化<br>2. 考虑 SWC/WASM 混合方案 |
| 复杂动态性检测遗漏 | 中 | 中 | 1. 完善测试用例<br>2. 参考 dom-expressions 的测试覆盖 |
| SSR/hydration 实现复杂度 | 高 | 高 | 1. 分阶段实现<br>2. 参考 SolidJS 现有实现 |
| ES5 兼容性问题 | 中 | 低 | 1. 使用 Babel 转译<br>2. 避免现代语法 |
| 维护成本增加 | 低 | 中 | 1. 代码模块化<br>2. 完善的文档和注释 |

### 10.2 性能优化策略

```
优化层级：
1. 解析优化
   - 使用 Babel 的 lightweight r API
   - 跳过不必要的 AST 遍历

2. 转换优化
   - 延迟处理非关键节点
   - 缓存动态性检测结果
   - 避免不必要的节点创建

3. 代码生成优化
   - 使用模板字符串拼接
   - 合并相似 import
   - 最小化辅助函数调用
```

---

## 附录 A: 完整类型参考

```typescript
// packages/compiler/src/shared/types.ts (完整版)

import type * as t from '@babel/types';
import type { NodePath } from '@babel/core';

// ==================== 配置类型 ====================

export interface CompilerOptions {
  moduleName?: string;
  generate?: 'dom' | 'ssr' | 'universal';
  hydratable?: boolean;
  delegateEvents?: boolean;
  delegatedEvents?: string[];
  requireImportSource?: string | false;
  wrapConditionals?: boolean;
  omitNestedClosingTags?: boolean;
  omitLastClosingTag?: boolean;
  omitQuotes?: boolean;
  contextToCustomElements?: boolean;
  staticMarker?: string;
  effectWrapper?: string;
  memoWrapper?: string;
  validate?: boolean;
  inlineStyles?: boolean;
}

// ==================== 转换结果类型 ====================

export interface TransformInfo {
  topLevel?: boolean;
  lastElement?: boolean;
  toBeClosed?: Set<string>;
  componentChild?: boolean;
  fragmentChild?: boolean;
  skipId?: boolean;
  doNotEscape?: boolean;
}

export interface TransformResult {
  // 模板相关
  template: string | string[];
  templateWithClosingTags?: string;
  
  // 模板值（用于 SSR）
  templateValues?: t.Expression[];
  
  // 元素 ID
  id?: t.Identifier;
  
  // 变量声明
  declarations: t.VariableDeclarator[];
  decl?: t.VariableDeclaration;
  
  // 表达式语句
  exprs: t.Statement[];
  
  // 动态属性
  dynamics: DynamicAttr[];
  
  // 后置表达式
  postExprs: t.Statement[];
  
  // 元信息
  tagName?: string;
  renderer?: 'dom' | 'ssr' | 'universal';
  isSVG?: boolean;
  hasCustomElement?: boolean;
  isImportNode?: boolean;
  skipTemplate?: boolean;
  text?: boolean;
  component?: boolean;
  dynamic?: boolean;
  spreadElement?: boolean;
  hasHydratableEvent?: boolean;
  wontEscape?: boolean;
}

// ==================== 属性类型 ====================

export interface DynamicAttr {
  elem: t.Identifier;
  key: string;
  value: t.Expression;
  isSVG?: boolean;
  isCE?: boolean;
  tagName?: string;
  prevId?: t.Identifier;
}

// ==================== 作用域数据 ====================

export interface ScopeData {
  templates?: TemplateInfo[];
  imports?: Map<string, Map<string, t.Identifier>>;
  events?: Set<string>;
  config?: CompilerOptions;
}

// ==================== 模板信息 ====================

export interface TemplateInfo {
  id: t.Identifier;
  template: string;
  templateWithClosingTags: string;
  isSVG: boolean;
  isCE: boolean;
  isImportNode: boolean;
  renderer: 'dom' | 'ssr' | 'universal';
}

// ==================== 作用域路径扩展 ====================

declare module '@babel/core' {
  interface NodePath<N = any> {
    scope: Scope & {
      data: ScopeData;
    };
  }
}
```

---

## 附录 B: 配置默认值参考

```typescript
// packages/compiler/src/config.ts

export const DEFAULT_CONFIG: Required<CompilerOptions> = {
  moduleName: 'zeus',
  generate: 'dom',
  hydratable: false,
  delegateEvents: true,
  delegatedEvents: [],
  requireImportSource: false,
  wrapConditionals: true,
  omitNestedClosingTags: false,
  omitLastClosingTag: true,
  omitQuotes: true,
  contextToCustomElements: false,
  staticMarker: '@once',
  effectWrapper: 'effect',
  memoWrapper: 'memo',
  validate: true,
  inlineStyles: true,
};
```

---

**文档版本**：1.0.0
**更新日期**：2026-04-07
**作者**：AI Assistant
**状态**：草稿
