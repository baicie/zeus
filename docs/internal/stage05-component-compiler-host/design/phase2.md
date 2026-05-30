# Phase 2：Component Analyzer 详细设计与代码草案

Phase 2 的目标是做一个独立的 **Component Analyzer**：

```txt id="wya1pc"
输入：Zeus defineElement 组件源码
  ↓
静态分析 defineElement / props / TS 类型 / emit / Host / Slot
  ↓
输出：ComponentManifest
```

它不负责打包，也不负责生成 React/Vue wrapper。后续 Phase 3 的 `bundler-plugin`、Phase 4 的 `output-wc`、Phase 6 的 `output-react-wrapper / output-vue-wrapper` 都消费它的输出。

当前 Zeus 已经具备这个阶段的基础：`runtime-dom` 已经导出 `defineElement / Host / Slot`，`defineElement` 的 options 里已有 `props / shadow / styles / consumes`，并且 `defineElement` 会在 render 时建立 hostContext，供 `Host/Slot` 使用。  
`Slot` 当前已经可以根据 shadow/light 模式选择原生 slot 或 light DOM children 分发，所以 Analyzer 要能识别 `<Slot />` 和 `<Slot name="xxx" />`。
compiler 现在仍然是单文件 JSX 编译链路，所以 Phase 2 不要污染 `@zeus-js/compiler` 主流程。

---

# 1. 包位置

新增：

```txt id="n96cb8"
packages/component-analyzer
```

原因：这是核心编译生态基础包，不是某个 bundler 的插件。当前 workspace 和构建脚本都会扫描 `packages/*`、`addons/*`，并通过 `buildOptions` 识别可构建包。 

---

# 2. Phase 2 范围

## 做

```txt id="unj2um"
1. 扫描 defineElement 调用
2. 提取 tag / exportName / source
3. 提取 runtime props
4. 提取 TypeScript Props 类型里的 literal union / required / description
5. 扫描 setup 内 emit('event', detail)
6. 扫描 <Slot /> / <Slot name="xxx" />
7. 扫描 <Host data-* aria-* class style part role />
8. 扫描 JSX part="xxx"
9. 合并 options.meta
10. 输出 ComponentManifest
11. 提供单文件 analyzeFile API
12. 提供多文件 analyzeComponents API
13. 增加测试
```

## 不做

```txt id="benq3y"
1. 不生成 React wrapper
2. 不生成 Vue wrapper
3. 不生成 d.ts
4. 不接入 Rollup/Vite/Rolldown
5. 不做完整 TypeScript checker
6. 不处理运行时动态 props
```

TypeScript checker 放 Phase 2.5 或 Phase 5 前补强。Phase 2 先用 Babel AST 做 80% 能力。

---

# 3. 用户写法目标

用户只写：

```tsx id="t87uvu"
import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface ButtonProps {
  /**
   * Button variant.
   */
  variant?: 'default' | 'outline' | 'ghost'

  /**
   * Button size.
   */
  size?: 'sm' | 'md' | 'lg'

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
      size: {
        type: String,
        default: 'md',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless button primitive',

      events: {
        press: {
          detail: {
            nativeEvent: 'MouseEvent',
          },
        },
      },

      slots: {
        default: {
          description: 'Button content',
        },
      },
    },
  },

  (props, { emit }) => {
    return (
      <Host
        data-slot="button"
        data-variant={props.variant}
        data-size={props.size}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button
          part="root"
          disabled={props.disabled}
          onClick={event => {
            if (props.disabled) return
            emit('press', { nativeEvent: event })
          }}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
```

Analyzer 输出：

```json id="tjgsf5"
{
  "components": [
    {
      "tag": "z-button",
      "name": "ZButton",
      "exportName": "ZButton",
      "source": "src/button.tsx",
      "props": {
        "variant": {
          "type": "string",
          "values": ["default", "outline", "ghost"],
          "default": "default",
          "reflect": true,
          "required": false,
          "description": "Button variant."
        },
        "size": {
          "type": "string",
          "values": ["sm", "md", "lg"],
          "default": "md",
          "reflect": true,
          "required": false,
          "description": "Button size."
        },
        "disabled": {
          "type": "boolean",
          "default": false,
          "reflect": true,
          "required": false
        }
      },
      "events": {
        "press": {
          "detail": {
            "nativeEvent": "MouseEvent"
          }
        }
      },
      "slots": {
        "default": {
          "description": "Button content"
        }
      },
      "hostAttributes": [
        "data-slot",
        "data-variant",
        "data-size",
        "data-disabled"
      ],
      "cssParts": ["root"],
      "description": "Headless button primitive"
    }
  ]
}
```

---

# 4. Manifest Schema

```ts id="sk63h1"
// packages/component-analyzer/src/types.ts

export type ComponentPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'unknown'

export interface ComponentManifest {
  version: 1
  components: ComponentRecord[]
}

export interface ComponentRecord {
  tag: string
  name: string
  exportName: string
  source: string

  props: Record<string, ComponentProp>
  events: Record<string, ComponentEvent>
  slots: Record<string, ComponentSlot>

  hostAttributes: string[]
  cssParts: string[]
  cssVars: string[]

  description?: string
  meta?: Record<string, unknown>
}

export interface ComponentProp {
  type: ComponentPropType
  required?: boolean
  values?: string[]
  default?: unknown
  reflect?: boolean
  attr?: string | false
  description?: string
}

export interface ComponentEvent {
  detail?: Record<string, string>
  description?: string
}

export interface ComponentSlot {
  description?: string
}

export interface AnalyzeFileResult {
  file: string
  components: ComponentRecord[]
  diagnostics: AnalyzerDiagnostic[]
}

export interface AnalyzeComponentsResult {
  manifest: ComponentManifest
  diagnostics: AnalyzerDiagnostic[]
}

export interface AnalyzerDiagnostic {
  level: 'warning' | 'error'
  file: string
  message: string
}

export interface AnalyzeFileOptions {
  file: string
  code: string
}

export interface AnalyzeComponentsOptions {
  root?: string
  include: string[]
  exclude?: string[]
}
```

---

# 5. 信息合并规则

## 优先级

```txt id="2n58hz"
1. defineElement tag/exportName/source
2. options.props runtime 定义
3. TypeScript Props 类型
4. setup 里的 emit()
5. JSX 里的 Host / Slot / part
6. options.meta 显式补充
```

## props 合并

```txt id="34tbx6"
runtime props 提供：
  type / default / reflect / attr

TS Props 提供：
  required / values / description

options.meta.props 提供：
  description / category / docs 等补充
```

## events 合并

```txt id="wbpwdm"
emit('press', { value: true })
  可推断 event name 和简单 detail

options.meta.events
  覆盖/补强 detail 类型和 description
```

## slots 合并

```txt id="p7dlq8"
<Slot />
  default slot

<Slot name="header" />
  named slot

options.meta.slots
  覆盖/补强 description
```

---

# 6. 包结构

```txt id="dyy3n7"
packages/component-analyzer/
  package.json
  src/
    index.ts
    types.ts
    analyzeFile.ts
    analyzeComponents.ts
    ast.ts
    extractDefineElement.ts
    extractProps.ts
    extractTypeProps.ts
    extractSetup.ts
    extractMeta.ts
    merge.ts
    utils.ts
  __tests__/
    analyzeFile.spec.ts
    fixtures/
      button.tsx
```

---

# 7. package.json 草案

```json id="7sm4av"
// packages/component-analyzer/package.json
{
  "name": "@zeus-js/component-analyzer",
  "version": "0.0.2",
  "description": "Zeus component analyzer",
  "type": "module",
  "main": "index.js",
  "module": "dist/component-analyzer.esm-bundler.js",
  "types": "dist/component-analyzer.d.ts",
  "files": [
    "index.js",
    "dist"
  ],
  "exports": {
    ".": {
      "types": "./dist/component-analyzer.d.ts",
      "node": {
        "production": "./dist/component-analyzer.cjs.prod.js",
        "development": "./dist/component-analyzer.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/component-analyzer.esm-bundler.js",
      "import": "./dist/component-analyzer.esm-bundler.js",
      "require": "./index.js"
    },
    "./*": "./*"
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusComponentAnalyzer",
    "formats": [
      "esm-bundler",
      "cjs"
    ]
  },
  "dependencies": {
    "@babel/parser": "catalog:",
    "@babel/types": "catalog:",
    "fast-glob": "^3.3.3"
  },
  "keywords": [
    "zeus",
    "web-components",
    "component-analyzer"
  ],
  "author": "Baicie",
  "license": "MIT"
}
```

根目录已经有 `@babel/parser`、`@babel/types`，Analyzer 直接沿用 Babel AST 生态即可。

---

# 8. 入口导出

```ts id="x4ibun"
// packages/component-analyzer/src/index.ts

export { analyzeFile } from './analyzeFile'
export { analyzeComponents } from './analyzeComponents'

export type {
  AnalyzeComponentsOptions,
  AnalyzeComponentsResult,
  AnalyzeFileOptions,
  AnalyzeFileResult,
  AnalyzerDiagnostic,
  ComponentEvent,
  ComponentManifest,
  ComponentProp,
  ComponentPropType,
  ComponentRecord,
  ComponentSlot,
} from './types'
```

---

# 9. AST 工具

## `ast.ts`

```ts id="vbf11p"
// packages/component-analyzer/src/ast.ts

import { parse } from '@babel/parser'
import * as t from '@babel/types'

export function parseSource(code: string, file: string): t.File {
  return parse(code, {
    sourceType: 'module',
    sourceFilename: file,
    plugins: [
      'typescript',
      'jsx',
      'decorators-legacy',
      'classProperties',
      'objectRestSpread',
    ],
  })
}

export function walk(
  node: t.Node | null | undefined,
  visitor: (node: t.Node, parent: t.Node | null) => void,
  parent: t.Node | null = null,
): void {
  if (!node) return

  visitor(node, parent)

  const keys = t.VISITOR_KEYS[node.type] ?? []

  for (const key of keys) {
    const value = (node as unknown as Record<string, unknown>)[key]

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          walk(child as t.Node, visitor, node)
        }
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      walk(value as t.Node, visitor, node)
    }
  }
}
```

---

# 10. 通用 utils

```ts id="4dlj9z"
// packages/component-analyzer/src/utils.ts

import * as t from '@babel/types'

export function getObjectKey(
  key: t.Expression | t.PrivateName,
): string | undefined {
  if (t.isIdentifier(key)) return key.name
  if (t.isStringLiteral(key)) return key.value
  if (t.isNumericLiteral(key)) return String(key.value)
  return undefined
}

export function getObjectProperty(
  object: t.ObjectExpression,
  name: string,
): t.Expression | t.PatternLike | undefined {
  for (const prop of object.properties) {
    if (!t.isObjectProperty(prop)) continue

    const key = getObjectKey(prop.key)

    if (key === name) {
      return prop.value
    }
  }

  return undefined
}

export function staticValue(node: t.Node | null | undefined): unknown {
  if (!node) return undefined

  if (t.isStringLiteral(node)) return node.value
  if (t.isNumericLiteral(node)) return node.value
  if (t.isBooleanLiteral(node)) return node.value
  if (t.isNullLiteral(node)) return null
  if (t.isIdentifier(node) && node.name === 'undefined') return undefined

  if (t.isArrayExpression(node)) {
    return node.elements.map(element => {
      if (!element) return null
      if (t.isSpreadElement(element)) return undefined
      return staticValue(element)
    })
  }

  if (t.isObjectExpression(node)) {
    const result: Record<string, unknown> = {}

    for (const prop of node.properties) {
      if (!t.isObjectProperty(prop)) continue

      const key = getObjectKey(prop.key)

      if (!key) continue

      result[key] = staticValue(prop.value)
    }

    return result
  }

  return undefined
}

export function getLeadingDescription(node: t.Node): string | undefined {
  const comments = node.leadingComments

  if (!comments?.length) return undefined

  const text = comments
    .map(comment => comment.value)
    .join('\n')
    .replace(/\*/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')

  return text || undefined
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

export function isIdentifierNamed(
  node: t.Node | null | undefined,
  name: string,
): node is t.Identifier {
  return Boolean(node && t.isIdentifier(node) && node.name === name)
}
```

---

# 11. 提取 defineElement

## `extractDefineElement.ts`

```ts id="yd0fau"
// packages/component-analyzer/src/extractDefineElement.ts

import * as t from '@babel/types'

import { walk } from './ast'
import {
  getObjectProperty,
  isIdentifierNamed,
} from './utils'

export interface DefineElementCallRecord {
  name: string
  exportName: string
  tag: string
  propsTypeName?: string
  options?: t.ObjectExpression
  setup?: t.Expression | t.SpreadElement | t.ArgumentPlaceholder
  call: t.CallExpression
}

export function extractDefineElementCalls(
  ast: t.File,
): DefineElementCallRecord[] {
  const defineElementLocalNames = collectDefineElementLocalNames(ast)
  const exportedNames = collectExportedNames(ast)
  const records: DefineElementCallRecord[] = []

  walk(ast.program, node => {
    if (!t.isVariableDeclarator(node)) return
    if (!t.isIdentifier(node.id)) return
    if (!t.isCallExpression(node.init)) return

    const call = node.init

    if (!isDefineElementCall(call, defineElementLocalNames)) return

    const tag = extractTag(call)
    if (!tag) return

    const name = node.id.name
    const options = extractOptions(call)
    const setup = call.arguments[2]
    const propsTypeName = extractPropsTypeName(call)

    const isExported = exportedNames.has(name)

    /**
     * MVP：优先分析 exported defineElement。
     * 非导出组件暂时跳过，避免误扫内部临时组件。
     */
    if (!isExported) return

    records.push({
      name,
      exportName: name,
      tag,
      propsTypeName,
      options,
      setup,
      call,
    })
  })

  return records
}

function collectDefineElementLocalNames(ast: t.File): Set<string> {
  const names = new Set<string>()

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue

    const source = node.source.value

    if (
      source !== '@zeus-js/zeus' &&
      source !== '@zeus-js/runtime-dom'
    ) {
      continue
    }

    for (const spec of node.specifiers) {
      if (!t.isImportSpecifier(spec)) continue

      const imported = spec.imported

      if (
        (t.isIdentifier(imported) && imported.name === 'defineElement') ||
        (t.isStringLiteral(imported) && imported.value === 'defineElement')
      ) {
        names.add(spec.local.name)
      }
    }
  }

  return names
}

function collectExportedNames(ast: t.File): Set<string> {
  const names = new Set<string>()

  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node)) {
      if (t.isVariableDeclaration(node.declaration)) {
        for (const declarator of node.declaration.declarations) {
          if (t.isIdentifier(declarator.id)) {
            names.add(declarator.id.name)
          }
        }
      }

      for (const spec of node.specifiers) {
        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.local)) {
          names.add(spec.local.name)
        }
      }
    }
  }

  return names
}

function isDefineElementCall(
  call: t.CallExpression,
  localNames: Set<string>,
): boolean {
  return (
    t.isIdentifier(call.callee) &&
    localNames.has(call.callee.name)
  )
}

function extractTag(call: t.CallExpression): string | undefined {
  const first = call.arguments[0]

  if (t.isStringLiteral(first)) {
    return first.value
  }

  return undefined
}

function extractOptions(
  call: t.CallExpression,
): t.ObjectExpression | undefined {
  const second = call.arguments[1]

  if (t.isObjectExpression(second)) {
    return second
  }

  return undefined
}

function extractPropsTypeName(
  call: t.CallExpression,
): string | undefined {
  const first = call.typeParameters?.params[0]

  if (!first) return undefined

  if (
    t.isTSTypeReference(first) &&
    t.isIdentifier(first.typeName)
  ) {
    return first.typeName.name
  }

  return undefined
}
```

---

# 12. 提取 runtime props

## `extractProps.ts`

```ts id="3o6b95"
// packages/component-analyzer/src/extractProps.ts

import * as t from '@babel/types'

import type { ComponentProp, ComponentPropType } from './types'

import {
  getObjectKey,
  getObjectProperty,
  staticValue,
} from './utils'

export function extractRuntimeProps(
  options: t.ObjectExpression | undefined,
): Record<string, ComponentProp> {
  if (!options) return {}

  const propsNode = getObjectProperty(options, 'props')

  if (!t.isObjectExpression(propsNode)) return {}

  const props: Record<string, ComponentProp> = {}

  for (const prop of propsNode.properties) {
    if (!t.isObjectProperty(prop)) continue

    const key = getObjectKey(prop.key)
    if (!key) continue

    props[key] = extractRuntimeProp(prop.value)
  }

  return props
}

function extractRuntimeProp(
  node: t.Expression | t.PatternLike,
): ComponentProp {
  if (t.isIdentifier(node)) {
    return {
      type: typeFromConstructorName(node.name),
    }
  }

  if (t.isObjectExpression(node)) {
    const typeNode = getObjectProperty(node, 'type')
    const attrNode = getObjectProperty(node, 'attr')
    const reflectNode = getObjectProperty(node, 'reflect')
    const defaultNode = getObjectProperty(node, 'default')

    const type =
      t.isIdentifier(typeNode)
        ? typeFromConstructorName(typeNode.name)
        : 'unknown'

    const prop: ComponentProp = {
      type,
    }

    if (attrNode) {
      const attr = staticValue(attrNode)

      if (attr === false || typeof attr === 'string') {
        prop.attr = attr
      }
    }

    if (reflectNode) {
      const reflect = staticValue(reflectNode)

      if (typeof reflect === 'boolean') {
        prop.reflect = reflect
      }
    }

    if (defaultNode) {
      /**
       * Function default cannot be evaluated statically in Phase 2.
       */
      if (!t.isFunctionExpression(defaultNode) && !t.isArrowFunctionExpression(defaultNode)) {
        prop.default = staticValue(defaultNode)
      }
    }

    return prop
  }

  return {
    type: 'unknown',
  }
}

function typeFromConstructorName(name: string): ComponentPropType {
  switch (name) {
    case 'String':
      return 'string'
    case 'Number':
      return 'number'
    case 'Boolean':
      return 'boolean'
    case 'Object':
      return 'object'
    case 'Array':
      return 'array'
    default:
      return 'unknown'
  }
}
```

---

# 13. 提取 TypeScript Props

Phase 2 先支持当前文件里的：

```ts id="bmil1f"
export interface ButtonProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
}
```

和：

```ts id="oj5z9u"
type ButtonProps = {
  variant?: 'default' | 'outline'
}
```

暂不支持跨文件 import 的 Props，后续用 TypeScript checker 补。

## `extractTypeProps.ts`

```ts id="78w7uc"
// packages/component-analyzer/src/extractTypeProps.ts

import * as t from '@babel/types'

import type { ComponentProp } from './types'

import { getLeadingDescription, getObjectKey } from './utils'

export function collectLocalPropTypes(
  ast: t.File,
): Map<string, Record<string, Partial<ComponentProp>>> {
  const map = new Map<string, Record<string, Partial<ComponentProp>>>()

  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node)) {
      const declaration = node.declaration

      if (t.isTSInterfaceDeclaration(declaration)) {
        map.set(declaration.id.name, extractInterfaceProps(declaration))
      }

      if (t.isTSTypeAliasDeclaration(declaration)) {
        const props = extractTypeAliasProps(declaration)

        if (props) {
          map.set(declaration.id.name, props)
        }
      }

      continue
    }

    if (t.isTSInterfaceDeclaration(node)) {
      map.set(node.id.name, extractInterfaceProps(node))
    }

    if (t.isTSTypeAliasDeclaration(node)) {
      const props = extractTypeAliasProps(node)

      if (props) {
        map.set(node.id.name, props)
      }
    }
  }

  return map
}

function extractInterfaceProps(
  node: t.TSInterfaceDeclaration,
): Record<string, Partial<ComponentProp>> {
  const result: Record<string, Partial<ComponentProp>> = {}

  for (const member of node.body.body) {
    if (!t.isTSPropertySignature(member)) continue

    const key = getObjectKey(member.key as t.Expression)
    if (!key) continue

    result[key] = extractTsProperty(member)
  }

  return result
}

function extractTypeAliasProps(
  node: t.TSTypeAliasDeclaration,
): Record<string, Partial<ComponentProp>> | undefined {
  if (!t.isTSTypeLiteral(node.typeAnnotation)) return undefined

  const result: Record<string, Partial<ComponentProp>> = {}

  for (const member of node.typeAnnotation.members) {
    if (!t.isTSPropertySignature(member)) continue

    const key = getObjectKey(member.key as t.Expression)
    if (!key) continue

    result[key] = extractTsProperty(member)
  }

  return result
}

function extractTsProperty(
  node: t.TSPropertySignature,
): Partial<ComponentProp> {
  const prop: Partial<ComponentProp> = {
    required: !node.optional,
  }

  const annotation = node.typeAnnotation?.typeAnnotation

  if (annotation) {
    const inferred = inferType(annotation)

    Object.assign(prop, inferred)
  }

  const description = getLeadingDescription(node)

  if (description) {
    prop.description = description
  }

  return prop
}

function inferType(
  node: t.TSType,
): Partial<ComponentProp> {
  if (t.isTSStringKeyword(node)) {
    return { type: 'string' }
  }

  if (t.isTSNumberKeyword(node)) {
    return { type: 'number' }
  }

  if (t.isTSBooleanKeyword(node)) {
    return { type: 'boolean' }
  }

  if (t.isTSArrayType(node)) {
    return { type: 'array' }
  }

  if (t.isTSTypeLiteral(node)) {
    return { type: 'object' }
  }

  if (t.isTSUnionType(node)) {
    const values: string[] = []
    let allStringLiteral = true

    for (const type of node.types) {
      if (
        t.isTSLiteralType(type) &&
        t.isStringLiteral(type.literal)
      ) {
        values.push(type.literal.value)
      } else {
        allStringLiteral = false
      }
    }

    if (allStringLiteral && values.length > 0) {
      return {
        type: 'string',
        values,
      }
    }
  }

  return {
    type: 'unknown',
  }
}
```

---

# 14. 提取 setup 信息：emit / Slot / Host / part

## `extractSetup.ts`

```ts id="zufvfr"
// packages/component-analyzer/src/extractSetup.ts

import * as t from '@babel/types'

import { walk } from './ast'
import { getObjectKey, staticValue, uniqueSorted } from './utils'

import type {
  ComponentEvent,
  ComponentSlot,
} from './types'

export interface SetupMeta {
  events: Record<string, ComponentEvent>
  slots: Record<string, ComponentSlot>
  hostAttributes: string[]
  cssParts: string[]
}

export function extractSetupMeta(
  setup: t.Expression | t.SpreadElement | t.ArgumentPlaceholder | undefined,
): SetupMeta {
  const events: Record<string, ComponentEvent> = {}
  const slots: Record<string, ComponentSlot> = {}
  const hostAttributes: string[] = []
  const cssParts: string[] = []

  if (!setup || t.isSpreadElement(setup) || t.isArgumentPlaceholder(setup)) {
    return {
      events,
      slots,
      hostAttributes,
      cssParts,
    }
  }

  walk(setup, node => {
    extractEmit(node, events)
    extractSlot(node, slots)
    extractHostAttributes(node, hostAttributes)
    extractCssParts(node, cssParts)
  })

  return {
    events,
    slots,
    hostAttributes: uniqueSorted(hostAttributes),
    cssParts: uniqueSorted(cssParts),
  }
}

function extractEmit(
  node: t.Node,
  events: Record<string, ComponentEvent>,
): void {
  if (!t.isCallExpression(node)) return

  if (!t.isIdentifier(node.callee, { name: 'emit' })) return

  const first = node.arguments[0]

  if (!t.isStringLiteral(first)) return

  const eventName = first.value

  events[eventName] ||= {}

  const detailNode = node.arguments[1]

  if (t.isObjectExpression(detailNode)) {
    events[eventName].detail = inferDetail(detailNode)
  }
}

function inferDetail(
  node: t.ObjectExpression,
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) continue

    const key = getObjectKey(prop.key)
    if (!key) continue

    result[key] = inferExpressionType(prop.value)
  }

  return result
}

function inferExpressionType(
  node: t.Expression | t.PatternLike,
): string {
  if (t.isStringLiteral(node)) return 'string'
  if (t.isNumericLiteral(node)) return 'number'
  if (t.isBooleanLiteral(node)) return 'boolean'
  if (t.isObjectExpression(node)) return 'object'
  if (t.isArrayExpression(node)) return 'array'
  if (t.isIdentifier(node)) return 'unknown'

  return 'unknown'
}

function extractSlot(
  node: t.Node,
  slots: Record<string, ComponentSlot>,
): void {
  if (!t.isJSXElement(node)) return

  const name = node.openingElement.name

  if (!t.isJSXIdentifier(name, { name: 'Slot' })) return

  const slotName = getJSXStringAttribute(node, 'name') ?? 'default'

  slots[slotName] ||= {}
}

function extractHostAttributes(
  node: t.Node,
  hostAttributes: string[],
): void {
  if (!t.isJSXElement(node)) return

  const name = node.openingElement.name

  if (!t.isJSXIdentifier(name, { name: 'Host' })) return

  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue
    if (!t.isJSXIdentifier(attr.name)) continue

    const attrName = normalizeJsxAttrName(attr.name.name)

    if (
      attrName.startsWith('data-') ||
      attrName.startsWith('aria-') ||
      attrName === 'role' ||
      attrName === 'part' ||
      attrName === 'class' ||
      attrName === 'style' ||
      attrName === 'id' ||
      attrName === 'tabindex'
    ) {
      hostAttributes.push(attrName)
    }
  }
}

function extractCssParts(
  node: t.Node,
  cssParts: string[],
): void {
  if (!t.isJSXElement(node)) return

  const value = getJSXStringAttribute(node, 'part')

  if (!value) return

  for (const part of value.split(/\s+/)) {
    if (part) cssParts.push(part)
  }
}

function getJSXStringAttribute(
  node: t.JSXElement,
  attrName: string,
): string | undefined {
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue
    if (!t.isJSXIdentifier(attr.name, { name: attrName })) continue

    if (!attr.value) return ''

    if (t.isStringLiteral(attr.value)) {
      return attr.value.value
    }

    if (
      t.isJSXExpressionContainer(attr.value) &&
      t.isExpression(attr.value.expression)
    ) {
      const value = staticValue(attr.value.expression)

      if (typeof value === 'string') return value
    }
  }

  return undefined
}

function normalizeJsxAttrName(name: string): string {
  switch (name) {
    case 'className':
      return 'class'
    case 'tabIndex':
      return 'tabindex'
    default:
      return name
  }
}
```

---

# 15. 提取 options.meta

## `extractMeta.ts`

```ts id="qymd46"
// packages/component-analyzer/src/extractMeta.ts

import * as t from '@babel/types'

import { getObjectProperty, staticValue } from './utils'

export interface InlineMeta {
  description?: string
  props?: Record<string, unknown>
  events?: Record<string, unknown>
  slots?: Record<string, unknown>
  cssVars?: string[]
  cssParts?: string[]
  [key: string]: unknown
}

export function extractInlineMeta(
  options: t.ObjectExpression | undefined,
): InlineMeta {
  if (!options) return {}

  const metaNode = getObjectProperty(options, 'meta')

  if (!t.isObjectExpression(metaNode)) return {}

  const value = staticValue(metaNode)

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as InlineMeta
}
```

---

# 16. merge 逻辑

## `merge.ts`

```ts id="5qy5g3"
// packages/component-analyzer/src/merge.ts

import type {
  ComponentEvent,
  ComponentProp,
  ComponentRecord,
  ComponentSlot,
} from './types'

import type { DefineElementCallRecord } from './extractDefineElement'
import type { InlineMeta } from './extractMeta'
import type { SetupMeta } from './extractSetup'

export interface BuildRecordOptions {
  file: string
  call: DefineElementCallRecord
  runtimeProps: Record<string, ComponentProp>
  typeProps: Record<string, Partial<ComponentProp>>
  setupMeta: SetupMeta
  inlineMeta: InlineMeta
}

export function buildComponentRecord(
  options: BuildRecordOptions,
): ComponentRecord {
  const {
    file,
    call,
    runtimeProps,
    typeProps,
    setupMeta,
    inlineMeta,
  } = options

  const props = mergeProps(
    runtimeProps,
    typeProps,
    inlineMeta.props as Record<string, Partial<ComponentProp>> | undefined,
  )

  const events = mergeEvents(
    setupMeta.events,
    inlineMeta.events as Record<string, ComponentEvent> | undefined,
  )

  const slots = mergeSlots(
    setupMeta.slots,
    inlineMeta.slots as Record<string, ComponentSlot> | undefined,
  )

  const cssParts = unique([
    ...setupMeta.cssParts,
    ...toStringArray(inlineMeta.cssParts),
  ])

  const cssVars = unique(toStringArray(inlineMeta.cssVars))

  const hostAttributes = unique(setupMeta.hostAttributes)

  return {
    tag: call.tag,
    name: call.name,
    exportName: call.exportName,
    source: file,
    props,
    events,
    slots,
    hostAttributes,
    cssParts,
    cssVars,
    description:
      typeof inlineMeta.description === 'string'
        ? inlineMeta.description
        : undefined,
    meta: stripKnownMetaFields(inlineMeta),
  }
}

function mergeProps(
  runtimeProps: Record<string, ComponentProp>,
  typeProps: Record<string, Partial<ComponentProp>>,
  metaProps?: Record<string, Partial<ComponentProp>>,
): Record<string, ComponentProp> {
  const names = unique([
    ...Object.keys(runtimeProps),
    ...Object.keys(typeProps),
    ...Object.keys(metaProps ?? {}),
  ])

  const result: Record<string, ComponentProp> = {}

  for (const name of names) {
    result[name] = {
      type: 'unknown',
      ...(typeProps[name] ?? {}),
      ...(runtimeProps[name] ?? {}),
      ...(metaProps?.[name] ?? {}),
    }
  }

  return result
}

function mergeEvents(
  inferred: Record<string, ComponentEvent>,
  explicit?: Record<string, ComponentEvent>,
): Record<string, ComponentEvent> {
  return {
    ...inferred,
    ...(explicit ?? {}),
  }
}

function mergeSlots(
  inferred: Record<string, ComponentSlot>,
  explicit?: Record<string, ComponentSlot>,
): Record<string, ComponentSlot> {
  return {
    ...inferred,
    ...(explicit ?? {}),
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

function stripKnownMetaFields(
  meta: InlineMeta,
): Record<string, unknown> | undefined {
  const rest = { ...meta }

  delete rest.description
  delete rest.props
  delete rest.events
  delete rest.slots
  delete rest.cssVars
  delete rest.cssParts

  return Object.keys(rest).length ? rest : undefined
}
```

---

# 17. analyzeFile

## `analyzeFile.ts`

```ts id="iwcje2"
// packages/component-analyzer/src/analyzeFile.ts

import { parseSource } from './ast'
import { extractDefineElementCalls } from './extractDefineElement'
import { extractInlineMeta } from './extractMeta'
import { extractRuntimeProps } from './extractProps'
import { extractSetupMeta } from './extractSetup'
import { collectLocalPropTypes } from './extractTypeProps'
import { buildComponentRecord } from './merge'

import type {
  AnalyzeFileOptions,
  AnalyzeFileResult,
} from './types'

export function analyzeFile(
  options: AnalyzeFileOptions,
): AnalyzeFileResult {
  const { file, code } = options
  const diagnostics: AnalyzeFileResult['diagnostics'] = []
  const components: AnalyzeFileResult['components'] = []

  try {
    const ast = parseSource(code, file)
    const calls = extractDefineElementCalls(ast)
    const localPropTypes = collectLocalPropTypes(ast)

    for (const call of calls) {
      const runtimeProps = extractRuntimeProps(call.options)

      const typeProps = call.propsTypeName
        ? localPropTypes.get(call.propsTypeName) ?? {}
        : {}

      if (call.propsTypeName && !localPropTypes.has(call.propsTypeName)) {
        diagnostics.push({
          level: 'warning',
          file,
          message: `Cannot resolve local props type "${call.propsTypeName}".`,
        })
      }

      const setupMeta = extractSetupMeta(call.setup)
      const inlineMeta = extractInlineMeta(call.options)

      components.push(
        buildComponentRecord({
          file,
          call,
          runtimeProps,
          typeProps,
          setupMeta,
          inlineMeta,
        }),
      )
    }
  } catch (error) {
    diagnostics.push({
      level: 'error',
      file,
      message:
        error instanceof Error
          ? error.message
          : String(error),
    })
  }

  return {
    file,
    components,
    diagnostics,
  }
}
```

---

# 18. analyzeComponents

## `analyzeComponents.ts`

```ts id="olgyxp"
// packages/component-analyzer/src/analyzeComponents.ts

import fs from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'

import { analyzeFile } from './analyzeFile'

import type {
  AnalyzeComponentsOptions,
  AnalyzeComponentsResult,
} from './types'

export async function analyzeComponents(
  options: AnalyzeComponentsOptions,
): Promise<AnalyzeComponentsResult> {
  const root = options.root ?? process.cwd()

  const files = await fg(options.include, {
    cwd: root,
    absolute: true,
    ignore: options.exclude ?? ['node_modules/**', '**/dist/**'],
  })

  const components = []
  const diagnostics = []

  for (const file of files) {
    const code = await fs.readFile(file, 'utf-8')
    const result = analyzeFile({
      file: normalizePath(path.relative(root, file)),
      code,
    })

    components.push(...result.components)
    diagnostics.push(...result.diagnostics)
  }

  return {
    manifest: {
      version: 1,
      components,
    },
    diagnostics,
  }
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/')
}
```

---

# 19. 测试设计

## 测试目录

```txt id="71xwav"
packages/component-analyzer/__tests__/
  analyzeFile.spec.ts
  analyzeComponents.spec.ts
```

---

## `analyzeFile.spec.ts`

```ts id="gs6b6m"
// packages/component-analyzer/__tests__/analyzeFile.spec.ts

import { describe, expect, it } from 'vitest'
import { analyzeFile } from '../src/analyzeFile'

describe('analyzeFile', () => {
  it('extracts component manifest from defineElement', () => {
    const code = `
      import { defineElement, Host, Slot } from '@zeus-js/zeus'

      export interface ButtonProps {
        /**
         * Button variant.
         */
        variant?: 'default' | 'outline' | 'ghost'

        /**
         * Disabled state.
         */
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
          meta: {
            description: 'Headless button primitive',
            events: {
              press: {
                detail: {
                  nativeEvent: 'MouseEvent',
                },
              },
            },
            slots: {
              default: {
                description: 'Button content',
              },
            },
            cssVars: ['--z-button-bg'],
          },
        },
        (props, { emit }) => {
          return (
            <Host
              data-slot="button"
              data-variant={props.variant}
              data-disabled={props.disabled ? '' : undefined}
            >
              <button
                part="root"
                disabled={props.disabled}
                onClick={event => emit('press', { nativeEvent: event })}
              >
                <Slot />
              </button>
            </Host>
          )
        },
      )
    `

    const result = analyzeFile({
      file: 'src/button.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components).toHaveLength(1)

    expect(result.components[0]).toMatchObject({
      tag: 'z-button',
      name: 'ZButton',
      exportName: 'ZButton',
      source: 'src/button.tsx',
      description: 'Headless button primitive',
      props: {
        variant: {
          type: 'string',
          values: ['default', 'outline', 'ghost'],
          default: 'default',
          reflect: true,
          required: false,
          description: 'Button variant.',
        },
        disabled: {
          type: 'boolean',
          default: false,
          reflect: true,
          required: false,
          description: 'Disabled state.',
        },
      },
      events: {
        press: {
          detail: {
            nativeEvent: 'MouseEvent',
          },
        },
      },
      slots: {
        default: {
          description: 'Button content',
        },
      },
      hostAttributes: [
        'data-disabled',
        'data-slot',
        'data-variant',
      ],
      cssParts: ['root'],
      cssVars: ['--z-button-bg'],
    })
  })

  it('extracts named slots', () => {
    const code = `
      import { defineElement, Slot } from '@zeus-js/zeus'

      export const ZCard = defineElement(
        'z-card',
        {},
        () => {
          return (
            <section>
              <Slot name="header" />
              <Slot />
              <Slot name="footer" />
            </section>
          )
        },
      )
    `

    const result = analyzeFile({
      file: 'src/card.tsx',
      code,
    })

    expect(result.components[0].slots).toEqual({
      default: {},
      footer: {},
      header: {},
    })
  })

  it('warns when props type cannot be resolved locally', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'
      import type { ButtonProps } from './types'

      export const ZButton = defineElement<ButtonProps>(
        'z-button',
        {},
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/button.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([
      {
        level: 'warning',
        file: 'src/button.tsx',
        message: 'Cannot resolve local props type "ButtonProps".',
      },
    ])
  })

  it('ignores non-exported defineElement by default', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      const Internal = defineElement('z-internal', {}, () => null)
    `

    const result = analyzeFile({
      file: 'src/internal.tsx',
      code,
    })

    expect(result.components).toEqual([])
  })
})
```

---

# 20. analyzeComponents 测试

```ts id="13qhk6"
// packages/component-analyzer/__tests__/analyzeComponents.spec.ts

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { analyzeComponents } from '../src/analyzeComponents'

describe('analyzeComponents', () => {
  it('scans files and returns manifest', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-analyzer-'),
    )

    await fs.mkdir(path.join(root, 'src'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/button.tsx'),
      `
        import { defineElement } from '@zeus-js/zeus'

        export const ZButton = defineElement(
          'z-button',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])
    expect(result.manifest).toMatchObject({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
        },
      ],
    })
  })
})
```

---

# 21. 集成到 examples 的调试脚本

Phase 2 可以先不接 bundler，但可以新增一个临时脚本用于调试：

```txt id="6olv98"
scripts/debug/analyze-components.ts
```

```ts id="g4gqob"
// scripts/debug/analyze-components.ts

import { analyzeComponents } from '@zeus-js/component-analyzer'

const result = await analyzeComponents({
  root: process.cwd(),
  include: ['examples/web-component/src/components/**/*.{ts,tsx}'],
})

console.log(JSON.stringify(result.manifest, null, 2))

if (result.diagnostics.length) {
  console.error(result.diagnostics)
}
```

根目录加脚本：

```json id="z6srm5"
{
  "scripts": {
    "debug:analyze-components": "tsx scripts/debug/analyze-components.ts"
  }
}
```

这个脚本不是正式 API，只用于 Phase 2 验证。

---

# 22. 对 `defineElement` options 的轻量增强

为了支持 `options.meta` 类型，需要在 `runtime-dom/src/defineElement.ts` 增加类型字段，但运行时完全忽略。

当前 `DefineElementOptions` 是：

```ts id="dwodc0"
export interface DefineElementOptions<P extends Record<string, unknown>> {
  shadow?: boolean | ShadowRootInit
  props?: PropOptions<P>
  styles?: string | string[]
  consumes?: Context<any>[]
}
```

建议改为：

```ts id="t8nmro"
// packages/runtime-dom/src/defineElement.ts

export interface DefineElementMeta {
  description?: string

  props?: Record<
    string,
    {
      description?: string
      category?: string
      docs?: string
    }
  >

  events?: Record<
    string,
    {
      description?: string
      detail?: Record<string, string>
    }
  >

  slots?: Record<
    string,
    {
      description?: string
    }
  >

  cssVars?: string[]
  cssParts?: string[]

  /**
   * Reserved for userland/plugin-specific metadata.
   */
  [key: string]: unknown
}

export interface DefineElementOptions<P extends Record<string, unknown>> {
  shadow?: boolean | ShadowRootInit
  props?: PropOptions<P>
  styles?: string | string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  consumes?: Context<any>[]

  /**
   * Metadata only.
   * Runtime does not consume this field.
   */
  meta?: DefineElementMeta
}
```

再在 `runtime-dom/src/index.ts` 导出类型：

```ts id="k5sz7r"
export {
  defineElement,
  type DefineElementMeta,
  type DefineElementOptions,
  type DefineElementContext,
  type DefineElementSetup,
  type ElementPropConstructor,
  type PropDefinition,
  type PropOptions,
} from './defineElement'
```

`@zeus-js/zeus` 主入口也可以跟着导出 `DefineElementMeta` 类型。

---

# 23. Phase 2 文档草案

新增：

```txt id="wcg1qw"
docs/internal/design/component-compiler-host-phase2.md
```

内容：

````md id="f04l2t"
# Component Compiler Host Phase 2

## Goal

Introduce `@zeus-js/component-analyzer` to extract `ComponentManifest` from `defineElement` source files.

## Non-goals

- no bundler plugin
- no React wrapper
- no Vue wrapper
- no dts output
- no TypeScript checker

## Main source of truth

`defineElement` is the component declaration.

```tsx
export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    props: {},
    meta: {},
  },
  setup,
)
````

## Metadata sources

1. defineElement tag
2. runtime props
3. TypeScript props
4. emit()
5. Host
6. Slot
7. JSX part
8. options.meta

## Output

```ts
interface ComponentManifest {
  version: 1
  components: ComponentRecord[]
}
```

## Limitations

* imported Props types are not resolved in Phase 2
* dynamic tags are not supported
* dynamic props definitions are not supported
* computed event names are not supported

````

---

# 24. 验收清单

```txt id="uh1spf"
[ ] 新增 packages/component-analyzer
[ ] analyzeFile 能提取 defineElement
[ ] analyzeFile 能提取 runtime props
[ ] analyzeFile 能提取本地 TS interface/type literal
[ ] analyzeFile 能提取 emit 事件
[ ] analyzeFile 能提取 Slot / named Slot
[ ] analyzeFile 能提取 Host attributes
[ ] analyzeFile 能提取 JSX part
[ ] analyzeFile 能合并 options.meta
[ ] analyzeComponents 能 glob 扫描
[ ] runtime-dom DefineElementOptions 增加 meta 类型
[ ] 单测覆盖主要场景
[ ] docs/internal/design/component-compiler-host-phase2.md
[ ] pnpm build
[ ] pnpm build-dts
[ ] pnpm check
[ ] pnpm test-unit
````

---

# 25. 推荐提交顺序

```bash id="mipddn"
# 1. 类型增强
git add packages/runtime-dom/src/defineElement.ts packages/runtime-dom/src/index.ts packages/zeus/src/index.ts
git commit -m "feat(runtime-dom): add defineElement metadata type"

# 2. analyzer 包骨架
git add packages/component-analyzer/package.json packages/component-analyzer/src
git commit -m "feat(component-analyzer): add manifest extraction core"

# 3. analyzer 测试
git add packages/component-analyzer/__tests__
git commit -m "test(component-analyzer): cover defineElement manifest extraction"

# 4. debug script
git add scripts/debug/analyze-components.ts package.json
git commit -m "chore: add component analyzer debug script"

# 5. docs
git add docs/internal/design/component-compiler-host-phase2.md
git commit -m "docs: add component analyzer phase2 design"
```

---

# 26. Phase 2 完成后的产物

完成后你会得到：

```ts id="pxgygl"
import { analyzeComponents } from '@zeus-js/component-analyzer'

const result = await analyzeComponents({
  root: process.cwd(),
  include: ['src/components/**/*.{ts,tsx}'],
})

console.log(result.manifest)
```

输出：

```json id="sp0qvp"
{
  "version": 1,
  "components": [
    {
      "tag": "z-button",
      "name": "ZButton",
      "exportName": "ZButton",
      "source": "src/components/button.tsx",
      "props": {},
      "events": {},
      "slots": {},
      "hostAttributes": [],
      "cssParts": [],
      "cssVars": []
    }
  ]
}
```

---

# 27. Phase 2 完成后的价值

Phase 2 是后面所有生态能力的中间层：

```txt id="k4aoox"
defineElement 源码
  ↓
@zeus-js/component-analyzer
  ↓
ComponentManifest
  ↓
output-wc
output-react-wrapper
output-vue-wrapper
output-docs
output-registry
```

它解决的是：

```txt id="8o92d2"
不要重复写 .meta.ts
不要手写 React/Vue 类型
不要每个输出插件自己解析源码
不要把多输出逻辑塞进 compiler
```

下一阶段 Phase 3 就可以做：

```txt id="eygekj"
@zeus-js/bundler-plugin
  - 复用当前 vite-plugin transform
  - 在 buildStart 调 analyzeComponents
  - 把 ComponentManifest 传给 outputs
```

这时 `output-wc / output-react-wrapper / output-vue-wrapper` 都只消费 manifest，不再关心源码怎么写。
