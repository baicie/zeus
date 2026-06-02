# Phase 4：`@zeus-js/output-wc` 详细设计与代码草案

Phase 4 的目标是实现第一个正式输出插件：

```txt id="jow62z"
@zeus-js/output-wc
```

它消费 Phase 2 的 `ComponentManifest`，运行在 Phase 3 的 `@zeus-js/bundler-plugin` outputs 生命周期里，负责输出 Web Component 相关产物。

当前 Zeus 的 `defineElement` 已经会在模块执行时调用 `customElements.define(tagName, ZeusElement)`，并且有重复注册保护，所以 `output-wc` 不需要重新生成 `customElements.define` 代码，只需要生成导入组件源码的入口文件即可。
`defineElement` 本身已经负责 props、attribute/property 同步、shadow/light 渲染、styles、CustomEvent、生命周期等 Web Component 运行时能力。
Phase 4 仍然不做 React/Vue wrapper，那是 Phase 6。

---

# 1. Phase 4 目标

## 做什么

```txt id="l4d9l0"
1. 新增 addons/output-wc
2. 实现 ZeusOutputPlugin
3. 生成每个组件的 Web Component entry
4. 生成 wc/index.js
5. 生成 components manifest JSON
6. 生成 custom-elements.json
7. 生成基础 wc/index.d.ts
8. 支持 fileName 规则配置
9. 支持 preserve tag prefix / strip prefix
10. 支持 sideEffects 使用说明
11. 增加单测
12. 接入 examples/web-component 验证
```

## 不做什么

```txt id="p66iy7"
1. 不生成 React wrapper
2. 不生成 Vue wrapper
3. 不做 shadcn-like registry
4. 不做完整跨框架 dts
5. 不做 TS checker
6. 不重新实现 defineElement
7. 不在 output-wc 里重新 customElements.define
```

---

# 2. 使用方式

## Vite

```ts id="w2soew"
// vite.config.ts
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
          outDir: 'dist/wc',
          manifestFile: 'dist/zeus.components.json',
          customElementsFile: 'dist/custom-elements.json',
          dts: true,
        }),
      ],
    }),
  ],
})
```

## Rollup / Rolldown

```ts id="i9cqub"
// rollup.config.ts
import zeus from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [wc()],
    }),
  ],
}
```

---

# 3. 输出效果

假设有两个组件：

```txt id="0r1cij"
src/components/button.tsx  -> z-button
src/components/card.tsx    -> z-card
```

输出：

```txt id="eigsyy"
dist/
  wc/
    z-button.js
    z-card.js
    index.js
    index.d.ts
    jsx.d.ts
  zeus.components.json
  custom-elements.json
```

用户可以按需导入：

```ts id="8urh99"
import '@zeus-ui/headless/wc/z-button'
```

或者全量注册：

```ts id="fhc4h8"
import '@zeus-ui/headless/wc'
```

HTML 使用：

```html id="64i2gs"
<z-button variant="default">Button</z-button>
```

---

# 4. 重要设计原则

## 4.1 output-wc 只生成 entry，不重新定义组件

组件源码里：

```tsx id="ie3hgh"
export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    props: {},
  },
  setup,
)
```

`defineElement` 执行时已经注册 custom element。`output-wc` 生成的入口只需要：

```ts id="qkq7z6"
import { ZButton } from '/absolute/path/src/components/button.tsx'

export { ZButton }
```

这样导入 `dist/wc/z-button.js` 时，会执行源模块，完成注册。

## 4.2 每个组件一个独立入口

```txt id="iiqkf4"
dist/wc/z-button.js
dist/wc/z-card.js
```

这样用户只用一个组件时，不会注册所有组件。

## 4.3 `wc/index.js` 是全量入口

```ts id="9txnkx"
import './z-button.js'
import './z-card.js'

export * from './z-button.js'
export * from './z-card.js'
```

实际 virtual module 中会用 `zeus:wc:z-button` 互相引用，最后由 bundler 输出成真实文件。

## 4.4 Web Component entry 是副作用模块

因为导入后会执行 `customElements.define`，所以组件库包必须配置：

```json id="jftg7d"
{
  "sideEffects": ["dist/wc/*.js", "dist/wc/**/*.js", "**/*.css"]
}
```

不能简单写 `"sideEffects": false`。

---

# 5. 包位置

```txt id="8tlsjt"
addons/output-wc
```

原因：它是构建生态插件，和 `addons/bundler-plugin` 同属一类，不是 runtime 核心。

当前 workspace 已经覆盖 `addons/*`，构建脚本也会扫描 `addons` 下带 `buildOptions` 的包。

---

# 6. 包结构

```txt id="ayp87q"
addons/output-wc/
  package.json
  src/
    index.ts
    types.ts
    naming.ts
    imports.ts
    generateEntry.ts
    generateIndex.ts
    generateManifest.ts
    generateCustomElementsJson.ts
    generateDts.ts
  __tests__/
    outputWc.spec.ts
    generateCustomElementsJson.spec.ts
    generateDts.spec.ts
```

---

# 7. package.json 草案

```json id="r8w2u5"
// addons/output-wc/package.json
{
  "name": "@zeus-js/output-wc",
  "version": "0.0.2",
  "description": "Zeus Web Component output plugin",
  "type": "module",
  "main": "index.js",
  "module": "dist/output-wc.esm-bundler.js",
  "types": "dist/output-wc.d.ts",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/output-wc.d.ts",
      "node": {
        "production": "./dist/output-wc.cjs.prod.js",
        "development": "./dist/output-wc.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/output-wc.esm-bundler.js",
      "import": "./dist/output-wc.esm-bundler.js",
      "require": "./index.js"
    },
    "./*": "./*"
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusOutputWC",
    "formats": ["esm-bundler", "cjs"]
  },
  "dependencies": {
    "@zeus-js/bundler-plugin": "workspace:*",
    "@zeus-js/component-analyzer": "workspace:*"
  },
  "keywords": ["zeus", "web-components", "custom-elements"],
  "author": "Baicie",
  "license": "MIT"
}
```

`@zeus-js/output-wc` 自己没有副作用，可以 `sideEffects: false`。真正有副作用的是被它生成到用户组件库里的 `dist/wc/*.js`。

---

# 8. Options 设计

## `types.ts`

```ts id="x4gs70"
// addons/output-wc/src/types.ts

export interface OutputWCOptions {
  /**
   * Output directory for Web Component entries.
   *
   * @default 'dist/wc'
   */
  outDir?: string

  /**
   * Raw Zeus ComponentManifest output file.
   *
   * @default 'dist/zeus.components.json'
   */
  manifestFile?: string | false

  /**
   * Custom Elements Manifest output file.
   *
   * @default 'dist/custom-elements.json'
   */
  customElementsFile?: string | false

  /**
   * Whether to emit basic d.ts for native Web Components.
   *
   * Full cross-framework dts will be handled in later phases.
   *
   * @default true
   */
  dts?: boolean

  /**
   * Whether to emit JSX intrinsic element declarations.
   *
   * @default true
   */
  jsxDts?: boolean

  /**
   * Strip tag prefix from output file name.
   *
   * Example:
   *   stripPrefix: 'z-'
   *   z-button -> button.js
   *
   * Default keeps full tag:
   *   z-button -> z-button.js
   */
  stripPrefix?: string | false

  /**
   * File name formatter.
   * Higher priority than stripPrefix.
   */
  fileName?: (tag: string) => string

  /**
   * Whether to generate one wc/index.js entry that imports all components.
   *
   * @default true
   */
  index?: boolean

  /**
   * Whether to warn when two components map to the same file name.
   *
   * @default true
   */
  warnOnFileNameCollision?: boolean
}
```

---

# 9. 文件命名规则

## `naming.ts`

```ts id="mj3zm4"
// addons/output-wc/src/naming.ts

import type { OutputWCOptions } from './types'

export function getComponentFileBaseName(
  tag: string,
  options: OutputWCOptions,
): string {
  if (options.fileName) {
    return sanitizeFileName(options.fileName(tag)).replace(/\.js$/, '')
  }

  let name = tag

  if (options.stripPrefix && name.startsWith(options.stripPrefix)) {
    name = name.slice(options.stripPrefix.length)
  }

  return sanitizeFileName(name)
}

export function getComponentFileName(
  tag: string,
  options: OutputWCOptions,
): string {
  return `${getComponentFileBaseName(tag, options)}.js`
}

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
```

默认：

```txt id="1ze3lo"
z-button -> z-button.js
```

如果配置：

```ts id="c17xx9"
wc({ stripPrefix: 'z-' })
```

则：

```txt id="fgelwo"
z-button -> button.js
```

---

# 10. 源文件 import 处理

虚拟模块需要导入组件源码。组件 manifest 的 `source` 是相对 root 的路径，所以需要转成 bundler 可解析的路径。

## `imports.ts`

```ts id="st3sj1"
// addons/output-wc/src/imports.ts

import path from 'node:path'

export function toAbsoluteImportPath(root: string, source: string): string {
  const absolute = path.resolve(root, source)

  /**
   * Rollup/Rolldown can resolve normalized absolute paths.
   * Windows path needs slash normalization.
   */
  return normalizePath(absolute)
}

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}
```

> 后续如果发现 Windows 下 Rollup 对 `C:/xxx` 解析不稳定，可以在 Phase 4.1 给 `bundler-plugin` 增加 source alias registry，例如 `zeus:source:<hash>`。Phase 4 先用绝对路径，简单可落地。

---

# 11. 生成单组件 entry

## `generateEntry.ts`

```ts id="k7s1ge"
// addons/output-wc/src/generateEntry.ts

import { toAbsoluteImportPath } from './imports'

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateWCEntryOptions {
  root: string
  component: ComponentRecord
}

export function generateWCEntry(options: GenerateWCEntryOptions): string {
  const { root, component } = options
  const source = toAbsoluteImportPath(root, component.source)

  /**
   * Importing the source module triggers defineElement() registration.
   */
  return [
    `import { ${component.exportName} } from ${JSON.stringify(source)};`,
    '',
    `export { ${component.exportName} };`,
    '',
  ].join('\n')
}
```

如果源文件里：

```ts id="rmfj2h"
export const ZButton = defineElement(...)
```

生成：

```ts id="smip3e"
import { ZButton } from '/repo/src/components/button.tsx'

export { ZButton }
```

---

# 12. 生成 wc/index.js

## `generateIndex.ts`

```ts id="s0fwde"
// addons/output-wc/src/generateIndex.ts

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateWCIndexOptions {
  components: ComponentRecord[]
}

export function generateWCIndex(options: GenerateWCIndexOptions): string {
  const { components } = options

  const lines: string[] = []

  for (const component of components) {
    const id = getVirtualComponentId(component)

    lines.push(`export * from ${JSON.stringify(id)};`)
  }

  lines.push('')

  return lines.join('\n')
}

export function getVirtualComponentId(component: ComponentRecord): string {
  return `zeus:wc:${component.tag}`
}

export function getVirtualIndexId(): string {
  return 'zeus:wc:index'
}
```

`export * from 'zeus:wc:z-button'` 会导入该虚拟模块，也会触发组件注册。

---

# 13. 生成原始 manifest JSON

## `generateManifest.ts`

```ts id="0f7t59"
// addons/output-wc/src/generateManifest.ts

import type { ComponentManifest } from '@zeus-js/component-analyzer'

export function generateZeusComponentsManifest(
  manifest: ComponentManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
```

输出：

```txt id="ou78jq"
dist/zeus.components.json
```

这个文件是 Zeus 自己的中间 manifest，比 `custom-elements.json` 信息更贴合内部输出插件。

---

# 14. 生成 custom-elements.json

Custom Elements Manifest 是生态常见格式，文档、IDE、组件目录可以消费它。

## `generateCustomElementsJson.ts`

```ts id="qtsp6b"
// addons/output-wc/src/generateCustomElementsJson.ts

import type {
  ComponentManifest,
  ComponentProp,
  ComponentRecord,
} from '@zeus-js/component-analyzer'

export interface CustomElementsManifest {
  schemaVersion: string
  readme?: string
  modules: CustomElementModule[]
}

export interface CustomElementModule {
  kind: 'javascript-module'
  path: string
  declarations: CustomElementDeclaration[]
  exports?: CustomElementExport[]
}

export interface CustomElementDeclaration {
  kind: 'class'
  name: string
  tagName: string
  customElement: true
  description?: string
  attributes?: CustomElementAttribute[]
  members?: CustomElementMember[]
  events?: CustomElementEvent[]
  slots?: CustomElementSlot[]
  cssParts?: CustomElementCssPart[]
  cssProperties?: CustomElementCssProperty[]
}

export interface CustomElementAttribute {
  name: string
  description?: string
  type?: {
    text: string
  }
  default?: string
}

export interface CustomElementMember {
  kind: 'field'
  name: string
  description?: string
  type?: {
    text: string
  }
  default?: string
}

export interface CustomElementEvent {
  name: string
  description?: string
  type?: {
    text: string
  }
}

export interface CustomElementSlot {
  name: string
  description?: string
}

export interface CustomElementCssPart {
  name: string
  description?: string
}

export interface CustomElementCssProperty {
  name: string
  description?: string
}

export interface CustomElementExport {
  kind: 'js'
  name: string
  declaration: {
    name: string
    module: string
  }
}

export interface GenerateCustomElementsOptions {
  manifest: ComponentManifest
  getModulePath: (component: ComponentRecord) => string
}

export function generateCustomElementsJson(
  options: GenerateCustomElementsOptions,
): string {
  const { manifest, getModulePath } = options

  const result: CustomElementsManifest = {
    schemaVersion: '1.0.0',
    modules: manifest.components.map(component => {
      const modulePath = normalizeModulePath(getModulePath(component))

      return {
        kind: 'javascript-module',
        path: modulePath,
        declarations: [
          {
            kind: 'class',
            name: `${component.name}Element`,
            tagName: component.tag,
            customElement: true,
            description: component.description,
            attributes: generateAttributes(component),
            members: generateMembers(component),
            events: generateEvents(component),
            slots: generateSlots(component),
            cssParts: component.cssParts.map(name => ({ name })),
            cssProperties: component.cssVars.map(name => ({ name })),
          },
        ],
        exports: [
          {
            kind: 'js',
            name: component.exportName,
            declaration: {
              name: `${component.name}Element`,
              module: modulePath,
            },
          },
        ],
      }
    }),
  }

  return `${JSON.stringify(result, null, 2)}\n`
}

function generateAttributes(
  component: ComponentRecord,
): CustomElementAttribute[] {
  const result: CustomElementAttribute[] = []

  for (const [name, prop] of Object.entries(component.props)) {
    const attrName = getAttributeName(name, prop)

    if (attrName === false) continue

    result.push({
      name: attrName,
      description: prop.description,
      type: {
        text: formatPropType(prop),
      },
      default:
        prop.default === undefined ? undefined : JSON.stringify(prop.default),
    })
  }

  return result
}

function generateMembers(component: ComponentRecord): CustomElementMember[] {
  return Object.entries(component.props).map(([name, prop]) => {
    return {
      kind: 'field',
      name,
      description: prop.description,
      type: {
        text: formatPropType(prop),
      },
      default:
        prop.default === undefined ? undefined : JSON.stringify(prop.default),
    }
  })
}

function generateEvents(component: ComponentRecord): CustomElementEvent[] {
  return Object.entries(component.events).map(([name, event]) => {
    return {
      name,
      description: event.description,
      type: {
        text: event.detail
          ? `CustomEvent<${formatDetailType(event.detail)}>`
          : 'CustomEvent',
      },
    }
  })
}

function generateSlots(component: ComponentRecord): CustomElementSlot[] {
  return Object.entries(component.slots).map(([name, slot]) => {
    return {
      name: name === 'default' ? '' : name,
      description: slot.description,
    }
  })
}

function getAttributeName(
  propName: string,
  prop: ComponentProp,
): string | false {
  if (prop.attr === false) return false
  if (typeof prop.attr === 'string') return prop.attr

  return propName.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function formatPropType(prop: ComponentProp): string {
  if (prop.values?.length) {
    return prop.values.map(value => JSON.stringify(value)).join(' | ')
  }

  switch (prop.type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'unknown[]'
    case 'object':
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

function formatDetailType(detail: Record<string, string>): string {
  const fields = Object.entries(detail)
    .map(([name, type]) => `${name}: ${type}`)
    .join('; ')

  return `{ ${fields} }`
}

function normalizeModulePath(value: string): string {
  return value.replace(/\\/g, '/')
}
```

---

# 15. 生成基础 WC d.ts

Phase 5 会做完整类型体系，但 Phase 4 可以先生成原生 Web Component 的基础类型，方便用户直接用：

```ts id="bjx99e"
document.querySelector('z-button')?.variant
```

## `generateDts.ts`

```ts id="hbsfki"
// addons/output-wc/src/generateDts.ts

import type {
  ComponentManifest,
  ComponentProp,
  ComponentRecord,
} from '@zeus-js/component-analyzer'

export function generateWCDts(manifest: ComponentManifest): string {
  const lines: string[] = []

  lines.push('/* eslint-disable */')
  lines.push('// Generated by @zeus-js/output-wc.')
  lines.push('')

  for (const component of manifest.components) {
    lines.push(generateElementInterface(component))
    lines.push('')
  }

  lines.push('declare global {')
  lines.push('  interface HTMLElementTagNameMap {')

  for (const component of manifest.components) {
    lines.push(`    ${JSON.stringify(component.tag)}: ${component.name}Element`)
  }

  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('export {}')
  lines.push('')

  return lines.join('\n')
}

export function generateWCJsxDts(manifest: ComponentManifest): string {
  const lines: string[] = []

  lines.push('/* eslint-disable */')
  lines.push('// Generated by @zeus-js/output-wc.')
  lines.push('')

  lines.push('declare global {')
  lines.push('  namespace JSX {')
  lines.push('    interface IntrinsicElements {')

  for (const component of manifest.components) {
    lines.push(
      `      ${JSON.stringify(component.tag)}: ${generateJsxPropsType(component)}`,
    )
  }

  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('export {}')
  lines.push('')

  return lines.join('\n')
}

function generateElementInterface(component: ComponentRecord): string {
  const lines: string[] = []

  lines.push(`export interface ${component.name}Element extends HTMLElement {`)

  for (const [name, prop] of Object.entries(component.props)) {
    lines.push(`  ${name}${prop.required ? '' : '?'}: ${formatPropType(prop)}`)
  }

  lines.push('}')

  return lines.join('\n')
}

function generateJsxPropsType(component: ComponentRecord): string {
  const fields: string[] = []

  for (const [name, prop] of Object.entries(component.props)) {
    fields.push(`${name}${prop.required ? '' : '?'}: ${formatPropType(prop)}`)
  }

  fields.push('children?: unknown')
  fields.push('class?: string')
  fields.push('className?: string')
  fields.push('style?: string | Record<string, string | number>')

  return `{ ${fields.join('; ')} }`
}

function formatPropType(prop: ComponentProp): string {
  if (prop.values?.length) {
    return prop.values.map(value => JSON.stringify(value)).join(' | ')
  }

  switch (prop.type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'unknown[]'
    case 'object':
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}
```

> 注意：这里的 JSX 类型只是基础版。React/Vue 的精确事件类型、slot 类型、wrapper props 类型留到 Phase 5/6。

---

# 16. output-wc 主实现

## `index.ts`

```ts id="vtfiko"
// addons/output-wc/src/index.ts

import path from 'node:path'

import { generateCustomElementsJson } from './generateCustomElementsJson'
import { generateWCDts, generateWCJsxDts } from './generateDts'
import { generateWCEntry } from './generateEntry'
import {
  generateWCIndex,
  getVirtualComponentId,
  getVirtualIndexId,
} from './generateIndex'
import { generateZeusComponentsManifest } from './generateManifest'
import { getComponentFileName } from './naming'

import type { ComponentRecord } from '@zeus-js/component-analyzer'
import type {
  ZeusOutputPlugin,
  ZeusVirtualModule,
  ZeusOutputFile,
} from '@zeus-js/bundler-plugin'
import type { OutputWCOptions } from './types'

export type { OutputWCOptions } from './types'

export default function wc(options: OutputWCOptions = {}): ZeusOutputPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-wc',

    buildStart(ctx) {
      checkFileNameCollisions(ctx.manifest.components, normalized, {
        warn: ctx.warn,
      })
    },

    virtualModules(ctx): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        const fileName = path.posix.join(
          normalized.outDir,
          getComponentFileName(component.tag, normalized),
        )

        modules.push({
          id: getVirtualComponentId(component),
          fileName,
          code: generateWCEntry({
            root: ctx.root,
            component,
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: getVirtualIndexId(),
          fileName: path.posix.join(normalized.outDir, 'index.js'),
          code: generateWCIndex({
            components: ctx.manifest.components,
          }),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (normalized.manifestFile) {
        files.push({
          type: 'asset',
          fileName: normalized.manifestFile,
          source: generateZeusComponentsManifest(ctx.manifest),
        })
      }

      if (normalized.customElementsFile) {
        files.push({
          type: 'asset',
          fileName: normalized.customElementsFile,
          source: generateCustomElementsJson({
            manifest: ctx.manifest,
            getModulePath: component =>
              path.posix.join(
                normalized.outDir,
                getComponentFileName(component.tag, normalized),
              ),
          }),
        })
      }

      if (normalized.dts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'index.d.ts'),
          source: generateWCDts(ctx.manifest),
        })
      }

      if (normalized.jsxDts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'jsx.d.ts'),
          source: generateWCJsxDts(ctx.manifest),
        })
      }

      return files
    },
  }
}

function normalizeOptions(options: OutputWCOptions): Required<OutputWCOptions> {
  return {
    outDir: options.outDir ?? 'dist/wc',
    manifestFile: options.manifestFile ?? 'dist/zeus.components.json',
    customElementsFile:
      options.customElementsFile ?? 'dist/custom-elements.json',
    dts: options.dts ?? true,
    jsxDts: options.jsxDts ?? true,
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName ?? defaultFileName,
    index: options.index ?? true,
    warnOnFileNameCollision: options.warnOnFileNameCollision ?? true,
  }
}

function defaultFileName(tag: string): string {
  return tag
}

function checkFileNameCollisions(
  components: ComponentRecord[],
  options: Required<OutputWCOptions>,
  reporter: {
    warn: (message: string) => void
  },
): void {
  if (!options.warnOnFileNameCollision) return

  const map = new Map<string, ComponentRecord[]>()

  for (const component of components) {
    const fileName = getComponentFileName(component.tag, options)
    const list = map.get(fileName) ?? []

    list.push(component)
    map.set(fileName, list)
  }

  for (const [fileName, list] of map) {
    if (list.length <= 1) continue

    reporter.warn(
      `[zeus-output-wc] Multiple components map to "${fileName}": ${list
        .map(item => item.tag)
        .join(', ')}`,
    )
  }
}
```

> 注意：上面 `normalizeOptions` 里 `fileName` 给了默认函数，所以 `stripPrefix` 不会生效。更严谨的写法是：如果用户没传 `fileName`，才走 `stripPrefix`。下面给修正版。

### 修正版 `normalizeOptions`

```ts id="9myvpq"
type NormalizedOutputWCOptions = Omit<Required<OutputWCOptions>, 'fileName'> & {
  fileName?: (tag: string) => string
}

function normalizeOptions(options: OutputWCOptions): NormalizedOutputWCOptions {
  return {
    outDir: options.outDir ?? 'dist/wc',
    manifestFile: options.manifestFile ?? 'dist/zeus.components.json',
    customElementsFile:
      options.customElementsFile ?? 'dist/custom-elements.json',
    dts: options.dts ?? true,
    jsxDts: options.jsxDts ?? true,
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    index: options.index ?? true,
    warnOnFileNameCollision: options.warnOnFileNameCollision ?? true,
  }
}
```

然后把 `Required<OutputWCOptions>` 替换成 `NormalizedOutputWCOptions`。

---

# 17. 用户组件库 package exports 建议

如果用户后续做 `@zeus-ui/headless`，package.json 应该这样：

```json id="jlsgiq"
{
  "name": "@zeus-ui/headless",
  "version": "0.0.1",
  "type": "module",
  "sideEffects": ["dist/wc/*.js", "dist/wc/**/*.js", "**/*.css"],
  "exports": {
    "./wc": {
      "types": "./dist/wc/index.d.ts",
      "import": "./dist/wc/index.js"
    },
    "./wc/jsx": {
      "types": "./dist/wc/jsx.d.ts"
    },
    "./wc/*": {
      "types": "./dist/wc/index.d.ts",
      "import": "./dist/wc/*.js"
    },
    "./custom-elements.json": {
      "default": "./dist/custom-elements.json"
    },
    "./zeus.components.json": {
      "default": "./dist/zeus.components.json"
    }
  },
  "dependencies": {
    "@zeus-js/zeus": "^0.0.2"
  }
}
```

这里有个细节：Node exports 的 `./wc/* -> ./dist/wc/*.js` 对不同包管理器和 bundler 一般可用，但类型如果要每个组件独立 d.ts，Phase 5 可以生成：

```txt id="y1o79e"
dist/wc/z-button.d.ts
dist/wc/z-card.d.ts
```

Phase 4 先用 `dist/wc/index.d.ts` 兜底。

---

# 18. 测试设计

## 18.1 `generateCustomElementsJson.spec.ts`

```ts id="svjzsd"
// addons/output-wc/__tests__/generateCustomElementsJson.spec.ts

import { describe, expect, it } from 'vitest'
import { generateCustomElementsJson } from '../src/generateCustomElementsJson'

describe('generateCustomElementsJson', () => {
  it('generates custom-elements.json', () => {
    const source = generateCustomElementsJson({
      manifest: {
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/button.tsx',
            description: 'Button primitive',
            props: {
              variant: {
                type: 'string',
                values: ['default', 'outline'],
                default: 'default',
                reflect: true,
                description: 'Button variant.',
              },
              disabled: {
                type: 'boolean',
                default: false,
                reflect: true,
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
                description: 'Button content.',
              },
            },
            hostAttributes: ['data-state'],
            cssParts: ['root'],
            cssVars: ['--z-button-bg'],
          },
        ],
      },
      getModulePath: () => 'dist/wc/z-button.js',
    })

    expect(JSON.parse(source)).toMatchObject({
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'dist/wc/z-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'ZButtonElement',
              tagName: 'z-button',
              customElement: true,
              description: 'Button primitive',
              attributes: [
                {
                  name: 'variant',
                  type: {
                    text: '"default" | "outline"',
                  },
                  default: '"default"',
                },
                {
                  name: 'disabled',
                  type: {
                    text: 'boolean',
                  },
                  default: 'false',
                },
              ],
              events: [
                {
                  name: 'press',
                  type: {
                    text: 'CustomEvent<{ nativeEvent: MouseEvent }>',
                  },
                },
              ],
              slots: [
                {
                  name: '',
                  description: 'Button content.',
                },
              ],
              cssParts: [
                {
                  name: 'root',
                },
              ],
              cssProperties: [
                {
                  name: '--z-button-bg',
                },
              ],
            },
          ],
        },
      ],
    })
  })
})
```

---

## 18.2 `generateDts.spec.ts`

```ts id="yoerf9"
// addons/output-wc/__tests__/generateDts.spec.ts

import { describe, expect, it } from 'vitest'
import { generateWCDts, generateWCJsxDts } from '../src/generateDts'

describe('generateDts', () => {
  it('generates HTMLElementTagNameMap declarations', () => {
    const code = generateWCDts({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          props: {
            variant: {
              type: 'string',
              values: ['default', 'outline'],
            },
            disabled: {
              type: 'boolean',
            },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        },
      ],
    })

    expect(code).toContain(
      'export interface ZButtonElement extends HTMLElement',
    )
    expect(code).toContain('variant?: "default" | "outline"')
    expect(code).toContain('disabled?: boolean')
    expect(code).toContain('"z-button": ZButtonElement')
  })

  it('generates JSX intrinsic declarations', () => {
    const code = generateWCJsxDts({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          props: {
            variant: {
              type: 'string',
              values: ['default', 'outline'],
            },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        },
      ],
    })

    expect(code).toContain('namespace JSX')
    expect(code).toContain('"z-button"')
    expect(code).toContain('variant?: "default" | "outline"')
  })
})
```

---

## 18.3 output-wc 集成测试

```ts id="p67mx6"
// addons/output-wc/__tests__/outputWc.spec.ts

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import zeus from '@zeus-js/bundler-plugin'
import wc from '../src'

describe('output-wc', () => {
  it('emits wc entries and manifests', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-output-wc-'))

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/index.ts'),
      `
        export {}
      `,
    )

    await fs.writeFile(
      path.join(root, 'src/components/button.tsx'),
      `
        import { defineElement, Slot } from '@zeus-js/zeus'

        export interface ButtonProps {
          variant?: 'default' | 'outline'
        }

        export const ZButton = defineElement<ButtonProps>(
          'z-button',
          {
            props: {
              variant: {
                type: String,
                default: 'default',
                reflect: true,
              },
            },
          },
          () => <button><Slot /></button>,
        )
      `,
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      plugins: [
        zeus({
          root,
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
          ],
        }),
      ],
      onwarn() {},
    })

    const result = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    const files = result.output.map(item => item.fileName).sort()

    expect(files).toContain('wc/z-button.js')
    expect(files).toContain('wc/index.js')
    expect(files).toContain('wc/index.d.ts')
    expect(files).toContain('wc/jsx.d.ts')
    expect(files).toContain('zeus.components.json')
    expect(files).toContain('custom-elements.json')

    const manifestAsset = result.output.find(
      item => item.type === 'asset' && item.fileName === 'zeus.components.json',
    )

    expect(manifestAsset).toBeTruthy()

    const manifest = JSON.parse(String((manifestAsset as any).source))

    expect(manifest.components[0]).toMatchObject({
      tag: 'z-button',
      name: 'ZButton',
      props: {
        variant: {
          type: 'string',
          values: ['default', 'outline'],
          default: 'default',
          reflect: true,
        },
      },
    })
  })

  it('supports stripPrefix', async () => {
    const plugin = wc({
      stripPrefix: 'z-',
    })

    expect(plugin.name).toBe('zeus-output-wc')
  })
})
```

---

# 19. examples 接入

在 `examples/web-component/vite.config.ts` 里可以改成：

```ts id="g2a426"
// examples/web-component/vite.config.ts

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
          outDir: 'dist/wc',
          manifestFile: 'dist/zeus.components.json',
          customElementsFile: 'dist/custom-elements.json',
          dts: true,
        }),
      ],
    }),
  ],
})
```

不过 Vite 的 `outDir` 默认也是 `dist`，这里如果插件 fileName 写 `dist/wc`，最终可能得到：

```txt id="qeu8q7"
dist/dist/wc
```

所以在 Vite/Rollup output bundle 里，`fileName` 是相对于最终 output dir 的。示例里应该写：

```ts id="bdf6ty"
wc({
  outDir: 'wc',
  manifestFile: 'zeus.components.json',
  customElementsFile: 'custom-elements.json',
})
```

最终产物：

```txt id="n98k98"
examples/web-component/dist/
  wc/
    z-button.js
    index.js
  zeus.components.json
  custom-elements.json
```

---

# 20. 文档草案

新增：

```txt id="yflwbx"
docs/internal/design/component-compiler-host-phase4.md
```

内容：

````md id="m4y2y9"
# Component Compiler Host Phase 4

## Goal

Implement `@zeus-js/output-wc`, the first official output plugin for Zeus Component Compiler Host.

## Responsibilities

- Generate per-component Web Component entries
- Generate `wc/index.js`
- Generate Zeus ComponentManifest JSON
- Generate `custom-elements.json`
- Generate basic native Web Component d.ts

## Non-goals

- No React wrapper
- No Vue wrapper
- No shadcn-like registry
- No full cross-framework dts

## Entry generation

The component source owns registration:

```tsx
export const ZButton = defineElement('z-button', options, setup)
```
````

`output-wc` only generates:

```ts
import { ZButton } from '/absolute/path/src/button.tsx'

export { ZButton }
```

Importing this module triggers `defineElement()` and registers the custom element.

## sideEffects

Generated Web Component entries are side-effect modules.

Component library packages should configure:

```json
{
  "sideEffects": ["dist/wc/*.js", "dist/wc/**/*.js", "**/*.css"]
}
```

## Output

```txt
dist/
  wc/
    z-button.js
    index.js
    index.d.ts
    jsx.d.ts
  zeus.components.json
  custom-elements.json
```

````id="mt9rpf"

---

# 21. 验收标准

```txt id="ezvcz1"
[ ] 新增 addons/output-wc
[ ] wc() 实现 ZeusOutputPlugin
[ ] 每个 ComponentRecord 生成独立 virtual entry
[ ] 生成 wc/index.js
[ ] 生成 zeus.components.json
[ ] 生成 custom-elements.json
[ ] 生成 wc/index.d.ts
[ ] 生成 wc/jsx.d.ts
[ ] 支持 stripPrefix / fileName
[ ] 支持 fileName collision warning
[ ] 单测覆盖 generator
[ ] Rollup 集成测试通过
[ ] examples/web-component 可使用 output-wc
[ ] pnpm build
[ ] pnpm build-dts
[ ] pnpm check
[ ] pnpm test-unit
````

---

# 22. 推荐提交顺序

```bash id="syokkl"
# 1. 包骨架和类型
git add addons/output-wc/package.json addons/output-wc/src/types.ts
git commit -m "feat(output-wc): add package and options"

# 2. entry/index 生成
git add addons/output-wc/src/naming.ts addons/output-wc/src/imports.ts addons/output-wc/src/generateEntry.ts addons/output-wc/src/generateIndex.ts
git commit -m "feat(output-wc): generate web component entries"

# 3. manifest/custom-elements
git add addons/output-wc/src/generateManifest.ts addons/output-wc/src/generateCustomElementsJson.ts
git commit -m "feat(output-wc): emit component manifests"

# 4. wc dts
git add addons/output-wc/src/generateDts.ts
git commit -m "feat(output-wc): emit native web component dts"

# 5. 插件主实现
git add addons/output-wc/src/index.ts
git commit -m "feat(output-wc): implement output plugin"

# 6. 测试
git add addons/output-wc/__tests__
git commit -m "test(output-wc): cover wc output generation"

# 7. 示例和文档
git add examples/web-component docs/internal/design/component-compiler-host-phase4.md
git commit -m "docs: add output-wc phase4 design"
```

---

# 23. Phase 4 完成后的使用效果

组件源码：

```tsx id="wk8u7p"
export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
    },
  },
  () => {
    return (
      <button>
        <Slot />
      </button>
    )
  },
)
```

构建配置：

```ts id="dv9o3d"
import zeus from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'

export default {
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [wc()],
    }),
  ],
}
```

输出：

```txt id="6g2nyu"
dist/wc/z-button.js
dist/wc/index.js
dist/wc/index.d.ts
dist/wc/jsx.d.ts
dist/zeus.components.json
dist/custom-elements.json
```

用户使用：

```ts id="q4uyzy"
import '@zeus-ui/headless/wc/z-button'
```

```html id="wmcuz0"
<z-button variant="default">Button</z-button>
```

这就完成了 Zeus 跨框架组件编译链路的第一种输出形态：

```txt id="hw10ip"
defineElement 源码
  ↓
component-analyzer
  ↓
ComponentManifest
  ↓
bundler-plugin outputs
  ↓
output-wc
  ↓
可分发 Web Component 产物
```

下一阶段 Phase 5 就可以在这个基础上把 d.ts 体系做完整，包括：

```txt id="x9tf26"
每组件独立 d.ts
event detail 类型
JSX IntrinsicElements 完整化
Vue GlobalComponents
React wrapper props 类型准备
```
