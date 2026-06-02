# Phase 7：Headless Components MVP 详细设计与代码草案

Phase 7 的目标是新增一个官方验证组件包：

```txt
packages/headless
```

它不是完整 UI 组件库，而是 **Zeus Headless Web Component primitives**：

```txt
负责状态、交互、事件、键盘行为、a11y、slot 结构
不绑定具体视觉风格
通过 data-* / aria-* / part / CSS vars 暴露样式钩子
```

当前 Zeus 已经具备这个阶段需要的底座：`runtime-dom` 已经导出 `defineElement / Host / Slot`，`defineElement` 已经负责 Web Component 注册、props、attribute/property 同步、shadow/light 渲染、CustomEvent 和生命周期；`Slot` 也已经支持 shadow/light 两种分发模式。

---

# 1. Phase 7 目标

## 做什么

```txt
1. 新增 packages/headless
2. 提供第一批 headless Web Components
3. 默认 shadow: false，方便外部样式控制
4. 所有组件通过 Host 暴露 data-state / data-disabled / data-slot
5. 所有交互组件通过 CustomEvent 对外通知状态变化
6. 使用 output-wc / output-react-wrapper / output-vue-wrapper 生成多端入口
7. 提供基础主题 CSS，但不强绑定样式
8. 提供 examples/headless
9. 提供组件级测试
10. 提供 a11y / keyboard 行为测试
```

## 不做什么

```txt
1. 不做 shadcn-like registry
2. 不做复杂设计系统
3. 不做完整 Select / Combobox / DatePicker
4. 不做 SSR 专项适配
5. 不做动画系统
6. 不做虚拟滚动 / Table 等重型组件
```

shadcn-like 可复制源码模板放 Phase 10。

---

# 2. 首批组件范围

建议首批做 6 个：

```txt
z-button
z-icon
z-switch
z-checkbox
z-tabs
z-dialog
```

实现顺序：

```txt
Button -> Icon -> Switch -> Checkbox -> Tabs -> Dialog
```

原因：

```txt
Button：验证 props / events / default slot / Host data-state
Icon：验证静态组件 / no-runtime 优化前的基础形态
Switch：验证 checked 状态、form-like 交互
Checkbox：验证 indeterminate、aria-checked
Tabs：验证多子项状态联动、keyboard navigation
Dialog：验证 open 状态、Escape 关闭、focus 基础能力
```

---

# 3. 包结构

```txt
packages/headless/
  package.json
  vite.config.ts
  src/
    index.ts
    styles.css

    shared/
      events.ts
      ids.ts
      keyboard.ts
      props.ts
      types.ts

    button/
      button.tsx
      index.ts

    icon/
      icon.tsx
      icons.tsx
      index.ts

    switch/
      switch.tsx
      index.ts

    checkbox/
      checkbox.tsx
      index.ts

    tabs/
      tabs.tsx
      tab-list.tsx
      tab-trigger.tsx
      tab-panel.tsx
      context.ts
      index.ts

    dialog/
      dialog.tsx
      dialog-trigger.tsx
      dialog-content.tsx
      dialog-title.tsx
      dialog-description.tsx
      context.ts
      index.ts
```

输出后：

```txt
dist/
  wc/
  react/
  vue/
  zeus.components.json
  custom-elements.json
```

---

# 4. package.json 草案

```json
{
  "name": "@zeus-ui/headless",
  "version": "0.0.1",
  "description": "Headless Web Component primitives powered by Zeus",
  "type": "module",
  "files": ["dist"],
  "sideEffects": ["dist/wc/*.js", "dist/wc/**/*.js", "dist/**/*.css"],
  "exports": {
    ".": {
      "types": "./dist/wc/index.d.ts",
      "import": "./dist/wc/index.js"
    },
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
    "./styles.css": {
      "default": "./dist/styles.css"
    },
    "./custom-elements.json": {
      "default": "./dist/custom-elements.json"
    },
    "./zeus.components.json": {
      "default": "./dist/zeus.components.json"
    }
  },
  "dependencies": {
    "@zeus-js/zeus": "workspace:*"
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

`sideEffects` 必须保留，因为 `dist/wc/*.js` 导入后会触发 Web Component 注册。

---

# 5. 构建配置草案

```ts
// packages/headless/vite.config.ts

import { defineConfig } from 'vite'
import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: false,
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
      external: ['react', 'vue'],
    },
  },

  plugins: [
    zeus({
      components: {
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/shared/**'],
      },

      outputs: [
        wc({
          outDir: 'wc',
          manifestFile: 'zeus.components.json',
          customElementsFile: 'custom-elements.json',
          dts: true,
          jsxDts: true,
        }),

        react({
          outDir: 'react',
          wcOutDir: '../wc',
          dts: true,
          namedSlots: 'props',
        }),

        vue({
          outDir: 'vue',
          wcOutDir: '../wc',
          dts: true,
          globalDts: true,
        }),
      ],
    }),
  ],
})
```

---

# 6. Headless 组件规范

所有组件统一遵循：

```txt
1. 默认 shadow: false
2. 宿主元素通过 Host 暴露状态
3. 内部结构使用 part 标记关键节点
4. 事件统一使用 kebab-case
5. 状态变化事件命名：xxx-change
6. props 复杂对象默认 attr: false
7. disabled 状态阻断交互
8. class/style 交给外部封装层
```

事件命名建议：

```txt
z-button    -> press
z-switch    -> checked-change
z-checkbox  -> checked-change
z-tabs      -> value-change
z-dialog    -> open-change
```

React wrapper 会映射成：

```txt
onPress
onCheckedChange
onValueChange
onOpenChange
```

---

# 7. shared 工具

## `shared/events.ts`

```ts
// packages/headless/src/shared/events.ts

export interface ChangeDetail<T> {
  value: T
}

export interface CheckedChangeDetail {
  checked: boolean | 'indeterminate'
}

export interface OpenChangeDetail {
  open: boolean
}

export function isDisabled(value: unknown): boolean {
  return value === true || value === ''
}
```

---

## `shared/keyboard.ts`

```ts
// packages/headless/src/shared/keyboard.ts

export function isEnterOrSpace(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' '
}

export function isArrowKey(event: KeyboardEvent): boolean {
  return (
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown'
  )
}
```

---

## `shared/ids.ts`

```ts
// packages/headless/src/shared/ids.ts

let uid = 0

export function createId(prefix = 'z'): string {
  uid += 1
  return `${prefix}-${uid}`
}
```

---

# 8. z-button

## 设计

```txt
tag: z-button
props:
  variant?: string
  size?: string
  disabled?: boolean
event:
  press
slots:
  default
host attributes:
  data-slot="button"
  data-variant
  data-size
  data-disabled
parts:
  root
```

## 代码草案

```tsx
// packages/headless/src/button/button.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface ButtonProps {
  variant?: 'default' | 'outline' | 'ghost'
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
      description: 'Headless button primitive.',
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
      cssParts: ['root'],
    },
  },

  (props, { emit }) => {
    const handleClick = (event: MouseEvent) => {
      if (props.disabled) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      emit('press', {
        nativeEvent: event,
      })
    }

    return (
      <Host
        data-slot="button"
        data-variant={props.variant}
        data-size={props.size}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button
          part="root"
          type="button"
          disabled={props.disabled}
          aria-disabled={props.disabled ? 'true' : undefined}
          onClick={handleClick}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
```

```ts
// packages/headless/src/button/index.ts

export { ZButton }
export type { ButtonProps } from './button'
```

---

# 9. z-icon

## 设计

MVP 先提供少量内置 icon，后续 Phase 9 再做 no-runtime icon 输出。

```txt
tag: z-icon
props:
  name?: string
  size?: string | number
  label?: string
slots:
  none
parts:
  root
```

## 代码草案

```tsx
// packages/headless/src/icon/icons.tsx

export const icons = {
  check: {
    viewBox: '0 0 24 24',
    render: () => (
      <path
        d="M20 6 9 17l-5-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    ),
  },

  x: {
    viewBox: '0 0 24 24',
    render: () => (
      <>
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
      </>
    ),
  },
} as const

export type IconName = keyof typeof icons
```

```tsx
// packages/headless/src/icon/icon.tsx

import { defineElement, Host } from '@zeus-js/zeus'
import { icons, type IconName } from './icons'

export interface IconProps {
  name?: IconName
  size?: string
  label?: string
}

export const ZIcon = defineElement<IconProps>(
  'z-icon',
  {
    shadow: false,

    props: {
      name: {
        type: String,
        default: 'check',
        reflect: true,
      },
      size: {
        type: String,
        default: '1em',
        reflect: true,
      },
      label: {
        type: String,
        attr: 'aria-label',
      },
    },

    meta: {
      description: 'Headless icon primitive.',
      cssParts: ['root'],
    },
  },

  props => {
    const icon = icons[props.name as IconName] ?? icons.check
    const hidden = props.label ? undefined : 'true'

    return (
      <Host data-slot="icon" data-name={props.name}>
        <svg
          part="root"
          width={props.size}
          height={props.size}
          viewBox={icon.viewBox}
          aria-hidden={hidden}
          aria-label={props.label}
          focusable="false"
        >
          {icon.render()}
        </svg>
      </Host>
    )
  },
)
```

```ts
// packages/headless/src/icon/index.ts

export { ZIcon }
export type { IconProps } from './icon'
export type { IconName } from './icons'
```

---

# 10. z-switch

## 设计

```txt
tag: z-switch
props:
  checked?: boolean
  disabled?: boolean
event:
  checked-change
parts:
  root, thumb
a11y:
  role="switch"
  aria-checked
```

## 代码草案

```tsx
// packages/headless/src/switch/switch.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'
import { isEnterOrSpace } from '../shared/keyboard'

export interface SwitchProps {
  checked?: boolean
  disabled?: boolean
}

export const ZSwitch = defineElement<SwitchProps>(
  'z-switch',
  {
    shadow: false,

    props: {
      checked: {
        type: Boolean,
        default: false,
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless switch primitive.',
      events: {
        'checked-change': {
          detail: {
            checked: 'boolean',
          },
        },
      },
      slots: {
        default: {
          description: 'Optional switch label.',
        },
      },
      cssParts: ['root', 'thumb'],
    },
  },

  (props, { emit, host }) => {
    const toggle = () => {
      if (props.disabled) return

      const next = !props.checked

      host.checked = next

      emit('checked-change', {
        checked: next,
      })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEnterOrSpace(event)) return

      event.preventDefault()
      toggle()
    }

    return (
      <Host
        data-slot="switch"
        data-state={props.checked ? 'checked' : 'unchecked'}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button
          part="root"
          type="button"
          role="switch"
          aria-checked={props.checked ? 'true' : 'false'}
          aria-disabled={props.disabled ? 'true' : undefined}
          disabled={props.disabled}
          onClick={toggle}
          onKeyDown={onKeyDown}
        >
          <span part="thumb" data-slot="switch-thumb" />
          <Slot />
        </button>
      </Host>
    )
  },
)
```

```ts
// packages/headless/src/switch/index.ts

export { ZSwitch }
export type { SwitchProps } from './switch'
```

---

# 11. z-checkbox

## 设计

```txt
tag: z-checkbox
props:
  checked?: boolean
  indeterminate?: boolean
  disabled?: boolean
event:
  checked-change
states:
  checked | unchecked | indeterminate
```

## 代码草案

```tsx
// packages/headless/src/checkbox/checkbox.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'
import { isEnterOrSpace } from '../shared/keyboard'

export interface CheckboxProps {
  checked?: boolean
  indeterminate?: boolean
  disabled?: boolean
}

export const ZCheckbox = defineElement<CheckboxProps>(
  'z-checkbox',
  {
    shadow: false,

    props: {
      checked: {
        type: Boolean,
        default: false,
        reflect: true,
      },
      indeterminate: {
        type: Boolean,
        default: false,
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless checkbox primitive.',
      events: {
        'checked-change': {
          detail: {
            checked: 'boolean',
          },
        },
      },
      slots: {
        default: {
          description: 'Checkbox label.',
        },
      },
      cssParts: ['root', 'indicator'],
    },
  },

  (props, { emit, host }) => {
    const state = props.indeterminate
      ? 'indeterminate'
      : props.checked
        ? 'checked'
        : 'unchecked'

    const toggle = () => {
      if (props.disabled) return

      const next = props.indeterminate ? true : !props.checked

      host.indeterminate = false
      host.checked = next

      emit('checked-change', {
        checked: next,
      })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEnterOrSpace(event)) return

      event.preventDefault()
      toggle()
    }

    return (
      <Host
        data-slot="checkbox"
        data-state={state}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button
          part="root"
          type="button"
          role="checkbox"
          aria-checked={
            props.indeterminate ? 'mixed' : props.checked ? 'true' : 'false'
          }
          aria-disabled={props.disabled ? 'true' : undefined}
          disabled={props.disabled}
          onClick={toggle}
          onKeyDown={onKeyDown}
        >
          <span part="indicator" data-slot="checkbox-indicator">
            <Slot name="indicator" />
          </span>
          <Slot />
        </button>
      </Host>
    )
  },
)
```

```ts
// packages/headless/src/checkbox/index.ts

export { ZCheckbox }
export type { CheckboxProps } from './checkbox'
```

---

# 12. Tabs 组件组

Tabs 是 Phase 7 里最能验证“多 Web Component 协作”的组件。

## API

```html
<z-tabs value="account">
  <z-tab-list>
    <z-tab-trigger value="account">Account</z-tab-trigger>
    <z-tab-trigger value="password">Password</z-tab-trigger>
  </z-tab-list>

  <z-tab-panel value="account">Account content</z-tab-panel>
  <z-tab-panel value="password">Password content</z-tab-panel>
</z-tabs>
```

事件：

```txt
value-change -> { value: string }
```

## `tabs/context.ts`

MVP 可以先不使用复杂 context，直接通过 DOM 最近祖先查找，简单稳定。

```ts
// packages/headless/src/tabs/context.ts

export interface TabsHost extends HTMLElement {
  value?: string
  orientation?: 'horizontal' | 'vertical'
}

export function findTabsHost(el: HTMLElement): TabsHost | null {
  return el.closest('z-tabs') as TabsHost | null
}

export function getTabsValue(el: HTMLElement): string | undefined {
  return findTabsHost(el)?.value
}

export function setTabsValue(el: HTMLElement, value: string): void {
  const tabs = findTabsHost(el)

  if (!tabs) return

  tabs.value = value

  tabs.dispatchEvent(
    new CustomEvent('value-change', {
      detail: { value },
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  )
}
```

## `tabs.tsx`

```tsx
// packages/headless/src/tabs/tabs.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface TabsProps {
  value?: string
  orientation?: 'horizontal' | 'vertical'
}

export const ZTabs = defineElement<TabsProps>(
  'z-tabs',
  {
    shadow: false,

    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
      orientation: {
        type: String,
        default: 'horizontal',
        reflect: true,
      },
    },

    meta: {
      description: 'Headless tabs root.',
      events: {
        'value-change': {
          detail: {
            value: 'string',
          },
        },
      },
      slots: {
        default: {},
      },
    },
  },

  props => {
    return (
      <Host data-slot="tabs" data-orientation={props.orientation}>
        <Slot />
      </Host>
    )
  },
)
```

## `tab-list.tsx`

```tsx
// packages/headless/src/tabs/tab-list.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'
import { findTabsHost } from './context'

export const ZTabList = defineElement(
  'z-tab-list',
  {
    shadow: false,

    meta: {
      description: 'Headless tabs list.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },

  (_props, { host }) => {
    const tabs = findTabsHost(host)

    return (
      <Host data-slot="tab-list">
        <div
          part="root"
          role="tablist"
          aria-orientation={tabs?.orientation ?? 'horizontal'}
        >
          <Slot />
        </div>
      </Host>
    )
  },
)
```

## `tab-trigger.tsx`

```tsx
// packages/headless/src/tabs/tab-trigger.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'
import { findTabsHost, setTabsValue } from './context'
import { isEnterOrSpace } from '../shared/keyboard'

export interface TabTriggerProps {
  value?: string
  disabled?: boolean
}

export const ZTabTrigger = defineElement<TabTriggerProps>(
  'z-tab-trigger',
  {
    shadow: false,

    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless tab trigger.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },

  (props, { host }) => {
    const tabs = findTabsHost(host)
    const selected = tabs?.value === props.value

    const select = () => {
      if (props.disabled || !props.value) return
      setTabsValue(host, props.value)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEnterOrSpace(event)) return

      event.preventDefault()
      select()
    }

    return (
      <Host
        data-slot="tab-trigger"
        data-state={selected ? 'active' : 'inactive'}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button
          part="root"
          type="button"
          role="tab"
          aria-selected={selected ? 'true' : 'false'}
          aria-disabled={props.disabled ? 'true' : undefined}
          disabled={props.disabled}
          tabIndex={selected ? 0 : -1}
          onClick={select}
          onKeyDown={onKeyDown}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
```

## `tab-panel.tsx`

```tsx
// packages/headless/src/tabs/tab-panel.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'
import { findTabsHost } from './context'

export interface TabPanelProps {
  value?: string
}

export const ZTabPanel = defineElement<TabPanelProps>(
  'z-tab-panel',
  {
    shadow: false,

    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
    },

    meta: {
      description: 'Headless tab panel.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },

  (props, { host }) => {
    const tabs = findTabsHost(host)
    const active = tabs?.value === props.value

    return (
      <Host data-slot="tab-panel" data-state={active ? 'active' : 'inactive'}>
        <div part="root" role="tabpanel" hidden={!active}>
          <Slot />
        </div>
      </Host>
    )
  },
)
```

## `tabs/index.ts`

```ts
export { ZTabs } from './tabs'
export { ZTabList } from './tab-list'
export { ZTabTrigger } from './tab-trigger'
export { ZTabPanel } from './tab-panel'

export type { TabsProps } from './tabs'
export type { TabTriggerProps } from './tab-trigger'
export type { TabPanelProps } from './tab-panel'
```

> 注意：这个 Tabs MVP 只做基础可用。后续可以增强 roving tabindex、ArrowLeft/ArrowRight 切换、id/aria-controls 关联。

---

# 13. Dialog 组件组

Dialog 是复杂组件，Phase 7 做 MVP 版：

```txt
z-dialog
z-dialog-trigger
z-dialog-content
z-dialog-title
z-dialog-description
```

## API

```html
<z-dialog>
  <z-dialog-trigger>Open</z-dialog-trigger>

  <z-dialog-content>
    <z-dialog-title>Title</z-dialog-title>
    <z-dialog-description>Description</z-dialog-description>
    Content
  </z-dialog-content>
</z-dialog>
```

## `dialog/context.ts`

```ts
// packages/headless/src/dialog/context.ts

export interface DialogHost extends HTMLElement {
  open?: boolean
}

export function findDialogHost(el: HTMLElement): DialogHost | null {
  return el.closest('z-dialog') as DialogHost | null
}

export function setDialogOpen(el: HTMLElement, open: boolean): void {
  const dialog = findDialogHost(el)

  if (!dialog) return

  dialog.open = open

  dialog.dispatchEvent(
    new CustomEvent('open-change', {
      detail: { open },
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  )
}
```

## `dialog.tsx`

```tsx
// packages/headless/src/dialog/dialog.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface DialogProps {
  open?: boolean
}

export const ZDialog = defineElement<DialogProps>(
  'z-dialog',
  {
    shadow: false,

    props: {
      open: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },

    meta: {
      description: 'Headless dialog root.',
      events: {
        'open-change': {
          detail: {
            open: 'boolean',
          },
        },
      },
      slots: {
        default: {},
      },
    },
  },

  props => {
    return (
      <Host data-slot="dialog" data-state={props.open ? 'open' : 'closed'}>
        <Slot />
      </Host>
    )
  },
)
```

## `dialog-trigger.tsx`

```tsx
// packages/headless/src/dialog/dialog-trigger.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'
import { setDialogOpen } from './context'

export const ZDialogTrigger = defineElement(
  'z-dialog-trigger',
  {
    shadow: false,

    meta: {
      description: 'Headless dialog trigger.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },

  (_props, { host }) => {
    return (
      <Host data-slot="dialog-trigger">
        <button
          part="root"
          type="button"
          aria-haspopup="dialog"
          onClick={() => setDialogOpen(host, true)}
        >
          <Slot />
        </button>
      </Host>
    )
  },
)
```

## `dialog-content.tsx`

```tsx
// packages/headless/src/dialog/dialog-content.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'
import { findDialogHost, setDialogOpen } from './context'

export const ZDialogContent = defineElement(
  'z-dialog-content',
  {
    shadow: false,

    meta: {
      description: 'Headless dialog content.',
      slots: {
        default: {},
      },
      cssParts: ['root', 'overlay', 'panel'],
    },
  },

  (_props, { host }) => {
    const dialog = findDialogHost(host)
    const open = Boolean(dialog?.open)

    const close = () => {
      setDialogOpen(host, false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      close()
    }

    return (
      <Host data-slot="dialog-content" data-state={open ? 'open' : 'closed'}>
        <div part="root" hidden={!open} onKeyDown={onKeyDown}>
          <div part="overlay" data-slot="dialog-overlay" onClick={close} />

          <div
            part="panel"
            data-slot="dialog-panel"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            <Slot />
          </div>
        </div>
      </Host>
    )
  },
)
```

## `dialog-title.tsx`

```tsx
// packages/headless/src/dialog/dialog-title.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export const ZDialogTitle = defineElement(
  'z-dialog-title',
  {
    shadow: false,

    meta: {
      description: 'Headless dialog title.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },

  () => {
    return (
      <Host data-slot="dialog-title">
        <h2 part="root">
          <Slot />
        </h2>
      </Host>
    )
  },
)
```

## `dialog-description.tsx`

```tsx
// packages/headless/src/dialog/dialog-description.tsx

import { defineElement, Host, Slot } from '@zeus-js/zeus'

export const ZDialogDescription = defineElement(
  'z-dialog-description',
  {
    shadow: false,

    meta: {
      description: 'Headless dialog description.',
      slots: {
        default: {},
      },
      cssParts: ['root'],
    },
  },

  () => {
    return (
      <Host data-slot="dialog-description">
        <p part="root">
          <Slot />
        </p>
      </Host>
    )
  },
)
```

## `dialog/index.ts`

```ts
export { ZDialog } from './dialog'
export { ZDialogTrigger } from './dialog-trigger'
export { ZDialogContent } from './dialog-content'
export { ZDialogTitle } from './dialog-title'
export { ZDialogDescription } from './dialog-description'

export type { DialogProps } from './dialog'
```

> Dialog MVP 暂时不做 focus trap。后续 Phase 7.1 再补 focus trap、aria-labelledby、aria-describedby 自动关联。

---

# 14. 全量入口

```ts
// packages/headless/src/index.ts

export * from './button'
export * from './icon'
export * from './switch'
export * from './checkbox'
export * from './tabs'
export * from './dialog'
```

---

# 15. 基础样式

Headless 包可以提供一份极轻基础 CSS，用户可选导入：

```css
/* packages/headless/src/styles.css */

z-button,
z-switch,
z-checkbox,
z-tabs,
z-tab-list,
z-tab-trigger,
z-tab-panel,
z-dialog,
z-dialog-trigger,
z-dialog-content,
z-dialog-title,
z-dialog-description,
z-icon {
  box-sizing: border-box;
}

z-button[data-disabled],
z-switch[data-disabled],
z-checkbox[data-disabled],
z-tab-trigger[data-disabled] {
  cursor: not-allowed;
}

z-dialog-content [part='root'][hidden],
z-tab-panel [part='root'][hidden] {
  display: none;
}
```

不要写复杂视觉样式。shadcn-like 样式层后面通过 registry 复制到用户项目里。

---

# 16. examples/headless

```txt
examples/headless/
  package.json
  index.html
  vite.config.ts
  src/
    main.tsx
```

## `main.tsx`

```tsx
import '@zeus-ui/headless/wc'
import '@zeus-ui/headless/styles.css'

document
  .querySelector('z-switch')
  ?.addEventListener('checked-change', event => {
    console.log((event as CustomEvent<{ checked: boolean }>).detail.checked)
  })

document.querySelector('z-dialog')?.addEventListener('open-change', event => {
  console.log((event as CustomEvent<{ open: boolean }>).detail.open)
})
```

## `index.html`

```html
<!doctype html>
<html>
  <body>
    <z-button variant="outline">Button</z-button>

    <z-switch>Enable notifications</z-switch>

    <z-checkbox>Accept terms</z-checkbox>

    <z-tabs value="account">
      <z-tab-list>
        <z-tab-trigger value="account">Account</z-tab-trigger>
        <z-tab-trigger value="password">Password</z-tab-trigger>
      </z-tab-list>

      <z-tab-panel value="account">Account panel</z-tab-panel>
      <z-tab-panel value="password">Password panel</z-tab-panel>
    </z-tabs>

    <z-dialog>
      <z-dialog-trigger>Open dialog</z-dialog-trigger>

      <z-dialog-content>
        <z-dialog-title>Dialog title</z-dialog-title>
        <z-dialog-description>Dialog description</z-dialog-description>
        Dialog content
      </z-dialog-content>
    </z-dialog>

    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

# 17. 测试设计

## 组件测试重点

```txt
Button:
  press event
  disabled blocks press
  data-variant/data-size/data-disabled

Switch:
  checked-change
  checked property update
  aria-checked

Checkbox:
  checked-change
  indeterminate -> checked
  aria-checked=mixed

Tabs:
  trigger click updates root value
  panel hidden state changes
  value-change event

Dialog:
  trigger opens
  overlay closes
  Escape closes
  open-change event
```

## 示例：`switch.spec.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest'
import '../../src/switch/switch'

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('z-switch', () => {
  it('toggles checked state and emits checked-change', async () => {
    document.body.innerHTML = '<z-switch></z-switch>'

    const el = document.querySelector('z-switch') as HTMLElement & {
      checked?: boolean
    }

    const listener = vi.fn()
    el.addEventListener('checked-change', listener)

    await nextFrame()

    const button = el.querySelector('button')!
    button.click()

    await nextFrame()

    expect(el.checked).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail).toEqual({
      checked: true,
    })
  })
})
```

---

# 18. 已知风险

## 1. Tabs/Dialog 跨组件状态同步

MVP 使用 `closest('z-tabs')` / `closest('z-dialog')`，简单可行，但不是最终最佳设计。

后续可升级为：

```txt
context API
MutationObserver
custom events
roving focus manager
```

## 2. Dialog 缺 focus trap

Phase 7 MVP 只做基础 open/close。完整 dialog 后续需要：

```txt
focus trap
restore focus
aria-labelledby
aria-describedby
body scroll lock
inert outside
portal/layer
```

## 3. React/Vue wrapper 与命名 slot

Phase 6 已支持基本 named slot，但复杂场景仍需 examples 验证。

## 4. 默认 shadow: false

这对 shadcn-like 更友好，但也意味着样式可能受外部影响。Headless 层应该接受这个取舍。

---

# 19. 文档草案

新增：

```txt
docs/internal/design/component-compiler-host-phase7.md
```

内容大纲：

```md
# Component Compiler Host Phase 7

## Goal

Introduce `@zeus-ui/headless`, a small set of headless Web Component primitives powered by Zeus.

## Principles

- Web Components are the source of truth.
- React/Vue wrappers are generated adapters.
- Components are headless by default.
- `shadow: false` by default.
- Use `data-*`, `aria-*`, `part` for styling hooks.
- Use CustomEvent for state change notifications.

## Components

- z-button
- z-icon
- z-switch
- z-checkbox
- z-tabs
- z-dialog

## Non-goals

- no shadcn-like registry
- no full visual design system
- no advanced complex components
```

---

# 20. 验收清单

```txt
[ ] 新增 packages/headless
[ ] z-button 可用
[ ] z-icon 可用
[ ] z-switch 可用
[ ] z-checkbox 可用
[ ] z-tabs / z-tab-list / z-tab-trigger / z-tab-panel 可用
[ ] z-dialog / trigger / content / title / description 可用
[ ] 每个组件都有 data-slot / data-state / data-disabled
[ ] 每个交互组件都有 CustomEvent
[ ] output-wc 能输出 wc 产物
[ ] output-react-wrapper 能输出 react 产物
[ ] output-vue-wrapper 能输出 vue 产物
[ ] custom-elements.json 包含组件信息
[ ] zeus.components.json 包含组件信息
[ ] d.ts 类型正确
[ ] examples/headless 可运行
[ ] 基础测试覆盖交互
[ ] pnpm build 通过
[ ] pnpm build-dts 通过
[ ] pnpm check 通过
[ ] pnpm test-unit 通过
```

---

# 21. 推荐提交顺序

```bash
# 1. headless 包骨架
git add packages/headless/package.json packages/headless/vite.config.ts packages/headless/src/index.ts
git commit -m "feat(headless): add package scaffold"

# 2. shared utils
git add packages/headless/src/shared
git commit -m "feat(headless): add shared primitive utilities"

# 3. button/icon
git add packages/headless/src/button packages/headless/src/icon
git commit -m "feat(headless): add button and icon primitives"

# 4. switch/checkbox
git add packages/headless/src/switch packages/headless/src/checkbox
git commit -m "feat(headless): add switch and checkbox primitives"

# 5. tabs
git add packages/headless/src/tabs
git commit -m "feat(headless): add tabs primitives"

# 6. dialog
git add packages/headless/src/dialog
git commit -m "feat(headless): add dialog primitives"

# 7. styles/examples/tests/docs
git add packages/headless/src/styles.css examples/headless docs/internal/design/component-compiler-host-phase7.md
git commit -m "docs: add headless components phase7 design"
```

---

# 22. Phase 7 完成后的效果

原生 Web Component：

```ts
import '@zeus-ui/headless/wc/z-button'
```

```html
<z-button variant="outline">Button</z-button>
```

React：

```tsx
import { ZButton, ZSwitch } from '@zeus-ui/headless/react'

<ZButton onPress={event => console.log(event.detail.nativeEvent)}>
  Button
</ZButton>

<ZSwitch onCheckedChange={event => console.log(event.detail.checked)} />
```

Vue：

```vue
<script setup lang="ts">
import { ZButton, ZSwitch } from '@zeus-ui/headless/vue'
</script>

<template>
  <ZButton @press="handlePress"> Button </ZButton>

  <ZSwitch @checked-change="handleCheckedChange" />
</template>
```

这时 Zeus 的跨框架链路已经真正闭环：

```txt
defineElement source
  ↓
component-analyzer
  ↓
ComponentManifest
  ↓
output-wc
  ↓
Web Component

ComponentManifest
  ↓
output-react-wrapper / output-vue-wrapper
  ↓
React / Vue adapters

packages/headless
  ↓
官方验证组件库
```

Phase 8 就可以开始做性能与体积基准，验证：

```txt
单组件 runtime 成本
多个组件 tree-shaking
React/Vue wrapper 额外开销
Web Component mount/update/event 性能
```
