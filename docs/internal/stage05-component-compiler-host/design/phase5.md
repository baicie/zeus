Phase 5：DTS 输出体系详细设计与代码草案

Phase 5 的目标是把类型生成体系正式化。

Phase 4 里 output-wc 已经会生成基础版：

dist/wc/index.d.ts
dist/wc/jsx.d.ts

但那只是临时能力。Phase 5 要做的是：把 d.ts 生成抽成共享能力，让 output-wc / output-react-wrapper / output-vue-wrapper / docs / registry 都能基于同一份 ComponentManifest 生成类型。

当前项目结构适合这么拆：核心工具包放 packages/_，构建生态输出插件放 addons/_，因为 workspace 和构建脚本已经覆盖这两个目录。 ￼ ￼

⸻

1. Phase 5 目标

做什么

1. 新增 packages/component-dts
2. 从 ComponentManifest 生成原生 Web Component 类型
3. 生成 HTMLElementTagNameMap
4. 生成 JSX IntrinsicElements
5. 生成 Typed CustomEvent / EventMap
6. 生成 per-component d.ts
7. 生成 wc/index.d.ts
8. 生成 wc/jsx.d.ts
9. 为 React/Vue wrapper 类型生成预留 generator
10. 改造 output-wc，复用 component-dts
11. 补 dts snapshot 测试
12. 补 examples 类型验证

不做什么

1. 不生成 React wrapper JS
2. 不生成 Vue wrapper JS
3. 不正式输出 React/Vue wrapper 包
4. 不做完整 TS checker
5. 不做 shadcn-like registry

Phase 5 只做类型生成体系。React/Vue 的 JS wrapper 到 Phase 6。

⸻

2. 总体架构

defineElement source
↓
component-analyzer
↓
ComponentManifest
↓
component-dts
↓
wc/\*.d.ts
wc/jsx.d.ts
react dts generator
vue dts generator

最终包之间关系：

@zeus-js/component-analyzer
负责生成 ComponentManifest
@zeus-js/component-dts
负责从 ComponentManifest 生成 d.ts 字符串/文件描述
@zeus-js/output-wc
负责把 component-dts 生成的 d.ts emit 到 bundle
@zeus-js/output-react-wrapper
后续复用 component-dts 生成 React wrapper d.ts
@zeus-js/output-vue-wrapper
后续复用 component-dts 生成 Vue wrapper d.ts

⸻

3. 新增包位置

packages/component-dts

原因：它是纯 generator，不绑定 Rollup/Vite/Rolldown，不应该放在 addons。addons 更适合放输出插件，例如 output-wc、output-react-wrapper。

⸻

4. 包结构

packages/component-dts/
package.json
src/
index.ts
types.ts
naming.ts
formatType.ts
generateWcDts.ts
generateJsxDts.ts
generateReactDts.ts
generateVueDts.ts
generateFiles.ts
**tests**/
generateWcDts.spec.ts
generateJsxDts.spec.ts
generateReactDts.spec.ts
generateVueDts.spec.ts

⸻

5. package.json 草案

{
"name": "@zeus-js/component-dts",
"version": "0.0.2",
"description": "DTS generators for Zeus component manifest",
"type": "module",
"main": "index.js",
"module": "dist/component-dts.esm-bundler.js",
"types": "dist/component-dts.d.ts",
"files": [
"index.js",
"dist"
],
"exports": {
".": {
"types": "./dist/component-dts.d.ts",
"node": {
"production": "./dist/component-dts.cjs.prod.js",
"development": "./dist/component-dts.cjs.js",
"default": "./index.js"
},
"module": "./dist/component-dts.esm-bundler.js",
"import": "./dist/component-dts.esm-bundler.js",
"require": "./index.js"
},
"./_": "./_"
},
"sideEffects": false,
"buildOptions": {
"name": "ZeusComponentDts",
"formats": [
"esm-bundler",
"cjs"
]
},
"dependencies": {
"@zeus-js/component-analyzer": "workspace:\*"
},
"keywords": [
"zeus",
"web-components",
"dts",
"types"
],
"author": "Baicie",
"license": "MIT"
}

⸻

6. 类型设计

types.ts

// packages/component-dts/src/types.ts
import type {
ComponentManifest,
ComponentRecord,
} from '@zeus-js/component-analyzer'
export interface DtsOutputFile {
fileName: string
source: string
}
export interface ComponentDtsOptions {
/\*\*

- Output directory for wc dts files.
-
- @default 'wc'
  \*/
  outDir?: string
  /\*\*
- Strip tag prefix when generating file names.
-
- Example:
- z-button -> button.d.ts
  \*/
  stripPrefix?: string | false
  /\*\*
- Custom component file name.
  \*/
  fileName?: (tag: string) => string
  /\*\*
- Whether to generate per-component d.ts.
-
- @default true
  \*/
  perComponent?: boolean
  /\*\*
- Whether to generate wc/index.d.ts.
-
- @default true
  \*/
  index?: boolean
  /\*\*
- Whether to generate wc/jsx.d.ts.
-
- @default true
  \*/
  jsx?: boolean
  }
export interface NormalizedComponentDtsOptions {
  outDir: string
  stripPrefix: string | false
  fileName?: (tag: string) => string
  perComponent: boolean
  index: boolean
  jsx: boolean
  }

⸻

7. 命名规则

目标

z-button -> ZButtonElement
z-dialog-title -> ZDialogTitleElement
z-button events -> ZButtonEventMap

需要注意：

1. tag 里有 -，要转 PascalCase
2. 组件名可能和 Element 后缀重复
3. 不同 tag 可能生成相同类型名，需要兜底
4. 文件名要和 output-wc 规则保持一致

naming.ts

// packages/component-dts/src/naming.ts
import type { ComponentRecord } from '@zeus-js/component-analyzer'
import type { NormalizedComponentDtsOptions } from './types'
export function toPascalCase(value: string): string {
const result = value
.split(/[-_\s]+/)
.filter(Boolean)
.map(part => part.charAt(0).toUpperCase() + part.slice(1))
.join('')
return result || 'Component'
}
export function getElementTypeName(component: ComponentRecord): string {
if (component.name.endsWith('Element')) {
return component.name
}
return `${component.name}Element`
}
export function getEventMapTypeName(component: ComponentRecord): string {
return `${component.name}EventMap`
}
export function getPropsTypeName(component: ComponentRecord): string {
return `${component.name}Props`
}
export function getComponentFileBaseName(
tag: string,
options: NormalizedComponentDtsOptions,
): string {
if (options.fileName) {
return sanitizeFileName(options.fileName(tag)).replace(/\.d\.ts$/, '')
  }
  let name = tag
  if (
    options.stripPrefix &&
    name.startsWith(options.stripPrefix)
  ) {
    name = name.slice(options.stripPrefix.length)
  }
  return sanitizeFileName(name)
}
export function getComponentDtsFileName(
  tag: string,
  options: NormalizedComponentDtsOptions,
): string {
  return `${getComponentFileBaseName(tag, options)}.d.ts`
}
export function sanitizeFileName(value: string): string {
return value
.trim()
.replace(/[^a-zA-Z0-9._-]/g, '-')
.replace(/-+/g, '-')
.replace(/^-|-$/g, '')
}

⸻

8. 类型格式化

处理规则

string -> string
number -> number
boolean -> boolean
object -> Record<string, unknown>
array -> unknown[]
unknown -> unknown
values -> "a" | "b" | "c"
event detail -> { value: boolean; nativeEvent: MouseEvent }

formatType.ts

// packages/component-dts/src/formatType.ts
import type {
ComponentEvent,
ComponentProp,
} from '@zeus-js/component-analyzer'
export function formatPropType(prop: ComponentProp): string {
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
export function formatEventType(event: ComponentEvent): string {
if (!event.detail) {
return 'CustomEvent<unknown>'
}
return `CustomEvent<${formatDetailType(event.detail)}>`
}
export function formatDetailType(detail: Record<string, string>): string {
const fields = Object.entries(detail)
.map(([name, type]) => `${safePropertyName(name)}: ${normalizeKnownType(type)}`)
.join('; ')
return `{ ${fields} }`
}
export function normalizeKnownType(type: string): string {
switch (type) {
case 'string':
case 'number':
case 'boolean':
case 'unknown':
case 'MouseEvent':
case 'KeyboardEvent':
case 'PointerEvent':
case 'FocusEvent':
case 'InputEvent':
case 'Event':
return type
case 'object':
return 'Record<string, unknown>'
case 'array':
return 'unknown[]'
default:
return type || 'unknown'
}
}
export function safePropertyName(name: string): string {
if (/^[A-Za-z\_$][A-Za-z0-9_$]\*$/.test(name)) {
return name
}
return JSON.stringify(name)
}
export function isRequiredProp(prop: ComponentProp): boolean {
/\*\*

- Runtime default means user does not need to provide it.
  \*/
  if (prop.default !== undefined) return false
  return prop.required === true
  }

⸻

9. 生成单组件 WC d.ts

目标输出

export interface ZButtonEventMap {
press: CustomEvent<{ nativeEvent: MouseEvent }>
}
export interface ZButtonElement extends HTMLElement {
variant?: 'default' | 'outline'
disabled?: boolean
addEventListener<K extends keyof ZButtonEventMap>(
type: K,
listener: (this: ZButtonElement, ev: ZButtonEventMap[K]) => unknown,
options?: boolean | AddEventListenerOptions,
): void
removeEventListener<K extends keyof ZButtonEventMap>(
type: K,
listener: (this: ZButtonElement, ev: ZButtonEventMap[K]) => unknown,
options?: boolean | EventListenerOptions,
): void
}
export declare const ZButton: {
new (): ZButtonElement
}

generateWcDts.ts

// packages/component-dts/src/generateWcDts.ts
import type {
ComponentManifest,
ComponentRecord,
} from '@zeus-js/component-analyzer'
import {
formatEventType,
formatPropType,
isRequiredProp,
safePropertyName,
} from './formatType'
import {
getElementTypeName,
getEventMapTypeName,
} from './naming'
export function generateComponentWCDts(
component: ComponentRecord,
): string {
const elementTypeName = getElementTypeName(component)
const eventMapName = getEventMapTypeName(component)
const lines: string[] = []
lines.push('/_ eslint-disable _/')
lines.push('// Generated by @zeus-js/component-dts.')
lines.push('')
lines.push(generateEventMap(component))
lines.push('')
lines.push(generateElementInterface(component))
lines.push('')
lines.push(`export declare const ${component.exportName}: {`)
lines.push(`  new (): ${elementTypeName}`)
lines.push('}')
lines.push('')
return lines.join('\n')
}
export function generateWCIndexDts(
manifest: ComponentManifest,
options: {
getComponentImportPath: (component: ComponentRecord) => string
},
): string {
const lines: string[] = []
lines.push('/_ eslint-disable _/')
lines.push('// Generated by @zeus-js/component-dts.')
lines.push('')
for (const component of manifest.components) {
lines.push(`export * from ${JSON.stringify(options.getComponentImportPath(component))}`)
}
lines.push('')
lines.push('declare global {')
lines.push(' interface HTMLElementTagNameMap {')
for (const component of manifest.components) {
lines.push(
`    ${JSON.stringify(component.tag)}: ${getElementTypeName(component)}`,
)
}
lines.push(' }')
lines.push('}')
lines.push('')
lines.push('export {}')
lines.push('')
return lines.join('\n')
}
function generateEventMap(component: ComponentRecord): string {
const eventMapName = getEventMapTypeName(component)
const entries = Object.entries(component.events)
const lines: string[] = []
lines.push(`export interface ${eventMapName} {`)
if (!entries.length) {
lines.push(' [key: string]: CustomEvent<unknown>')
} else {
for (const [name, event] of entries) {
lines.push(`  ${safePropertyName(name)}: ${formatEventType(event)}`)
}
}
lines.push('}')
return lines.join('\n')
}
function generateElementInterface(component: ComponentRecord): string {
const elementTypeName = getElementTypeName(component)
const eventMapName = getEventMapTypeName(component)
const lines: string[] = []
lines.push(`export interface ${elementTypeName} extends HTMLElement {`)
for (const [name, prop] of Object.entries(component.props)) {
const optional = isRequiredProp(prop) ? '' : '?'
lines.push(`  ${safePropertyName(name)}${optional}: ${formatPropType(prop)}`)
}
lines.push('')
lines.push(`  addEventListener<K extends keyof ${eventMapName}>(`)
lines.push(' type: K,')
lines.push(`    listener: (this: ${elementTypeName}, ev: ${eventMapName}[K]) => unknown,`)
lines.push(' options?: boolean | AddEventListenerOptions,')
lines.push(' ): void')
lines.push('')
lines.push(`  removeEventListener<K extends keyof ${eventMapName}>(`)
lines.push(' type: K,')
lines.push(`    listener: (this: ${elementTypeName}, ev: ${eventMapName}[K]) => unknown,`)
lines.push(' options?: boolean | EventListenerOptions,')
lines.push(' ): void')
lines.push('}')
return lines.join('\n')
}

⸻

10. 生成 JSX IntrinsicElements

目标输出

declare global {
namespace JSX {
interface IntrinsicElements {
'z-button': ZButtonJSXProps
}
}
}
export interface ZButtonJSXProps {
variant?: 'default' | 'outline'
disabled?: boolean
children?: unknown
class?: string
className?: string
style?: string | Record<string, string | number | null | undefined>
part?: string
role?: string
id?: string
}

注意

这个 JSX 类型不是 React wrapper 类型。它只是让用户在 Zeus/TSX 或直接 JSX 环境里写：

<z-button variant="outline" />

有基本提示。

generateJsxDts.ts

// packages/component-dts/src/generateJsxDts.ts
import type {
ComponentManifest,
ComponentRecord,
} from '@zeus-js/component-analyzer'
import {
formatPropType,
isRequiredProp,
safePropertyName,
} from './formatType'
import { getPropsTypeName } from './naming'
export function generateWCJsxDts(manifest: ComponentManifest): string {
const lines: string[] = []
lines.push('/_ eslint-disable _/')
lines.push('// Generated by @zeus-js/component-dts.')
lines.push('')
for (const component of manifest.components) {
lines.push(generateComponentJsxProps(component))
lines.push('')
}
lines.push('declare global {')
lines.push(' namespace JSX {')
lines.push(' interface IntrinsicElements {')
for (const component of manifest.components) {
lines.push(
`      ${JSON.stringify(component.tag)}: ${getPropsTypeName(component)}`,
)
}
lines.push(' }')
lines.push(' }')
lines.push('}')
lines.push('')
lines.push('export {}')
lines.push('')
return lines.join('\n')
}
function generateComponentJsxProps(component: ComponentRecord): string {
const propsTypeName = getPropsTypeName(component)
const lines: string[] = []
lines.push(`export interface ${propsTypeName} {`)
for (const [name, prop] of Object.entries(component.props)) {
const optional = isRequiredProp(prop) ? '' : '?'
lines.push(`  ${safePropertyName(name)}${optional}: ${formatPropType(prop)}`)
}
lines.push('')
lines.push(' children?: unknown')
lines.push(' class?: string')
lines.push(' className?: string')
lines.push(' style?: string | Record<string, string | number | null | undefined>')
lines.push(' id?: string')
lines.push(' role?: string')
lines.push(' part?: string')
lines.push(' slot?: string')
lines.push('')
lines.push(' [key: `data-${string}`]: unknown')
lines.push(' [key: `aria-${string}`]: unknown')
lines.push('}')
return lines.join('\n')
}

⸻

11. React d.ts 生成器预留

Phase 5 不输出 React wrapper JS，但可以先把 d.ts generator 做好，Phase 6 直接复用。

目标输出

import type \* as React from 'react'
export interface ZButtonProps {
variant?: 'default' | 'outline'
disabled?: boolean
children?: React.ReactNode
className?: string
style?: React.CSSProperties
onPress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void
}
export interface ZButtonElement extends HTMLElement {
variant?: 'default' | 'outline'
disabled?: boolean
}
export declare const ZButton: React.ForwardRefExoticComponent<
ZButtonProps & React.RefAttributes<ZButtonElement>

>

generateReactDts.ts

// packages/component-dts/src/generateReactDts.ts
import type {
ComponentManifest,
ComponentRecord,
} from '@zeus-js/component-analyzer'
import {
formatDetailType,
formatPropType,
isRequiredProp,
safePropertyName,
} from './formatType'
import {
getElementTypeName,
getPropsTypeName,
} from './naming'
export function generateReactDts(manifest: ComponentManifest): string {
const lines: string[] = []
lines.push('/_ eslint-disable _/')
lines.push('// Generated by @zeus-js/component-dts.')
lines.push('')
lines.push(`import type * as React from 'react'`)
lines.push('')
for (const component of manifest.components) {
lines.push(generateReactComponentDts(component))
lines.push('')
}
return lines.join('\n')
}
function generateReactComponentDts(component: ComponentRecord): string {
const propsTypeName = getPropsTypeName(component)
const elementTypeName = getElementTypeName(component)
const lines: string[] = []
lines.push(`export interface ${propsTypeName} {`)
for (const [name, prop] of Object.entries(component.props)) {
const optional = isRequiredProp(prop) ? '' : '?'
lines.push(`  ${safePropertyName(name)}${optional}: ${formatPropType(prop)}`)
}
lines.push('')
lines.push(' children?: React.ReactNode')
lines.push(' className?: string')
lines.push(' style?: React.CSSProperties')
for (const [name, event] of Object.entries(component.events)) {
const propName = toReactEventProp(name)
const detailType = event.detail
? formatDetailType(event.detail)
: 'unknown'
lines.push(
`  ${propName}?: (event: CustomEvent<${detailType}>) => void`,
)
}
lines.push('}')
lines.push('')
lines.push(`export interface ${elementTypeName} extends HTMLElement {`)
for (const [name, prop] of Object.entries(component.props)) {
const optional = isRequiredProp(prop) ? '' : '?'
lines.push(`  ${safePropertyName(name)}${optional}: ${formatPropType(prop)}`)
}
lines.push('}')
lines.push('')
lines.push(`export declare const ${component.name}: React.ForwardRefExoticComponent<`)
lines.push(`  ${propsTypeName} & React.RefAttributes<${elementTypeName}>`)
lines.push('>')
return lines.join('\n')
}
function toReactEventProp(eventName: string): string {
return (
'on' +
eventName
.split('-')
.filter(Boolean)
.map(part => part.charAt(0).toUpperCase() + part.slice(1))
.join('')
)
}

⸻

12. Vue d.ts 生成器预留

Phase 5 也可以先生成 Vue d.ts 字符串，Phase 6 生成 wrapper 时复用。

generateVueDts.ts

// packages/component-dts/src/generateVueDts.ts
import type {
ComponentManifest,
ComponentRecord,
} from '@zeus-js/component-analyzer'
import {
formatDetailType,
formatPropType,
isRequiredProp,
safePropertyName,
} from './formatType'
import { getPropsTypeName } from './naming'
export function generateVueDts(manifest: ComponentManifest): string {
const lines: string[] = []
lines.push('/_ eslint-disable _/')
lines.push('// Generated by @zeus-js/component-dts.')
lines.push('')
lines.push(`import type { DefineComponent } from 'vue'`)
lines.push('')
for (const component of manifest.components) {
lines.push(generateVueComponentDts(component))
lines.push('')
}
return lines.join('\n')
}
export function generateVueGlobalDts(manifest: ComponentManifest): string {
const lines: string[] = []
lines.push('/_ eslint-disable _/')
lines.push('// Generated by @zeus-js/component-dts.')
lines.push('')
lines.push(`import type {`)
for (const component of manifest.components) {
lines.push(`  ${component.name},`)
}
lines.push(`} from './index'`)
lines.push('')
lines.push(`declare module 'vue' {`)
lines.push(' export interface GlobalComponents {')
for (const component of manifest.components) {
lines.push(`    ${component.name}: typeof ${component.name}`)
}
lines.push(' }')
lines.push('}')
lines.push('')
lines.push('export {}')
lines.push('')
return lines.join('\n')
}
function generateVueComponentDts(component: ComponentRecord): string {
const propsTypeName = getPropsTypeName(component)
const lines: string[] = []
lines.push(`export interface ${propsTypeName} {`)
for (const [name, prop] of Object.entries(component.props)) {
const optional = isRequiredProp(prop) ? '' : '?'
lines.push(`  ${safePropertyName(name)}${optional}: ${formatPropType(prop)}`)
}
lines.push('}')
lines.push('')
lines.push(`export declare const ${component.name}: DefineComponent<`)
lines.push(`  ${propsTypeName},`)
lines.push(' {},')
lines.push(' {},')
lines.push(' {},')
lines.push(' {},')
lines.push(' {},')
lines.push(' {},')
lines.push(`  ${generateVueEmitsType(component)}`)
lines.push('>')
return lines.join('\n')
}
function generateVueEmitsType(component: ComponentRecord): string {
const entries = Object.entries(component.events)
if (!entries.length) {
return '{}'
}
const fields = entries.map(([name, event]) => {
const detailType = event.detail
? formatDetailType(event.detail)
: 'unknown'
return `${JSON.stringify(name)}: (event: CustomEvent<${detailType}>) => void`
})
return `{ ${fields.join('; ')} }`
}

⸻

13. 生成文件描述

这个函数是给 output-wc 直接用的。

generateFiles.ts

// packages/component-dts/src/generateFiles.ts
import path from 'node:path'
import type {
ComponentManifest,
ComponentRecord,
} from '@zeus-js/component-analyzer'
import {
getComponentDtsFileName,
getComponentFileBaseName,
} from './naming'
import {
generateComponentWCDts,
generateWCIndexDts,
} from './generateWcDts'
import { generateWCJsxDts } from './generateJsxDts'
import type {
ComponentDtsOptions,
DtsOutputFile,
NormalizedComponentDtsOptions,
} from './types'
export function generateWCDtsFiles(
manifest: ComponentManifest,
options: ComponentDtsOptions = {},
): DtsOutputFile[] {
const normalized = normalizeOptions(options)
const files: DtsOutputFile[] = []
if (normalized.perComponent) {
for (const component of manifest.components) {
files.push({
fileName: path.posix.join(
normalized.outDir,
getComponentDtsFileName(component.tag, normalized),
),
source: generateComponentWCDts(component),
})
}
}
if (normalized.index) {
files.push({
fileName: path.posix.join(normalized.outDir, 'index.d.ts'),
source: generateWCIndexDts(manifest, {
getComponentImportPath: component =>
`./${getComponentFileBaseName(component.tag, normalized)}`,
}),
})
}
if (normalized.jsx) {
files.push({
fileName: path.posix.join(normalized.outDir, 'jsx.d.ts'),
source: generateWCJsxDts(manifest),
})
}
return files
}
export function normalizeOptions(
options: ComponentDtsOptions,
): NormalizedComponentDtsOptions {
return {
outDir: options.outDir ?? 'wc',
stripPrefix: options.stripPrefix ?? false,
fileName: options.fileName,
perComponent: options.perComponent ?? true,
index: options.index ?? true,
jsx: options.jsx ?? true,
}
}

⸻

14. 入口导出

index.ts

// packages/component-dts/src/index.ts
export {
generateComponentWCDts,
generateWCIndexDts,
} from './generateWcDts'
export {
generateWCJsxDts,
} from './generateJsxDts'
export {
generateReactDts,
} from './generateReactDts'
export {
generateVueDts,
generateVueGlobalDts,
} from './generateVueDts'
export {
generateWCDtsFiles,
} from './generateFiles'
export {
formatPropType,
formatEventType,
formatDetailType,
} from './formatType'
export type {
  ComponentDtsOptions,
  DtsOutputFile,
} from './types'

⸻

15. 改造 @zeus-js/output-wc

Phase 4 的 output-wc 里已有 d.ts 生成逻辑。Phase 5 要把它删掉，改为复用 @zeus-js/component-dts。

修改 addons/output-wc/package.json

{
"dependencies": {
"@zeus-js/bundler-plugin": "workspace:_",
"@zeus-js/component-analyzer": "workspace:_",
"@zeus-js/component-dts": "workspace:\*"
}
}

修改 addons/output-wc/src/index.ts

核心替换：

import { generateWCDtsFiles } from '@zeus-js/component-dts'

在 generateBundle 中：

if (normalized.dts || normalized.jsxDts) {
const dtsFiles = generateWCDtsFiles(ctx.manifest, {
outDir: normalized.outDir,
stripPrefix: normalized.stripPrefix,
fileName: normalized.fileName,
perComponent: true,
index: normalized.dts,
jsx: normalized.jsxDts,
})
for (const file of dtsFiles) {
files.push({
type: 'asset',
fileName: file.fileName,
source: file.source,
})
}
}

注意：outDir 在 output-wc 里是相对于 bundler output dir 的路径，例如：

wc({
outDir: 'wc'
})

最终是：

dist/wc/index.d.ts

⸻

16. 用户组件库 package exports

Phase 5 后，建议 @zeus-ui/headless 这类库支持：

{
"exports": {
"./wc": {
"types": "./dist/wc/index.d.ts",
"import": "./dist/wc/index.js"
},
"./wc/jsx": {
"types": "./dist/wc/jsx.d.ts"
},
"./wc/_": {
"types": "./dist/wc/_.d.ts",
"import": "./dist/wc/_.js"
},
"./custom-elements.json": {
"default": "./dist/custom-elements.json"
},
"./zeus.components.json": {
"default": "./dist/zeus.components.json"
}
},
"sideEffects": [
"dist/wc/_.js",
"dist/wc/**/\*.js",
"**/\*.css"
]
}

这里 sideEffects 很关键，因为 Web Component entry 会导入 defineElement 组件模块，模块执行会触发 customElements.define。当前 defineElement 里确实会执行注册逻辑并做重复注册保护。 ￼

⸻

17. 测试设计

generateWcDts.spec.ts

// packages/component-dts/**tests**/generateWcDts.spec.ts
import { describe, expect, it } from 'vitest'
import {
generateComponentWCDts,
generateWCIndexDts,
} from '../src/generateWcDts'
describe('generateWcDts', () => {
it('generates typed custom element declaration', () => {
const code = generateComponentWCDts({
tag: 'z-button',
name: 'ZButton',
exportName: 'ZButton',
source: 'src/button.tsx',
props: {
variant: {
type: 'string',
values: ['default', 'outline'],
default: 'default',
},
disabled: {
type: 'boolean',
},
},
events: {
press: {
detail: {
nativeEvent: 'MouseEvent',
},
},
},
slots: {},
hostAttributes: [],
cssParts: [],
cssVars: [],
})
expect(code).toContain('export interface ZButtonEventMap')
expect(code).toContain('press: CustomEvent<{ nativeEvent: MouseEvent }>')
expect(code).toContain('export interface ZButtonElement extends HTMLElement')
expect(code).toContain('variant?: "default" | "outline"')
expect(code).toContain('disabled?: boolean')
expect(code).toContain('addEventListener<K extends keyof ZButtonEventMap>')
expect(code).toContain('export declare const ZButton')
})
it('generates HTMLElementTagNameMap declaration', () => {
const code = generateWCIndexDts(
{
version: 1,
components: [
{
tag: 'z-button',
name: 'ZButton',
exportName: 'ZButton',
source: 'src/button.tsx',
props: {},
events: {},
slots: {},
hostAttributes: [],
cssParts: [],
cssVars: [],
},
],
},
{
getComponentImportPath: () => './z-button',
},
)
expect(code).toContain('export \* from "./z-button"')
expect(code).toContain('interface HTMLElementTagNameMap')
expect(code).toContain('"z-button": ZButtonElement')
})
})

⸻

generateJsxDts.spec.ts

// packages/component-dts/**tests**/generateJsxDts.spec.ts
import { describe, expect, it } from 'vitest'
import { generateWCJsxDts } from '../src/generateJsxDts'
describe('generateWCJsxDts', () => {
it('generates JSX intrinsic elements', () => {
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
expect(code).toContain('"z-button": ZButtonProps')
expect(code).toContain('variant?: "default" | "outline"')
expect(code).toContain('[key: `data-${string}`]: unknown')
expect(code).toContain('[key: `aria-${string}`]: unknown')
})
})

⸻

generateReactDts.spec.ts

// packages/component-dts/**tests**/generateReactDts.spec.ts
import { describe, expect, it } from 'vitest'
import { generateReactDts } from '../src/generateReactDts'
describe('generateReactDts', () => {
it('generates React wrapper dts', () => {
const code = generateReactDts({
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
events: {
press: {
detail: {
nativeEvent: 'MouseEvent',
},
},
},
slots: {},
hostAttributes: [],
cssParts: [],
cssVars: [],
},
],
})
expect(code).toContain(`import type * as React from 'react'`)
expect(code).toContain('export interface ZButtonProps')
expect(code).toContain('onPress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void')
expect(code).toContain('React.ForwardRefExoticComponent')
})
})

⸻

generateVueDts.spec.ts

// packages/component-dts/**tests**/generateVueDts.spec.ts
import { describe, expect, it } from 'vitest'
import {
generateVueDts,
generateVueGlobalDts,
} from '../src/generateVueDts'
describe('generateVueDts', () => {
it('generates Vue wrapper dts', () => {
const code = generateVueDts({
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
events: {
press: {
detail: {
nativeEvent: 'MouseEvent',
},
},
},
slots: {},
hostAttributes: [],
cssParts: [],
cssVars: [],
},
],
})
expect(code).toContain(`import type { DefineComponent } from 'vue'`)
expect(code).toContain('export interface ZButtonProps')
expect(code).toContain('"press": (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void')
})
it('generates Vue global component declarations', () => {
const code = generateVueGlobalDts({
version: 1,
components: [
{
tag: 'z-button',
name: 'ZButton',
exportName: 'ZButton',
source: 'src/button.tsx',
props: {},
events: {},
slots: {},
hostAttributes: [],
cssParts: [],
cssVars: [],
},
],
})
expect(code).toContain(`declare module 'vue'`)
expect(code).toContain('ZButton: typeof ZButton')
})
})

⸻

18. TypeScript 类型验证示例

建议新增一个只做类型检查的 example：

examples/type-check/
package.json
tsconfig.json
src/
wc.tsx

examples/type-check/src/wc.tsx

import type { ZButtonElement } from '@zeus-ui/headless/wc/z-button'
const el = document.querySelector('z-button') as ZButtonElement | null
if (el) {
el.variant = 'outline'
el.addEventListener('press', event => {
event.detail.nativeEvent.preventDefault()
})
}
const view = <z-button variant="default" data-state="open" />

Phase 5 不一定要马上落这个 example，因为 @zeus-ui/headless 还没成型；但在 packages/component-dts/**tests** 里至少要有 dts 字符串 snapshot。

⸻

19. 质量门禁

根目录已有这些脚本，可以直接覆盖新增包： ￼

pnpm build
pnpm build-dts
pnpm check
pnpm test-unit
pnpm size

Phase 5 验收时重点跑：

pnpm build component-dts
pnpm build output-wc
pnpm test-unit
pnpm build-dts

⸻

20. 文档草案

新增：

docs/internal/design/component-compiler-host-phase5.md

内容：

# Component Compiler Host Phase 5

## Goal

Introduce `@zeus-js/component-dts` as the shared dts generation layer.

## Responsibilities

- Generate native Web Component declarations
- Generate HTMLElementTagNameMap
- Generate JSX IntrinsicElements
- Generate typed CustomEvent maps
- Prepare React/Vue dts generators for wrapper outputs

## Non-goals

- No React wrapper JS
- No Vue wrapper JS
- No shadcn-like registry

## Data source

All declarations are generated from `ComponentManifest`.

## Generated files

````txt
dist/wc/
  z-button.d.ts
  index.d.ts
  jsx.d.ts

Future

Phase 6 will use:

* generateReactDts
* generateVueDts
* generateVueGlobalDts

---
# 21. 验收清单
```txt
[ ] 新增 packages/component-dts
[ ] 支持 generateComponentWCDts
[ ] 支持 generateWCIndexDts
[ ] 支持 generateWCJsxDts
[ ] 支持 generateReactDts
[ ] 支持 generateVueDts
[ ] 支持 generateVueGlobalDts
[ ] 支持 generateWCDtsFiles
[ ] output-wc 改为复用 component-dts
[ ] 每组件独立 d.ts
[ ] index.d.ts 聚合导出
[ ] HTMLElementTagNameMap 类型正确
[ ] JSX IntrinsicElements 类型正确
[ ] CustomEvent detail 类型正确
[ ] 单测覆盖 wc/jsx/react/vue generator
[ ] pnpm build 通过
[ ] pnpm build-dts 通过
[ ] pnpm check 通过
[ ] pnpm test-unit 通过

⸻

22. 推荐提交顺序

# 1. 新增 component-dts 包骨架
git add packages/component-dts/package.json packages/component-dts/src/types.ts packages/component-dts/src/index.ts
git commit -m "feat(component-dts): add package scaffold"
# 2. 命名和类型格式化
git add packages/component-dts/src/naming.ts packages/component-dts/src/formatType.ts
git commit -m "feat(component-dts): add naming and type formatting helpers"
# 3. WC dts
git add packages/component-dts/src/generateWcDts.ts packages/component-dts/src/generateJsxDts.ts packages/component-dts/src/generateFiles.ts
git commit -m "feat(component-dts): generate web component declarations"
# 4. React/Vue dts generator 预留
git add packages/component-dts/src/generateReactDts.ts packages/component-dts/src/generateVueDts.ts
git commit -m "feat(component-dts): add framework dts generators"
# 5. 改造 output-wc
git add addons/output-wc/package.json addons/output-wc/src/index.ts
git commit -m "refactor(output-wc): use shared component dts generator"
# 6. 测试
git add packages/component-dts/__tests__
git commit -m "test(component-dts): cover dts generation"
# 7. 文档
git add docs/internal/design/component-compiler-host-phase5.md
git commit -m "docs: add component dts phase5 design"

⸻

23. Phase 5 完成后的效果

从 manifest：

{
  "version": 1,
  "components": [
    {
      "tag": "z-button",
      "name": "ZButton",
      "exportName": "ZButton",
      "props": {
        "variant": {
          "type": "string",
          "values": ["default", "outline"]
        }
      },
      "events": {
        "press": {
          "detail": {
            "nativeEvent": "MouseEvent"
          }
        }
      }
    }
  ]
}

自动生成：

dist/wc/
  z-button.d.ts
  index.d.ts
  jsx.d.ts

用户原生使用有类型：

import type { ZButtonElement } from '@zeus-ui/headless/wc/z-button'
const el = document.querySelector('z-button') as ZButtonElement
el.variant = 'outline'
el.addEventListener('press', event => {
  event.detail.nativeEvent.preventDefault()
})

JSX 使用有类型：

<z-button variant="outline" data-state="open" />

后续 Phase 6 可以直接复用：

generateReactDts(manifest)
generateVueDts(manifest)
generateVueGlobalDts(manifest)

生成 React/Vue wrapper 的类型文件。

Phase 5 的本质价值是：把类型生成从各个 output 插件里抽离出来，形成统一的 ComponentManifest -> DTS 输出层。
````
