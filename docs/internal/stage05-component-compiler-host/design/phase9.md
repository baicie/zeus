# Phase 9：Icon No-runtime Output + Runtime Size Optimization 详细设计与代码草案

Phase 9 的核心目标是解决这个问题：

```txt
普通交互组件可以依赖 Zeus runtime。
但 Icon / SVG 这类静态组件，不应该因为一个图标就引入 @zeus-js/signal / runtime-dom / zeus。
```

所以 Phase 9 建议做成：

```txt
Phase 9：Icon no-runtime output + runtime size optimization

1. 新增 @zeus-js/output-icons
2. 支持 SVG -> React static icon
3. 支持 SVG -> Vue static icon
4. 支持 SVG -> Static Web Component
5. 支持 SVG raw asset 输出
6. 接入 Phase 8 benchmark，验证 no-runtime 体积收益
7. 明确 wc/react/vue/headless 的 runtime 输出策略
```

---

# 1. Phase 9 定位

Phase 8 是量化：

```txt
组件体积
构建耗时
运行时性能
tree-shaking
```

Phase 9 是优化：

```txt
减少静态组件 runtime 成本
降低 icon 引入体积
优化单组件使用场景
明确 runtime external / bundled / none 策略
```

不要在 Phase 9 做完整图标库，也不要做 shadcn-like registry。那个放 Phase 10。

---

# 2. 建议分支名

```bash
git checkout -b feat/icon-no-runtime-output
```

或者如果继续在当前大分支上：

```bash
git checkout feat/component-compiler-host
```

提交前缀建议：

```bash
feat(output-icons): add no-runtime icon output
bench(component-host): add icon no-runtime size baseline
docs: add phase9 icon no-runtime design
```

---

# 3. 目标产物

新增包：

```txt
packages/web-c/output-icons
```

输出结构：

```txt
dist/
  icons/
    svg/
      check.svg
      x.svg
      search.svg

    react/
      CheckIcon.js
      XIcon.js
      SearchIcon.js
      index.js
      index.d.ts

    vue/
      CheckIcon.js
      XIcon.js
      SearchIcon.js
      index.js
      index.d.ts

    wc/
      z-icon-check.js
      z-icon-x.js
      z-icon-search.js
      index.js
      index.d.ts
```

其中：

```txt
icons/react/*.js 不依赖 Zeus runtime
icons/vue/*.js 不依赖 Zeus runtime
icons/wc/*.js 不依赖 Zeus runtime
icons/svg/*.svg 只是原始资源
```

---

# 4. 使用方式

## 4.1 构建配置

```ts
// vite.config.ts

import zeus from '@zeus-js/bundler-plugin/vite'
import icons from '@zeus-js/output-icons'

export default {
  plugins: [
    zeus({
      outputs: [
        icons({
          icons: [
            {
              name: 'check',
              svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
            },
            {
              name: 'x',
              svg: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
            },
          ],

          react: true,
          vue: true,
          wc: {
            tagPrefix: 'z-icon-',
          },
          svg: true,
        }),
      ],
    }),
  ],
}
```

## 4.2 React 用户

```tsx
import { CheckIcon } from '@zeus-ui/icons/react'

export function App() {
  return <CheckIcon size={20} aria-label="checked" />
}
```

不依赖：

```txt
@zeus-js/signal
@zeus-js/runtime-dom
@zeus-js/zeus
```

## 4.3 Vue 用户

```vue
<script setup lang="ts">
import { CheckIcon } from '@zeus-ui/icons/vue'
</script>

<template>
  <CheckIcon :size="20" aria-label="checked" />
</template>
```

## 4.4 Web Component 用户

```ts
import '@zeus-ui/icons/wc/z-icon-check'
```

```html
<z-icon-check size="20" label="checked"></z-icon-check>
```

这个 Web Component 是静态 class，不依赖 Zeus runtime。

---

# 5. 为什么 icon 要 no-runtime

普通 headless 组件需要 runtime：

```txt
Signal props
Effect 更新
Slot 分发
Host 状态
CustomEvent
生命周期 cleanup
```

但 icon 大多数只需要：

```txt
渲染 SVG
接收 size / label / color
少量 attributeChangedCallback
```

如果 icon 也走：

```tsx
defineElement('z-icon', ...)
```

那只使用一个 icon 时也会带上：

```txt
@zeus-js/signal
@zeus-js/runtime-dom
@zeus-js/zeus
```

这对组件库体验不划算。

---

# 6. 新包结构

```txt
packages/web-c/output-icons/
  package.json
  src/
    index.ts
    types.ts
    naming.ts
    svg.ts
    generateReactIcon.ts
    generateVueIcon.ts
    generateStaticWcIcon.ts
    generateDts.ts
    generateIndex.ts
  __tests__/
    generateReactIcon.spec.ts
    generateVueIcon.spec.ts
    generateStaticWcIcon.spec.ts
    outputIcons.spec.ts
```

---

# 7. package.json 草案

```json
{
  "name": "@zeus-js/output-icons",
  "version": "0.0.2",
  "description": "No-runtime icon output plugin for Zeus component compiler host",
  "type": "module",
  "main": "index.js",
  "module": "dist/output-icons.esm-bundler.js",
  "types": "dist/output-icons.d.ts",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/output-icons.d.ts",
      "node": {
        "production": "./dist/output-icons.cjs.prod.js",
        "development": "./dist/output-icons.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/output-icons.esm-bundler.js",
      "import": "./dist/output-icons.esm-bundler.js",
      "require": "./index.js"
    },
    "./*": "./*"
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusOutputIcons",
    "formats": ["esm-bundler", "cjs"]
  },
  "dependencies": {
    "@zeus-js/bundler-plugin": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=18 || >=19",
    "vue": ">=3"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    },
    "vue": {
      "optional": true
    }
  },
  "keywords": ["zeus", "icons", "web-components", "react", "vue"],
  "author": "Baicie",
  "license": "MIT"
}
```

---

# 8. 核心类型设计

## `types.ts`

```ts
// packages/web-c/output-icons/src/types.ts

export interface IconSource {
  /**
   * Icon name.
   *
   * Example:
   *   check
   *   chevron-down
   */
  name: string

  /**
   * Full svg source.
   */
  svg: string

  /**
   * Optional display name.
   */
  title?: string
}

export interface OutputIconsOptions {
  /**
   * Icon source list.
   *
   * MVP 先支持内联 icons。
   * 后续可以扩展 from: string | string[] 读取 svg 文件。
   */
  icons: IconSource[]

  /**
   * Output root.
   *
   * @default 'icons'
   */
  outDir?: string

  /**
   * Emit raw svg files.
   *
   * @default true
   */
  svg?: boolean

  /**
   * Emit React static icon components.
   *
   * @default true
   */
  react?: boolean | ReactIconOutputOptions

  /**
   * Emit Vue static icon components.
   *
   * @default true
   */
  vue?: boolean | VueIconOutputOptions

  /**
   * Emit static custom elements.
   *
   * @default false
   */
  wc?: boolean | StaticWcIconOutputOptions

  /**
   * Whether to emit d.ts files.
   *
   * @default true
   */
  dts?: boolean
}

export interface ReactIconOutputOptions {
  outDir?: string
}

export interface VueIconOutputOptions {
  outDir?: string
}

export interface StaticWcIconOutputOptions {
  outDir?: string

  /**
   * Example:
   *   tagPrefix: 'z-icon-'
   *   check -> z-icon-check
   *
   * @default 'z-icon-'
   */
  tagPrefix?: string
}

export interface NormalizedOutputIconsOptions {
  icons: NormalizedIconSource[]
  outDir: string
  svg: boolean
  react: false | Required<ReactIconOutputOptions>
  vue: false | Required<VueIconOutputOptions>
  wc: false | Required<StaticWcIconOutputOptions>
  dts: boolean
}

export interface NormalizedIconSource {
  name: string
  componentName: string
  wcTag: string
  svg: string
  title?: string
  viewBox: string
  innerSvg: string
}
```

---

# 9. 命名规则

## `naming.ts`

```ts
// packages/web-c/output-icons/src/naming.ts

export function toPascalCase(value: string): string {
  const result = value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  return result || 'Icon'
}

export function toIconComponentName(name: string): string {
  const pascal = toPascalCase(name)

  return pascal.endsWith('Icon') ? pascal : `${pascal}Icon`
}

export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getIconJsFileName(name: string): string {
  return `${sanitizeFileName(name)}.js`
}

export function getIconSvgFileName(name: string): string {
  return `${sanitizeFileName(name)}.svg`
}

export function getIconDtsFileName(name: string): string {
  return `${sanitizeFileName(name)}.d.ts`
}
```

---

# 10. SVG 解析与标准化

MVP 不做复杂 SVG optimizer，但需要提取：

```txt
viewBox
innerSvg
```

并做最低限度安全处理：

```txt
移除 script
移除 onxxx handler
保留 path/circle/rect 等
```

## `svg.ts`

```ts
// packages/web-c/output-icons/src/svg.ts

export interface ParsedSvg {
  viewBox: string
  innerSvg: string
}

export function parseSvg(source: string): ParsedSvg {
  const safe = sanitizeSvg(source)
  const svgMatch = safe.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i)

  if (!svgMatch) {
    throw new Error('Invalid SVG source. Expected <svg>...</svg>.')
  }

  const attrs = svgMatch[1] ?? ''
  const innerSvg = svgMatch[2]?.trim() ?? ''
  const viewBox =
    readAttribute(attrs, 'viewBox') ??
    readAttribute(attrs, 'viewbox') ??
    '0 0 24 24'

  return {
    viewBox,
    innerSvg,
  }
}

export function sanitizeSvg(source: string): string {
  return source
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*\{[^}]*\}/gi, '')
}

function readAttribute(attrs: string, name: string): string | undefined {
  const doubleQuote = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)
  if (doubleQuote) return doubleQuote[1]

  const singleQuote = new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(attrs)
  if (singleQuote) return singleQuote[1]

  return undefined
}

export function escapeTemplateLiteral(value: string): string {
  return value.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

export function svgToDataSource(svg: string): string {
  return svg.trim()
}
```

---

# 11. React static icon 生成

React 输出目标：

```js
import React from 'react'

export const CheckIcon = React.forwardRef(function CheckIcon(props, ref) {
  const {
    size = '1em',
    title,
    children,
    ...rest
  } = props

  return React.createElement(
    'svg',
    {
      ...rest,
      ref,
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': title ? undefined : true,
      role: title ? 'img' : undefined,
    },
    title ? React.createElement('title', null, title) : null,
    ...
  )
})
```

为了避免把 SVG inner 解析成 React AST，MVP 可以用 `dangerouslySetInnerHTML`。
这对图标库可接受，但要确保 SVG 经过 sanitize。

## `generateReactIcon.ts`

```ts
// packages/web-c/output-icons/src/generateReactIcon.ts

import { escapeTemplateLiteral } from './svg'
import type { NormalizedIconSource } from './types'

export function generateReactIcon(icon: NormalizedIconSource): string {
  const inner = escapeTemplateLiteral(icon.innerSvg)

  return `
import React from 'react';

export const ${icon.componentName} = React.forwardRef(function ${icon.componentName}(props, ref) {
  const {
    size = '1em',
    title,
    children,
    ...rest
  } = props;

  return React.createElement(
    'svg',
    {
      ...rest,
      ref,
      width: size,
      height: size,
      viewBox: ${JSON.stringify(icon.viewBox)},
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': title ? undefined : true,
      role: title ? 'img' : undefined,
      dangerouslySetInnerHTML: children
        ? undefined
        : { __html: \`${inner}\` },
    },
    title ? React.createElement('title', null, title) : null,
    children,
  );
});
`.trimStart()
}

export function generateReactIndex(icons: NormalizedIconSource[]): string {
  return `${icons
    .map(icon => {
      return `export { ${icon.componentName} } from './${icon.name}.js';`
    })
    .join('\n')}\n`
}
```

---

# 12. Vue static icon 生成

Vue 输出目标：

```js
import { defineComponent, h } from 'vue'

export const CheckIcon = defineComponent({
  name: 'CheckIcon',
  props: {
    size: { type: [String, Number], default: '1em' },
    title: String
  },
  setup(props, { attrs, slots }) {
    return () => h('svg', ...)
  }
})
```

## `generateVueIcon.ts`

```ts
// packages/web-c/output-icons/src/generateVueIcon.ts

import { escapeTemplateLiteral } from './svg'
import type { NormalizedIconSource } from './types'

export function generateVueIcon(icon: NormalizedIconSource): string {
  const inner = escapeTemplateLiteral(icon.innerSvg)

  return `
import { defineComponent, h } from 'vue';

export const ${icon.componentName} = defineComponent({
  name: ${JSON.stringify(icon.componentName)},

  props: {
    size: {
      type: [String, Number],
      default: '1em',
    },
    title: {
      type: String,
      default: undefined,
    },
  },

  setup(props, { attrs, slots }) {
    return () => {
      const children = [];

      if (props.title) {
        children.push(h('title', null, props.title));
      }

      if (slots.default) {
        children.push(...slots.default());
      }

      return h(
        'svg',
        {
          ...attrs,
          width: props.size,
          height: props.size,
          viewBox: ${JSON.stringify(icon.viewBox)},
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': props.title ? undefined : true,
          role: props.title ? 'img' : undefined,
          innerHTML: slots.default ? undefined : \`${inner}\`,
        },
        children,
      );
    };
  },
});
`.trimStart()
}

export function generateVueIndex(icons: NormalizedIconSource[]): string {
  return `${icons
    .map(icon => {
      return `export { ${icon.componentName} } from './${icon.name}.js';`
    })
    .join('\n')}\n`
}
```

---

# 13. Static Web Component icon 生成

这个是 Phase 9 的核心：**不走 defineElement，不依赖 Zeus runtime**。

生成目标：

```js
const template = document.createElement('template')
template.innerHTML = `<svg ...>...</svg>`

class ZIconCheck extends HTMLElement {
  static observedAttributes = ['size', 'label']

  connectedCallback() {
    this.render()
  }

  attributeChangedCallback() {
    this.render()
  }

  render() {
    ...
  }
}

customElements.define('z-icon-check', ZIconCheck)
```

## `generateStaticWcIcon.ts`

```ts
// packages/web-c/output-icons/src/generateStaticWcIcon.ts

import { escapeTemplateLiteral } from './svg'
import type { NormalizedIconSource } from './types'

export function generateStaticWcIcon(icon: NormalizedIconSource): string {
  const inner = escapeTemplateLiteral(icon.innerSvg)
  const className = `${icon.componentName}Element`

  return `
const INNER_SVG = \`${inner}\`;
const VIEW_BOX = ${JSON.stringify(icon.viewBox)};

export class ${className} extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'label'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  get size() {
    return this.getAttribute('size') || '1em';
  }

  set size(value) {
    if (value == null) {
      this.removeAttribute('size');
    } else {
      this.setAttribute('size', String(value));
    }
  }

  get label() {
    return this.getAttribute('label') || '';
  }

  set label(value) {
    if (value == null || value === '') {
      this.removeAttribute('label');
    } else {
      this.setAttribute('label', String(value));
    }
  }

  render() {
    const size = this.size;
    const label = this.label;

    this.innerHTML =
      '<svg' +
      ' part="root"' +
      ' width="' + escapeHtml(size) + '"' +
      ' height="' + escapeHtml(size) + '"' +
      ' viewBox="' + escapeHtml(VIEW_BOX) + '"' +
      ' xmlns="http://www.w3.org/2000/svg"' +
      (label ? ' role="img" aria-label="' + escapeHtml(label) + '"' : ' aria-hidden="true"') +
      '>' +
      INNER_SVG +
      '</svg>';
  }
}

if (!customElements.get(${JSON.stringify(icon.wcTag)})) {
  customElements.define(${JSON.stringify(icon.wcTag)}, ${className});
}

export const ${icon.componentName} = ${className};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
`.trimStart()
}

export function generateStaticWcIndex(icons: NormalizedIconSource[]): string {
  return `${icons
    .map(icon => {
      return `export { ${icon.componentName} } from './${icon.name}.js';`
    })
    .join('\n')}\n`
}
```

---

# 14. DTS 生成

## `generateDts.ts`

```ts
// packages/web-c/output-icons/src/generateDts.ts

import type { NormalizedIconSource } from './types'

export function generateReactDts(icons: NormalizedIconSource[]): string {
  const lines: string[] = []

  lines.push(`import type * as React from 'react'`)
  lines.push('')

  lines.push(
    `export interface IconProps extends React.SVGAttributes<SVGSVGElement> {`,
  )
  lines.push(`  size?: string | number`)
  lines.push(`  title?: string`)
  lines.push(`}`)
  lines.push('')

  for (const icon of icons) {
    lines.push(
      `export declare const ${icon.componentName}: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>`,
    )
  }

  lines.push('')

  return lines.join('\n')
}

export function generateVueDts(icons: NormalizedIconSource[]): string {
  const lines: string[] = []

  lines.push(`import type { DefineComponent } from 'vue'`)
  lines.push('')

  lines.push(`export interface IconProps {`)
  lines.push(`  size?: string | number`)
  lines.push(`  title?: string`)
  lines.push(`}`)
  lines.push('')

  for (const icon of icons) {
    lines.push(
      `export declare const ${icon.componentName}: DefineComponent<IconProps>`,
    )
  }

  lines.push('')

  return lines.join('\n')
}

export function generateStaticWcDts(icons: NormalizedIconSource[]): string {
  const lines: string[] = []

  for (const icon of icons) {
    const className = `${icon.componentName}Element`

    lines.push(`export interface ${className} extends HTMLElement {`)
    lines.push(`  size?: string`)
    lines.push(`  label?: string`)
    lines.push(`}`)
    lines.push('')
    lines.push(`export declare const ${icon.componentName}: {`)
    lines.push(`  new (): ${className}`)
    lines.push(`}`)
    lines.push('')
  }

  lines.push('declare global {')
  lines.push('  interface HTMLElementTagNameMap {')

  for (const icon of icons) {
    lines.push(
      `    ${JSON.stringify(icon.wcTag)}: ${icon.componentName}Element`,
    )
  }

  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('export {}')
  lines.push('')

  return lines.join('\n')
}
```

---

# 15. output-icons 主实现

## `index.ts`

```ts
// packages/web-c/output-icons/src/index.ts

import path from 'node:path'

import {
  getIconJsFileName,
  getIconSvgFileName,
  toIconComponentName,
} from './naming'
import { parseSvg, svgToDataSource } from './svg'
import {
  generateReactDts,
  generateStaticWcDts,
  generateVueDts,
} from './generateDts'
import { generateReactIcon, generateReactIndex } from './generateReactIcon'
import {
  generateStaticWcIcon,
  generateStaticWcIndex,
} from './generateStaticWcIcon'
import { generateVueIcon, generateVueIndex } from './generateVueIcon'

import type {
  ZeusOutputFile,
  ZeusOutputPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'
import type {
  IconSource,
  NormalizedIconSource,
  NormalizedOutputIconsOptions,
  OutputIconsOptions,
} from './types'

export type { IconSource, OutputIconsOptions } from './types'

export default function icons(options: OutputIconsOptions): ZeusOutputPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-icons',

    virtualModules(): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      if (normalized.react) {
        for (const icon of normalized.icons) {
          modules.push({
            id: `zeus:icons:react:${icon.name}`,
            fileName: path.posix.join(
              normalized.outDir,
              normalized.react.outDir,
              getIconJsFileName(icon.name),
            ),
            code: generateReactIcon(icon),
          })
        }

        modules.push({
          id: 'zeus:icons:react:index',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.react.outDir,
            'index.js',
          ),
          code: generateReactIndex(normalized.icons),
        })
      }

      if (normalized.vue) {
        for (const icon of normalized.icons) {
          modules.push({
            id: `zeus:icons:vue:${icon.name}`,
            fileName: path.posix.join(
              normalized.outDir,
              normalized.vue.outDir,
              getIconJsFileName(icon.name),
            ),
            code: generateVueIcon(icon),
          })
        }

        modules.push({
          id: 'zeus:icons:vue:index',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.vue.outDir,
            'index.js',
          ),
          code: generateVueIndex(normalized.icons),
        })
      }

      if (normalized.wc) {
        for (const icon of normalized.icons) {
          modules.push({
            id: `zeus:icons:wc:${icon.name}`,
            fileName: path.posix.join(
              normalized.outDir,
              normalized.wc.outDir,
              getIconJsFileName(icon.name),
            ),
            code: generateStaticWcIcon(icon),
          })
        }

        modules.push({
          id: 'zeus:icons:wc:index',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.wc.outDir,
            'index.js',
          ),
          code: generateStaticWcIndex(normalized.icons),
        })
      }

      return modules
    },

    generateBundle(): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (normalized.svg) {
        for (const icon of normalized.icons) {
          files.push({
            type: 'asset',
            fileName: path.posix.join(
              normalized.outDir,
              'svg',
              getIconSvgFileName(icon.name),
            ),
            source: svgToDataSource(icon.svg),
          })
        }
      }

      if (normalized.dts && normalized.react) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.react.outDir,
            'index.d.ts',
          ),
          source: generateReactDts(normalized.icons),
        })
      }

      if (normalized.dts && normalized.vue) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.vue.outDir,
            'index.d.ts',
          ),
          source: generateVueDts(normalized.icons),
        })
      }

      if (normalized.dts && normalized.wc) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(
            normalized.outDir,
            normalized.wc.outDir,
            'index.d.ts',
          ),
          source: generateStaticWcDts(normalized.icons),
        })
      }

      return files
    },
  }
}

function normalizeOptions(
  options: OutputIconsOptions,
): NormalizedOutputIconsOptions {
  if (!options.icons?.length) {
    throw new Error('[zeus-output-icons] options.icons is required.')
  }

  const wcOptions =
    options.wc === false
      ? false
      : {
          outDir:
            typeof options.wc === 'object' && options.wc.outDir
              ? options.wc.outDir
              : 'wc',
          tagPrefix:
            typeof options.wc === 'object' && options.wc.tagPrefix
              ? options.wc.tagPrefix
              : 'z-icon-',
        }

  return {
    icons: normalizeIcons(
      options.icons,
      wcOptions ? wcOptions.tagPrefix : 'z-icon-',
    ),
    outDir: options.outDir ?? 'icons',
    svg: options.svg ?? true,
    react:
      options.react === false
        ? false
        : {
            outDir:
              typeof options.react === 'object' && options.react.outDir
                ? options.react.outDir
                : 'react',
          },
    vue:
      options.vue === false
        ? false
        : {
            outDir:
              typeof options.vue === 'object' && options.vue.outDir
                ? options.vue.outDir
                : 'vue',
          },
    wc: wcOptions,
    dts: options.dts ?? true,
  }
}

function normalizeIcons(
  icons: IconSource[],
  tagPrefix: string,
): NormalizedIconSource[] {
  return icons.map(icon => {
    const parsed = parseSvg(icon.svg)

    return {
      name: icon.name,
      componentName: toIconComponentName(icon.name),
      wcTag: `${tagPrefix}${icon.name}`,
      svg: icon.svg,
      title: icon.title,
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    }
  })
}
```

---

# 16. packages/headless 如何使用

Phase 9 不一定要立刻把 `z-icon` 替换掉。建议先新增：

```txt
packages/headless/src/icons.ts
```

或者单独创建一个 icons fixture：

```txt
packages/headless/src/icon/icon-sources.ts
```

```ts
// packages/headless/src/icon/icon-sources.ts

export const headlessIcons = [
  {
    name: 'check',
    svg: `
      <svg viewBox="0 0 24 24">
        <path
          d="M20 6 9 17l-5-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    `,
  },
  {
    name: 'x',
    svg: `
      <svg viewBox="0 0 24 24">
        <path
          d="M18 6 6 18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
        <path
          d="m6 6 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    `,
  },
] as const
```

然后在 `packages/headless/vite.config.ts` 里追加：

```ts
import icons from '@zeus-js/output-icons'
import { headlessIcons } from './src/icon/icon-sources'

outputs: [
  wc(...),
  react(...),
  vue(...),

  icons({
    icons: [...headlessIcons],
    outDir: 'icons',
    react: true,
    vue: true,
    wc: {
      tagPrefix: 'z-icon-',
    },
    svg: true,
    dts: true,
  }),
]
```

最终 `@zeus-ui/headless` 可以增加 exports：

```json
{
  "exports": {
    "./icons/react": {
      "types": "./dist/icons/react/index.d.ts",
      "import": "./dist/icons/react/index.js"
    },
    "./icons/vue": {
      "types": "./dist/icons/vue/index.d.ts",
      "import": "./dist/icons/vue/index.js"
    },
    "./icons/wc": {
      "types": "./dist/icons/wc/index.d.ts",
      "import": "./dist/icons/wc/index.js"
    },
    "./icons/svg/*": {
      "default": "./dist/icons/svg/*.svg"
    }
  }
}
```

---

# 17. Phase 8 benchmark 补充

在 Phase 8 的 `benchmarks/component-host` 里增加 icon benchmark。

## 新增 entry

```ts
// benchmarks/component-host/src/entries/icon-react-single.ts

export { CheckIcon } from 'zeus:icons:react:check'
```

```ts
// benchmarks/component-host/src/entries/icon-vue-single.ts

export { CheckIcon } from 'zeus:icons:vue:check'
```

```ts
// benchmarks/component-host/src/entries/icon-wc-single.ts

export { CheckIcon } from 'zeus:icons:wc:check'
```

## vite config 追加 output-icons

```ts
import icons from '@zeus-js/output-icons'

const benchIcons = [
  {
    name: 'check',
    svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  },
]

outputs: [
  wc(...),
  react(...),
  vue(...),

  icons({
    icons: benchIcons,
    outDir: 'icons',
    react: true,
    vue: true,
    wc: true,
    svg: true,
  }),
]
```

## 体积阈值建议

```ts
size: {
  'icons/react/check.js:gzip': 2 * 1024,
  'icons/vue/check.js:gzip': 2 * 1024,
  'icons/wc/check.js:gzip': 2 * 1024,
}
```

这个门槛可以比较严格，因为 no-runtime icon 应该很小。

---

# 18. Runtime output 策略正式化

Phase 9 同时建议把 runtime 策略写进文档，不一定全部实现。

## 输出模式

```ts
wc({
  runtime: 'external',
})
```

默认。适合 npm 包。

```txt
组件 entry import @zeus-js/runtime-dom
runtime 由依赖共享
tree-shaking 更好
```

```ts
wc({
  runtime: 'bundled',
})
```

后续可做。适合 CDN standalone。

```txt
单文件可用
体积更大
```

```ts
icons({
  runtime: 'none',
})
```

Icon 专用。Phase 9 实际落地的是这个。

```txt
不依赖 Zeus runtime
不依赖 signal
不依赖 runtime-dom
```

Phase 9 不建议马上给 `output-wc` 做 bundled runtime，除非 Phase 8 数据证明强需求。先把 icon no-runtime 做好。

---

# 19. 测试设计

## `generateReactIcon.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import { parseSvg } from '../src/svg'
import { generateReactIcon } from '../src/generateReactIcon'

describe('generateReactIcon', () => {
  it('generates no-runtime React icon', () => {
    const parsed = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    )

    const code = generateReactIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    })

    expect(code).toContain(`import React from 'react'`)
    expect(code).toContain('export const CheckIcon')
    expect(code).toContain('React.forwardRef')
    expect(code).not.toContain('@zeus-js')
    expect(code).not.toContain('defineElement')
  })
})
```

## `generateStaticWcIcon.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import { parseSvg } from '../src/svg'
import { generateStaticWcIcon } from '../src/generateStaticWcIcon'

describe('generateStaticWcIcon', () => {
  it('generates static custom element without Zeus runtime', () => {
    const parsed = parseSvg(
      '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    )

    const code = generateStaticWcIcon({
      name: 'check',
      componentName: 'CheckIcon',
      wcTag: 'z-icon-check',
      svg: '',
      viewBox: parsed.viewBox,
      innerSvg: parsed.innerSvg,
    })

    expect(code).toContain('customElements.define')
    expect(code).toContain('class CheckIconElement extends HTMLElement')
    expect(code).not.toContain('@zeus-js')
    expect(code).not.toContain('defineElement')
  })
})
```

## `outputIcons.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import icons from '../src'

describe('output-icons', () => {
  it('creates output plugin', () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
    })

    expect(plugin.name).toBe('zeus-output-icons')
    expect(typeof plugin.virtualModules).toBe('function')
    expect(typeof plugin.generateBundle).toBe('function')
  })

  it('emits virtual modules', async () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
      react: true,
      vue: true,
      wc: true,
    })

    const modules = await plugin.virtualModules?.({
      root: process.cwd(),
      manifest: {
        version: 1,
        components: [],
      },
      diagnostics: [],
      emitFile: (() => '') as any,
      warn: (() => {}) as any,
      error: (() => {}) as any,
      addWatchFile: (() => {}) as any,
      meta: {
        watchMode: false,
      },
    })

    expect(modules?.map(item => item.fileName)).toEqual(
      expect.arrayContaining([
        'icons/react/check.js',
        'icons/vue/check.js',
        'icons/wc/check.js',
      ]),
    )
  })
})
```

---

# 20. 文档草案

新增：

```txt
docs/internal/stage05-component-compiler-host/design/phase9.md
```

内容大纲：

````md
# Phase 9: Icon No-runtime Output + Runtime Size Optimization

## Goal

Static icons should not require Zeus runtime.

## Packages

- `@zeus-js/output-icons`

## Outputs

```txt
dist/icons/
  react/
  vue/
  wc/
  svg/
```
````

## Principles

- React static icons depend only on React.
- Vue static icons depend only on Vue.
- Static Web Component icons depend only on browser Custom Elements.
- No `@zeus-js/runtime-dom`.
- No `@zeus-js/signal`.
- No `defineElement`.

## Runtime modes

- interactive components: runtime external
- CDN components: runtime bundled, future
- static icons: runtime none

## Benchmarks

- compare `z-icon` runtime version with `CheckIcon` no-runtime version
- enforce gzip threshold for icon single output

````

---

# 21. 验收清单

```txt
[ ] 新增 packages/web-c/output-icons
[ ] 支持 icons inline source
[ ] 支持 React static icon output
[ ] 支持 Vue static icon output
[ ] 支持 Static Web Component icon output
[ ] 支持 raw SVG asset output
[ ] 支持 d.ts output
[ ] 生成代码不包含 @zeus-js
[ ] 生成代码不包含 defineElement
[ ] headless 可选接入 icons output
[ ] Phase 8 benchmark 增加 icon no-runtime size
[ ] icon 单个 gzip 阈值 <= 2KB
[ ] 文档补 phase9
[ ] pnpm build 通过
[ ] pnpm build-dts 通过
[ ] pnpm test-unit 通过
````

---

# 22. 推荐提交顺序

```bash
# 1. output-icons 包骨架
git add packages/web-c/output-icons/package.json packages/web-c/output-icons/src/types.ts
git commit -m "feat(output-icons): add package scaffold"

# 2. svg/naming utils
git add packages/web-c/output-icons/src/naming.ts packages/web-c/output-icons/src/svg.ts
git commit -m "feat(output-icons): add svg and naming utilities"

# 3. react/vue static generators
git add packages/web-c/output-icons/src/generateReactIcon.ts packages/web-c/output-icons/src/generateVueIcon.ts
git commit -m "feat(output-icons): generate static framework icons"

# 4. static custom element generator
git add packages/web-c/output-icons/src/generateStaticWcIcon.ts
git commit -m "feat(output-icons): generate no-runtime web component icons"

# 5. dts + plugin entry
git add packages/web-c/output-icons/src/generateDts.ts packages/web-c/output-icons/src/index.ts
git commit -m "feat(output-icons): implement icon output plugin"

# 6. tests
git add packages/web-c/output-icons/__tests__
git commit -m "test(output-icons): cover no-runtime icon generation"

# 7. benchmark
git add benchmarks/component-host scripts/bench
git commit -m "bench(component-host): add no-runtime icon size baseline"

# 8. docs
git add docs/internal/stage05-component-compiler-host/design/phase9.md
git commit -m "docs: add phase9 icon no-runtime design"
```

---

# 23. Phase 9 完成后的效果

原本：

```tsx
import { ZIcon } from '@zeus-ui/headless/react'
;<ZIcon name="check" />
```

可能会带上：

```txt
Zeus runtime
signal
runtime-dom
```

Phase 9 后：

```tsx
import { CheckIcon } from '@zeus-ui/headless/icons/react'
;<CheckIcon size={20} />
```

只依赖：

```txt
React
少量 SVG component code
```

Web Component 静态版：

```ts
import '@zeus-ui/headless/icons/wc/check'
```

```html
<z-icon-check size="20" label="checked"></z-icon-check>
```

只依赖：

```txt
浏览器 Custom Elements
不依赖 Zeus runtime
```

---

# 24. Phase 9 和后续路线

```txt
Phase 8：Benchmark & Quality Gates
Phase 9：Icon no-runtime + runtime size optimization
Phase 10：shadcn-like Registry
Phase 11：Docs + Release Candidate
```

Phase 9 做完后再做 Phase 10 会更稳，因为 shadcn-like registry 最核心的体验就是：

```txt
按需添加
体积轻
源码可改
样式可控
```

如果 icon 和单组件体积没有控制住，Phase 10 的体验会打折。
