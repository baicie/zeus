# Phase 6：React / Vue Wrapper Output 详细设计与代码草案

Phase 6 的目标是实现两个正式输出插件：

```txt id="l2r17i"
@zeus-js/output-react-wrapper
@zeus-js/output-vue-wrapper
```

它们消费前面阶段产出的 `ComponentManifest`，生成 React/Vue 可用的 wrapper。底层仍然是 Zeus 编译出来的 Web Component，React/Vue 不重新实现组件逻辑。

当前 `defineElement` 已经负责 Web Component 的注册、props 同步、attribute/property 同步、shadow/light 渲染、CustomEvent、生命周期等逻辑。
`emit()` 当前会派发 `CustomEvent`，并且默认 `bubbles / composed / cancelable` 都是 `true`，所以 React/Vue wrapper 只需要通过 `addEventListener` 桥接事件。
`Slot` 已经支持 shadow mode 原生 slot 和 light DOM mode 下的 captured children 分发，所以 wrapper 需要做的只是把 React/Vue 的 children 或 named slot 转成标准 Web Component slot。

---

# 1. Phase 6 目标

## 做什么

```txt id="nm7b2a"
1. 新增 addons/output-react-wrapper
2. 新增 addons/output-vue-wrapper
3. React wrapper 生成 JS
4. Vue wrapper 生成 JS
5. React wrapper 生成 d.ts
6. Vue wrapper 生成 d.ts
7. Vue GlobalComponents d.ts
8. 支持 default slot
9. 支持 named slots
10. 支持 props property sync
11. 支持 CustomEvent -> React onXxx
12. 支持 CustomEvent -> Vue emits
13. 支持 ref
14. 支持 className / style / attrs 透传
15. 增加 Rollup 集成测试
16. 增加 examples/react 和 examples/vue
```

## 不做什么

```txt id="wkghbn"
1. 不重新实现组件逻辑
2. 不绕过 Web Component
3. 不生成 shadcn-like 源码模板
4. 不做完整 UI 组件库
5. 不做服务端渲染专项适配
6. 不做 Angular/Svelte/Solid wrapper
```

---

# 2. 最终使用效果

假设用户组件源码：

```tsx id="ppy8y5"
export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
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
  },
  (props, { emit }) => {
    return (
      <button
        disabled={props.disabled}
        onClick={event => emit('press', { nativeEvent: event })}
      >
        <Slot />
      </button>
    )
  },
)
```

React 用户：

```tsx id="a7kmpy"
import { ZButton } from '@zeus-ui/headless/react'

export function App() {
  return (
    <ZButton
      variant="default"
      onPress={event => {
        event.detail.nativeEvent.preventDefault()
      }}
    >
      Button
    </ZButton>
  )
}
```

Vue 用户：

```vue id="r2mq8b"
<script setup lang="ts">
import { ZButton } from '@zeus-ui/headless/vue'

function handlePress(event: CustomEvent<{ nativeEvent: MouseEvent }>) {
  event.detail.nativeEvent.preventDefault()
}
</script>

<template>
  <ZButton variant="default" @press="handlePress"> Button </ZButton>
</template>
```

底层最终仍然是：

```html id="yxw3lt"
<z-button variant="default">Button</z-button>
```

---

# 3. 推荐构建配置

```ts id="md4drz"
// vite.config.ts / rollup.config.ts / rolldown.config.ts

import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'

export default {
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },

      outputs: [
        wc({
          outDir: 'wc',
        }),

        react({
          outDir: 'react',
          wcOutDir: '../wc',
        }),

        vue({
          outDir: 'vue',
          wcOutDir: '../wc',
        }),
      ],
    }),
  ],
}
```

输出：

```txt id="hp8oxb"
dist/
  wc/
    z-button.js
    z-card.js
    index.js

  react/
    z-button.js
    z-card.js
    index.js
    index.d.ts

  vue/
    z-button.js
    z-card.js
    index.js
    index.d.ts
    global.d.ts
```

---

# 4. 关键设计原则

## 4.1 wrapper 只做适配层

React/Vue wrapper 只做：

```txt id="m5ydrw"
1. import 对应 Web Component entry，确保注册
2. 把框架 props 写到 DOM property
3. 把 CustomEvent 转成 React/Vue 事件
4. 把 children / named slots 转成 Web Component slot
5. 暴露类型
```

不要在 React/Vue 里重写逻辑。

---

## 4.2 props 必须走 property sync

不能只依赖：

```tsx id="c2tir5"
<z-button variant={variant} disabled={disabled} />
```

因为：

```txt id="j4ce3p"
boolean attribute 容易变成字符串问题
object / array props 不能走 attribute
Custom Element property 赋值在不同框架里有差异
```

所以 wrapper 统一用：

```ts id="qj7q8d"
el.variant = props.variant
el.disabled = props.disabled
el.columns = props.columns
```

---

## 4.3 React 事件必须 addEventListener

不要依赖 React 合成事件系统处理 CustomEvent：

```tsx id="uc1vc9"
<z-button onPress={...} />
```

应该生成：

```ts id="eqgkec"
el.addEventListener('press', handler)
```

---

## 4.4 Vue 也显式 bridge emits

Vue 虽然对 Web Component 更友好，但为了类型和一致性，也显式生成：

```ts id="akq3a9"
el.addEventListener('press', event => emit('press', event))
```

---

## 4.5 named slot 策略

Web Component named slot 需要：

```html id="ezt9sz"
<span slot="header">Header</span>
```

React wrapper 支持：

```tsx id="x2jzpa"
<ZCard header={<div>Header</div>} footer={<div>Footer</div>}>
  Content
</ZCard>
```

Vue wrapper 支持：

```vue id="bprerl"
<ZCard>
  <template #header>
    Header
  </template>

  Content

  <template #footer>
    Footer
  </template>
</ZCard>
```

---

# 5. 包结构

```txt id="pm1p16"
addons/
  output-react-wrapper/
    package.json
    src/
      index.ts
      types.ts
      naming.ts
      generateReactWrapper.ts
      generateReactIndex.ts
    __tests__/
      generateReactWrapper.spec.ts
      outputReactWrapper.spec.ts

  output-vue-wrapper/
    package.json
    src/
      index.ts
      types.ts
      naming.ts
      generateVueWrapper.ts
      generateVueIndex.ts
    __tests__/
      generateVueWrapper.spec.ts
      outputVueWrapper.spec.ts
```

---

# 6. React Wrapper Output

## 6.1 package.json

```json id="ccam3w"
// addons/output-react-wrapper/package.json
{
  "name": "@zeus-js/output-react-wrapper",
  "version": "0.0.2",
  "description": "Zeus React wrapper output plugin",
  "type": "module",
  "main": "index.js",
  "module": "dist/output-react-wrapper.esm-bundler.js",
  "types": "dist/output-react-wrapper.d.ts",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/output-react-wrapper.d.ts",
      "node": {
        "production": "./dist/output-react-wrapper.cjs.prod.js",
        "development": "./dist/output-react-wrapper.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/output-react-wrapper.esm-bundler.js",
      "import": "./dist/output-react-wrapper.esm-bundler.js",
      "require": "./index.js"
    },
    "./*": "./*"
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusOutputReactWrapper",
    "formats": ["esm-bundler", "cjs"]
  },
  "dependencies": {
    "@zeus-js/bundler-plugin": "workspace:*",
    "@zeus-js/component-analyzer": "workspace:*",
    "@zeus-js/component-dts": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=18 || >=19"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    }
  },
  "keywords": ["zeus", "react", "web-components"],
  "author": "Baicie",
  "license": "MIT"
}
```

---

## 6.2 React options

```ts id="cy3w4x"
// addons/output-react-wrapper/src/types.ts

export interface OutputReactWrapperOptions {
  /**
   * Output directory.
   *
   * @default 'react'
   */
  outDir?: string

  /**
   * Relative path from react output files to wc output dir.
   *
   * Example:
   *   react/z-button.js -> ../wc/z-button.js
   *
   * @default '../wc'
   */
  wcOutDir?: string

  /**
   * Whether to emit index.js.
   *
   * @default true
   */
  index?: boolean

  /**
   * Whether to emit index.d.ts.
   *
   * @default true
   */
  dts?: boolean

  /**
   * Whether to strip tag prefix when generating file names.
   */
  stripPrefix?: string | false

  /**
   * Custom file name.
   */
  fileName?: (tag: string) => string

  /**
   * Named slot mapping strategy.
   *
   * props:
   *   <ZCard header={<div />} />
   *
   * none:
   *   only children/default slot
   *
   * @default 'props'
   */
  namedSlots?: 'props' | 'none'
}
```

---

## 6.3 React naming

```ts id="b5zaco"
// addons/output-react-wrapper/src/naming.ts

export interface NamingOptions {
  stripPrefix?: string | false
  fileName?: (tag: string) => string
}

export function getFileBaseName(tag: string, options: NamingOptions): string {
  if (options.fileName) {
    return sanitize(options.fileName(tag)).replace(/\.js$/, '')
  }

  let name = tag

  if (options.stripPrefix && name.startsWith(options.stripPrefix)) {
    name = name.slice(options.stripPrefix.length)
  }

  return sanitize(name)
}

export function getJsFileName(tag: string, options: NamingOptions): string {
  return `${getFileBaseName(tag, options)}.js`
}

export function sanitize(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function toReactEventProp(eventName: string): string {
  return (
    'on' +
    eventName
      .split('-')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  )
}
```

---

## 6.4 React wrapper 生成器

```ts id="6hacbu"
// addons/output-react-wrapper/src/generateReactWrapper.ts

import type { ComponentRecord } from '@zeus-js/component-analyzer'

import { getJsFileName, toReactEventProp } from './naming'
import type { OutputReactWrapperOptions } from './types'

export interface GenerateReactWrapperOptions {
  component: ComponentRecord
  options: RequiredOutputReactWrapperOptions
}

export type RequiredOutputReactWrapperOptions = Required<
  Omit<OutputReactWrapperOptions, 'fileName'>
> & {
  fileName?: (tag: string) => string
}

export function generateReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, options } = input

  const wcImport = `${options.wcOutDir}/${getJsFileName(component.tag, options)}`
  const propNames = Object.keys(component.props)
  const eventNames = Object.keys(component.events)
  const namedSlots = getNamedSlots(component, options)

  const eventPropNames = eventNames.map(toReactEventProp)
  const namedSlotPropNames = namedSlots

  return `
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import ${JSON.stringify(wcImport)};

const PROP_KEYS = ${JSON.stringify(propNames)};
const EVENT_MAP = ${JSON.stringify(createReactEventMap(eventNames))};
const NAMED_SLOTS = ${JSON.stringify(namedSlots)};

export const ${component.name} = forwardRef(function ${component.name}(props, ref) {
  const {
    children,
    className,
    style,
    ${[...propNames, ...eventPropNames, ...namedSlotPropNames].join(',\n    ')}
    ,
    ...rest
  } = props;

  const innerRef = useRef(null);

  useImperativeHandle(ref, () => innerRef.current);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    ${generatePropSyncLines(propNames)}
  }, [${propNames.join(', ')}]);

  ${generateEventEffects(eventNames)}

  const slotChildren = [];

  ${generateNamedSlotRenderLines(namedSlots)}

  if (children != null) {
    slotChildren.push(children);
  }

  return React.createElement(
    ${JSON.stringify(component.tag)},
    {
      ...rest,
      ref: innerRef,
      className,
      style,
    },
    ...slotChildren,
  );
});

function createNamedSlot(name, value) {
  if (value == null || value === false) return null;

  if (
    React.isValidElement(value) &&
    value.type !== React.Fragment
  ) {
    return React.cloneElement(value, {
      slot: name,
      ...value.props,
    });
  }

  return React.createElement(
    'span',
    {
      slot: name,
      style: { display: 'contents' },
    },
    value,
  );
}
`.trimStart()
}

function createReactEventMap(eventNames: string[]): Record<string, string> {
  const map: Record<string, string> = {}

  for (const eventName of eventNames) {
    map[toReactEventProp(eventName)] = eventName
  }

  return map
}

function generatePropSyncLines(propNames: string[]): string {
  if (!propNames.length) {
    return ''
  }

  return propNames
    .map(name => {
      return `if (${name} !== undefined) el.${name} = ${name}; else el.${name} = undefined;`
    })
    .join('\n    ')
}

function generateEventEffects(eventNames: string[]): string {
  return eventNames
    .map(eventName => {
      const propName = toReactEventProp(eventName)

      return `
  useEffect(() => {
    const el = innerRef.current;
    if (!el || !${propName}) return;

    const handler = event => {
      ${propName}(event);
    };

    el.addEventListener(${JSON.stringify(eventName)}, handler);

    return () => {
      el.removeEventListener(${JSON.stringify(eventName)}, handler);
    };
  }, [${propName}]);
`
    })
    .join('\n')
}

function getNamedSlots(
  component: ComponentRecord,
  options: RequiredOutputReactWrapperOptions,
): string[] {
  if (options.namedSlots === 'none') return []

  return Object.keys(component.slots).filter(name => name !== 'default')
}

function generateNamedSlotRenderLines(namedSlots: string[]): string {
  return namedSlots
    .map(name => {
      return `
  {
    const node = createNamedSlot(${JSON.stringify(name)}, ${name});
    if (node != null) slotChildren.push(node);
  }
`
    })
    .join('\n')
}
```

### 生成结果示例

```js id="elfvbs"
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'

import '../wc/z-button.js'

export const ZButton = forwardRef(function ZButton(props, ref) {
  const { children, className, style, variant, disabled, onPress, ...rest } =
    props

  const innerRef = useRef(null)

  useImperativeHandle(ref, () => innerRef.current)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return

    if (variant !== undefined) el.variant = variant
    else el.variant = undefined

    if (disabled !== undefined) el.disabled = disabled
    else el.disabled = undefined
  }, [variant, disabled])

  useEffect(() => {
    const el = innerRef.current
    if (!el || !onPress) return

    const handler = event => {
      onPress(event)
    }

    el.addEventListener('press', handler)

    return () => {
      el.removeEventListener('press', handler)
    }
  }, [onPress])

  return React.createElement(
    'z-button',
    {
      ...rest,
      ref: innerRef,
      className,
      style,
    },
    children,
  )
})
```

---

## 6.5 React index 生成器

```ts id="rx22k9"
// addons/output-react-wrapper/src/generateReactIndex.ts

import type { ComponentRecord } from '@zeus-js/component-analyzer'
import { getJsFileName } from './naming'
import type { OutputReactWrapperOptions } from './types'

export function generateReactIndex(
  components: ComponentRecord[],
  options: OutputReactWrapperOptions,
): string {
  const lines: string[] = []

  for (const component of components) {
    const file = getJsFileName(component.tag, options).replace(/\.js$/, '')

    lines.push(`export { ${component.name} } from './${file}.js';`)
  }

  lines.push('')

  return lines.join('\n')
}
```

---

## 6.6 React output plugin 主实现

```ts id="ahr3y2"
// addons/output-react-wrapper/src/index.ts

import path from 'node:path'

import { generateReactDts } from '@zeus-js/component-dts'

import { generateReactWrapper } from './generateReactWrapper'
import { generateReactIndex } from './generateReactIndex'
import { getJsFileName } from './naming'

import type {
  ZeusOutputFile,
  ZeusOutputPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'
import type { OutputReactWrapperOptions } from './types'
import type { RequiredOutputReactWrapperOptions } from './generateReactWrapper'

export type { OutputReactWrapperOptions } from './types'

export default function reactWrapper(
  options: OutputReactWrapperOptions = {},
): ZeusOutputPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-react-wrapper',

    virtualModules(ctx): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:react:${component.tag}`,
          fileName: path.posix.join(
            normalized.outDir,
            getJsFileName(component.tag, normalized),
          ),
          code: generateReactWrapper({
            component,
            options: normalized,
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:react:index',
          fileName: path.posix.join(normalized.outDir, 'index.js'),
          code: generateReactIndex(ctx.manifest.components, normalized),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (normalized.dts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'index.d.ts'),
          source: generateReactDts(ctx.manifest),
        })
      }

      return files
    },
  }
}

function normalizeOptions(
  options: OutputReactWrapperOptions,
): RequiredOutputReactWrapperOptions {
  return {
    outDir: options.outDir ?? 'react',
    wcOutDir: options.wcOutDir ?? '../wc',
    index: options.index ?? true,
    dts: options.dts ?? true,
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
    namedSlots: options.namedSlots ?? 'props',
  }
}
```

---

# 7. Vue Wrapper Output

## 7.1 package.json

```json id="mb210g"
// addons/output-vue-wrapper/package.json
{
  "name": "@zeus-js/output-vue-wrapper",
  "version": "0.0.2",
  "description": "Zeus Vue wrapper output plugin",
  "type": "module",
  "main": "index.js",
  "module": "dist/output-vue-wrapper.esm-bundler.js",
  "types": "dist/output-vue-wrapper.d.ts",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/output-vue-wrapper.d.ts",
      "node": {
        "production": "./dist/output-vue-wrapper.cjs.prod.js",
        "development": "./dist/output-vue-wrapper.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/output-vue-wrapper.esm-bundler.js",
      "import": "./dist/output-vue-wrapper.esm-bundler.js",
      "require": "./index.js"
    },
    "./*": "./*"
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusOutputVueWrapper",
    "formats": ["esm-bundler", "cjs"]
  },
  "dependencies": {
    "@zeus-js/bundler-plugin": "workspace:*",
    "@zeus-js/component-analyzer": "workspace:*",
    "@zeus-js/component-dts": "workspace:*"
  },
  "peerDependencies": {
    "vue": ">=3"
  },
  "peerDependenciesMeta": {
    "vue": {
      "optional": true
    }
  },
  "keywords": ["zeus", "vue", "web-components"],
  "author": "Baicie",
  "license": "MIT"
}
```

---

## 7.2 Vue options

```ts id="skro5e"
// addons/output-vue-wrapper/src/types.ts

export interface OutputVueWrapperOptions {
  /**
   * Output directory.
   *
   * @default 'vue'
   */
  outDir?: string

  /**
   * Relative path from vue output files to wc output dir.
   *
   * @default '../wc'
   */
  wcOutDir?: string

  /**
   * Whether to emit index.js.
   *
   * @default true
   */
  index?: boolean

  /**
   * Whether to emit index.d.ts.
   *
   * @default true
   */
  dts?: boolean

  /**
   * Whether to emit global.d.ts.
   *
   * @default true
   */
  globalDts?: boolean

  stripPrefix?: string | false

  fileName?: (tag: string) => string
}
```

---

## 7.3 Vue naming

```ts id="xq3nhk"
// addons/output-vue-wrapper/src/naming.ts

export interface NamingOptions {
  stripPrefix?: string | false
  fileName?: (tag: string) => string
}

export function getFileBaseName(tag: string, options: NamingOptions): string {
  if (options.fileName) {
    return sanitize(options.fileName(tag)).replace(/\.js$/, '')
  }

  let name = tag

  if (options.stripPrefix && name.startsWith(options.stripPrefix)) {
    name = name.slice(options.stripPrefix.length)
  }

  return sanitize(name)
}

export function getJsFileName(tag: string, options: NamingOptions): string {
  return `${getFileBaseName(tag, options)}.js`
}

export function sanitize(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
```

---

## 7.4 Vue wrapper 生成器

```ts id="p8x1ev"
// addons/output-vue-wrapper/src/generateVueWrapper.ts

import type { ComponentRecord } from '@zeus-js/component-analyzer'

import { getJsFileName } from './naming'
import type { OutputVueWrapperOptions } from './types'

export type RequiredOutputVueWrapperOptions = Required<
  Omit<OutputVueWrapperOptions, 'fileName'>
> & {
  fileName?: (tag: string) => string
}

export interface GenerateVueWrapperOptions {
  component: ComponentRecord
  options: RequiredOutputVueWrapperOptions
}

export function generateVueWrapper(input: GenerateVueWrapperOptions): string {
  const { component, options } = input

  const wcImport = `${options.wcOutDir}/${getJsFileName(component.tag, options)}`
  const propNames = Object.keys(component.props)
  const eventNames = Object.keys(component.events)
  const slotNames = Object.keys(component.slots).filter(
    name => name !== 'default',
  )

  return `
import {
  cloneVNode,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import ${JSON.stringify(wcImport)};

const PROP_KEYS = ${JSON.stringify(propNames)};
const EVENT_NAMES = ${JSON.stringify(eventNames)};
const NAMED_SLOTS = ${JSON.stringify(slotNames)};

export const ${component.name} = defineComponent({
  name: ${JSON.stringify(component.name)},

  props: {
    ${generateVueProps(component)}
  },

  emits: EVENT_NAMES,

  setup(props, { attrs, slots, emit }) {
    const elRef = ref(null);
    const cleanups = [];

    const syncProps = () => {
      const el = elRef.value;
      if (!el) return;

      ${generateVuePropSyncLines(propNames)}
    };

    onMounted(() => {
      syncProps();

      const el = elRef.value;
      if (!el) return;

      for (const eventName of EVENT_NAMES) {
        const handler = event => emit(eventName, event);
        el.addEventListener(eventName, handler);
        cleanups.push(() => el.removeEventListener(eventName, handler));
      }
    });

    onBeforeUnmount(() => {
      for (const cleanup of cleanups) cleanup();
      cleanups.length = 0;
    });

    watch(
      () => [${propNames.map(name => `props.${name}`).join(', ')}],
      syncProps,
    );

    return () => {
      const children = [];

      if (slots.default) {
        children.push(...slots.default());
      }

      for (const name of NAMED_SLOTS) {
        const slot = slots[name];
        if (!slot) continue;

        for (const vnode of slot()) {
          children.push(withSlot(name, vnode));
        }
      }

      return h(
        ${JSON.stringify(component.tag)},
        {
          ...attrs,
          ref: elRef,
        },
        children,
      );
    };
  },
});

function withSlot(name, vnode) {
  if (!vnode) return vnode;

  if (typeof vnode === 'string') {
    return h('span', { slot: name, style: 'display: contents' }, vnode);
  }

  return cloneVNode(vnode, {
    slot: name,
  });
}
`.trimStart()
}

function generateVueProps(component: ComponentRecord): string {
  return Object.entries(component.props)
    .map(([name, prop]) => {
      return `${JSON.stringify(name)}: ${toVuePropOption(prop)}`
    })
    .join(',\n    ')
}

function toVuePropOption(prop: ComponentRecord['props'][string]): string {
  const typeMap: Record<string, string> = {
    string: 'String',
    number: 'Number',
    boolean: 'Boolean',
    object: 'Object',
    array: 'Array',
    unknown: 'null',
  }

  const type = typeMap[prop.type] ?? 'null'

  if (prop.default !== undefined) {
    return `{ type: ${type}, default: ${JSON.stringify(prop.default)} }`
  }

  return `{ type: ${type}, required: ${prop.required === true ? 'true' : 'false'} }`
}

function generateVuePropSyncLines(propNames: string[]): string {
  return propNames.map(name => `el.${name} = props.${name};`).join('\n      ')
}
```

---

## 7.5 Vue index 生成器

```ts id="16wjxa"
// addons/output-vue-wrapper/src/generateVueIndex.ts

import type { ComponentRecord } from '@zeus-js/component-analyzer'
import { getJsFileName } from './naming'
import type { OutputVueWrapperOptions } from './types'

export function generateVueIndex(
  components: ComponentRecord[],
  options: OutputVueWrapperOptions,
): string {
  const lines: string[] = []

  for (const component of components) {
    const file = getJsFileName(component.tag, options).replace(/\.js$/, '')

    lines.push(`export { ${component.name} } from './${file}.js';`)
  }

  lines.push('')

  return lines.join('\n')
}
```

---

## 7.6 Vue output plugin 主实现

```ts id="us1aun"
// addons/output-vue-wrapper/src/index.ts

import path from 'node:path'

import { generateVueDts, generateVueGlobalDts } from '@zeus-js/component-dts'

import { generateVueWrapper } from './generateVueWrapper'
import { generateVueIndex } from './generateVueIndex'
import { getJsFileName } from './naming'

import type {
  ZeusOutputFile,
  ZeusOutputPlugin,
  ZeusVirtualModule,
} from '@zeus-js/bundler-plugin'
import type { OutputVueWrapperOptions } from './types'
import type { RequiredOutputVueWrapperOptions } from './generateVueWrapper'

export type { OutputVueWrapperOptions } from './types'

export default function vueWrapper(
  options: OutputVueWrapperOptions = {},
): ZeusOutputPlugin {
  const normalized = normalizeOptions(options)

  return {
    name: 'zeus-output-vue-wrapper',

    virtualModules(ctx): ZeusVirtualModule[] {
      const modules: ZeusVirtualModule[] = []

      for (const component of ctx.manifest.components) {
        modules.push({
          id: `zeus:vue:${component.tag}`,
          fileName: path.posix.join(
            normalized.outDir,
            getJsFileName(component.tag, normalized),
          ),
          code: generateVueWrapper({
            component,
            options: normalized,
          }),
        })
      }

      if (normalized.index) {
        modules.push({
          id: 'zeus:vue:index',
          fileName: path.posix.join(normalized.outDir, 'index.js'),
          code: generateVueIndex(ctx.manifest.components, normalized),
        })
      }

      return modules
    },

    generateBundle(ctx): ZeusOutputFile[] {
      const files: ZeusOutputFile[] = []

      if (normalized.dts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'index.d.ts'),
          source: generateVueDts(ctx.manifest),
        })
      }

      if (normalized.globalDts) {
        files.push({
          type: 'asset',
          fileName: path.posix.join(normalized.outDir, 'global.d.ts'),
          source: generateVueGlobalDts(ctx.manifest),
        })
      }

      return files
    },
  }
}

function normalizeOptions(
  options: OutputVueWrapperOptions,
): RequiredOutputVueWrapperOptions {
  return {
    outDir: options.outDir ?? 'vue',
    wcOutDir: options.wcOutDir ?? '../wc',
    index: options.index ?? true,
    dts: options.dts ?? true,
    globalDts: options.globalDts ?? true,
    stripPrefix: options.stripPrefix ?? false,
    fileName: options.fileName,
  }
}
```

---

# 8. 用户组件库 package exports

当用户包输出 wc/react/vue 后，建议 package.json：

```json id="zmml18"
{
  "name": "@zeus-ui/headless",
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
      "types": "./dist/wc/*.d.ts",
      "import": "./dist/wc/*.js"
    },
    "./react": {
      "types": "./dist/react/index.d.ts",
      "import": "./dist/react/index.js"
    },
    "./vue": {
      "types": "./dist/vue/index.d.ts",
      "import": "./dist/vue/index.js"
    },
    "./vue/global": {
      "types": "./dist/vue/global.d.ts"
    },
    "./custom-elements.json": {
      "default": "./dist/custom-elements.json"
    },
    "./zeus.components.json": {
      "default": "./dist/zeus.components.json"
    }
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
  }
}
```

`sideEffects` 仍然很重要，因为 `dist/wc/*.js` 是注册 Web Component 的副作用入口。

---

# 9. 测试设计

## 9.1 React generator 测试

```ts id="stih5r"
// addons/output-react-wrapper/__tests__/generateReactWrapper.spec.ts

import { describe, expect, it } from 'vitest'
import { generateReactWrapper } from '../src/generateReactWrapper'

describe('generateReactWrapper', () => {
  it('generates React wrapper code', () => {
    const code = generateReactWrapper({
      component: {
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
        events: {
          press: {
            detail: {
              nativeEvent: 'MouseEvent',
            },
          },
        },
        slots: {
          default: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
      options: {
        outDir: 'react',
        wcOutDir: '../wc',
        index: true,
        dts: true,
        stripPrefix: false,
        namedSlots: 'props',
      },
    })

    expect(code).toContain(`import '../wc/z-button.js'`)
    expect(code).toContain('export const ZButton = forwardRef')
    expect(code).toContain('el.variant = variant')
    expect(code).toContain(`el.addEventListener("press"`)
    expect(code).toContain('React.createElement')
  })
})
```

---

## 9.2 Vue generator 测试

```ts id="a76x3x"
// addons/output-vue-wrapper/__tests__/generateVueWrapper.spec.ts

import { describe, expect, it } from 'vitest'
import { generateVueWrapper } from '../src/generateVueWrapper'

describe('generateVueWrapper', () => {
  it('generates Vue wrapper code', () => {
    const code = generateVueWrapper({
      component: {
        tag: 'z-button',
        name: 'ZButton',
        exportName: 'ZButton',
        source: 'src/button.tsx',
        props: {
          variant: {
            type: 'string',
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
        slots: {
          default: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
      options: {
        outDir: 'vue',
        wcOutDir: '../wc',
        index: true,
        dts: true,
        globalDts: true,
        stripPrefix: false,
      },
    })

    expect(code).toContain(`import '../wc/z-button.js'`)
    expect(code).toContain('export const ZButton = defineComponent')
    expect(code).toContain('el.variant = props.variant')
    expect(code).toContain('el.addEventListener(eventName, handler)')
    expect(code).toContain('return h(')
  })
})
```

---

## 9.3 React output 集成测试

```ts id="l4ctt2"
// addons/output-react-wrapper/__tests__/outputReactWrapper.spec.ts

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import zeus from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'
import react from '../src'

describe('output-react-wrapper', () => {
  it('emits React wrapper files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-output-react-'))

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })

    await fs.writeFile(path.join(root, 'src/index.ts'), 'export {}')

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
          (props, { emit }) => (
            <button onClick={event => emit('press', { nativeEvent: event })}>
              <Slot />
            </button>
          ),
        )
      `,
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['react'],
      plugins: [
        zeus({
          root,
          components: {
            include: ['src/components/**/*.{ts,tsx}'],
          },
          outputs: [
            wc({
              outDir: 'wc',
            }),
            react({
              outDir: 'react',
              wcOutDir: '../wc',
            }),
          ],
        }),
      ],
      onwarn() {},
    })

    const output = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    const files = output.output.map(item => item.fileName)

    expect(files).toContain('react/z-button.js')
    expect(files).toContain('react/index.js')
    expect(files).toContain('react/index.d.ts')
  })
})
```

---

## 9.4 Vue output 集成测试

```ts id="ieq6a1"
// addons/output-vue-wrapper/__tests__/outputVueWrapper.spec.ts

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import zeus from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'
import vue from '../src'

describe('output-vue-wrapper', () => {
  it('emits Vue wrapper files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-output-vue-'))

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })

    await fs.writeFile(path.join(root, 'src/index.ts'), 'export {}')

    await fs.writeFile(
      path.join(root, 'src/components/button.tsx'),
      `
        import { defineElement, Slot } from '@zeus-js/zeus'

        export const ZButton = defineElement(
          'z-button',
          {},
          () => <button><Slot /></button>,
        )
      `,
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['vue'],
      plugins: [
        zeus({
          root,
          components: {
            include: ['src/components/**/*.{ts,tsx}'],
          },
          outputs: [
            wc({
              outDir: 'wc',
            }),
            vue({
              outDir: 'vue',
              wcOutDir: '../wc',
            }),
          ],
        }),
      ],
      onwarn() {},
    })

    const output = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    const files = output.output.map(item => item.fileName)

    expect(files).toContain('vue/z-button.js')
    expect(files).toContain('vue/index.js')
    expect(files).toContain('vue/index.d.ts')
    expect(files).toContain('vue/global.d.ts')
  })
})
```

---

# 10. examples 设计

## 10.1 `examples/react-wrapper`

```txt id="j3hf7w"
examples/react-wrapper/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx
```

### `App.tsx`

```tsx id="p9smnm"
import { ZButton } from '@zeus-ui/headless/react'

export function App() {
  return (
    <ZButton
      variant="outline"
      onPress={event => {
        console.log(event.detail.nativeEvent)
      }}
    >
      React Button
    </ZButton>
  )
}
```

---

## 10.2 `examples/vue-wrapper`

```txt id="pqzdbb"
examples/vue-wrapper/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.ts
    App.vue
```

### `App.vue`

```vue id="kjorg5"
<script setup lang="ts">
import { ZButton } from '@zeus-ui/headless/vue'

function handlePress(event: CustomEvent<{ nativeEvent: MouseEvent }>) {
  console.log(event.detail.nativeEvent)
}
</script>

<template>
  <ZButton variant="outline" @press="handlePress"> Vue Button </ZButton>
</template>
```

---

# 11. 注意事项

## 11.1 React 18 / React 19 差异

React 19 对 Custom Element 支持更好，但为了兼容 React 18，wrapper 仍然使用：

```txt id="i15s27"
ref + property assignment + addEventListener
```

这样最稳。

---

## 11.2 named slot wrapper 可能改变 DOM

React named slot 如果传的是文本：

```tsx id="sfb6yl"
<ZCard header="Title" />
```

会被包装成：

```html id="4djwe0"
<span slot="header" style="display: contents">Title</span>
```

这通常可接受，但要在文档里说明。

---

## 11.3 wrapper 依赖 wc 输出

默认 React/Vue wrapper 会 import：

```ts id="ddyqfu"
../wc/z-button.js
```

所以构建配置里推荐总是：

```ts id="t99fsw"
outputs: [wc(), react(), vue()]
```

如果用户只想输出 React/Vue，不输出 `wc`，后续可以增加：

```ts id="uszqmw"
registration: 'source' | 'wc' | 'none'
```

Phase 6 先固定使用 `wc`，降低复杂度。

---

# 12. 文档草案

新增：

```txt id="jgbfhk"
docs/internal/design/component-compiler-host-phase6.md
```

内容：

````md id="x5pms3"
# Component Compiler Host Phase 6

## Goal

Generate React and Vue wrappers from ComponentManifest.

## Principle

React/Vue wrappers are adapters. They do not reimplement components.

## React wrapper responsibilities

- import Web Component entry
- sync props through DOM properties
- bridge CustomEvent through addEventListener
- support ref
- support children/default slot
- support named slot props

## Vue wrapper responsibilities

- import Web Component entry
- sync props through DOM properties
- bridge CustomEvent to emits
- support attrs
- support default and named slots
- emit Vue d.ts and global component declarations

## Required outputs

```txt
dist/react/
  z-button.js
  index.js
  index.d.ts

dist/vue/
  z-button.js
  index.js
  index.d.ts
  global.d.ts
```
````

## Non-goals

- no shadcn-like registry
- no full UI components
- no SSR-specific adapter

````

---

# 13. 验收清单

```txt id="a9s3tb"
[ ] 新增 addons/output-react-wrapper
[ ] 新增 addons/output-vue-wrapper
[ ] React wrapper 能 import 对应 wc entry
[ ] Vue wrapper 能 import 对应 wc entry
[ ] React props 通过 property sync
[ ] Vue props 通过 property sync
[ ] React CustomEvent 通过 onXxx 回调
[ ] Vue CustomEvent 通过 emits
[ ] React 支持 default children
[ ] React 支持 named slot props
[ ] Vue 支持 default slot
[ ] Vue 支持 named slots
[ ] React 生成 index.js
[ ] Vue 生成 index.js
[ ] React 生成 index.d.ts
[ ] Vue 生成 index.d.ts
[ ] Vue 生成 global.d.ts
[ ] Rollup 集成测试通过
[ ] examples/react-wrapper 可运行
[ ] examples/vue-wrapper 可运行
[ ] pnpm build 通过
[ ] pnpm build-dts 通过
[ ] pnpm check 通过
[ ] pnpm test-unit 通过
````

---

# 14. 推荐提交顺序

```bash id="gx7poz"
# 1. React wrapper 包骨架
git add addons/output-react-wrapper/package.json addons/output-react-wrapper/src/types.ts addons/output-react-wrapper/src/naming.ts
git commit -m "feat(output-react-wrapper): add package scaffold"

# 2. React wrapper 生成器
git add addons/output-react-wrapper/src/generateReactWrapper.ts addons/output-react-wrapper/src/generateReactIndex.ts addons/output-react-wrapper/src/index.ts
git commit -m "feat(output-react-wrapper): generate React adapters"

# 3. Vue wrapper 包骨架
git add addons/output-vue-wrapper/package.json addons/output-vue-wrapper/src/types.ts addons/output-vue-wrapper/src/naming.ts
git commit -m "feat(output-vue-wrapper): add package scaffold"

# 4. Vue wrapper 生成器
git add addons/output-vue-wrapper/src/generateVueWrapper.ts addons/output-vue-wrapper/src/generateVueIndex.ts addons/output-vue-wrapper/src/index.ts
git commit -m "feat(output-vue-wrapper): generate Vue adapters"

# 5. 测试
git add addons/output-react-wrapper/__tests__ addons/output-vue-wrapper/__tests__
git commit -m "test(output-wrapper): cover React and Vue outputs"

# 6. 示例
git add examples/react-wrapper examples/vue-wrapper
git commit -m "example: add React and Vue wrapper examples"

# 7. 文档
git add docs/internal/design/component-compiler-host-phase6.md
git commit -m "docs: add wrapper output phase6 design"
```

---

# 15. Phase 6 完成后的整体链路

完成后完整链路就是：

```txt id="md3o3h"
defineElement 组件源码
  ↓
component-analyzer
  ↓
ComponentManifest
  ↓
bundler-plugin outputs
  ↓
output-wc
  ↓
dist/wc/*.js

ComponentManifest
  ↓
output-react-wrapper
  ↓
dist/react/*.js + index.d.ts

ComponentManifest
  ↓
output-vue-wrapper
  ↓
dist/vue/*.js + index.d.ts + global.d.ts
```

用户最终可以三种方式消费同一份组件：

```ts id="y41jab"
import '@zeus-ui/headless/wc/z-button'
```

```tsx id="l3o45t"
import { ZButton } from '@zeus-ui/headless/react'
```

```vue id="z2k0ow"
import { ZButton } from '@zeus-ui/headless/vue'
```

这就完成了 Zeus 跨框架 Web Component 编译链路的核心闭环。
