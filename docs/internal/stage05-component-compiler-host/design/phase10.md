# Phase 10：shadcn-like Registry / CLI / 可定制 UI 层

Phase 10 的目标是把前面做好的：

```txt
@zeus-ui/headless
  ├─ wc
  ├─ react
  ├─ vue
  └─ icons no-runtime
```

封装成一套类似 shadcn/ui 的使用体验：

```bash
pnpm dlx zeus-ui init
pnpm dlx zeus-ui add button
pnpm dlx zeus-ui add dialog
pnpm dlx zeus-ui add tabs
```

用户项目中最终生成的是源码：

```txt
src/
  components/
    ui/
      button.tsx
      dialog.tsx
      tabs.tsx
  lib/
    utils.ts
  styles/
    zeus-theme.css
```

用户可以自由修改样式、组件结构和主题变量。

---

# 1. Phase 10 定位

Phase 10 不是再做一套组件逻辑。

它只做：

```txt
Headless Web Component 行为层
  ↓
React / Vue wrapper 类型安全适配层
  ↓
Registry 可复制源码模板
  ↓
用户项目内可改 UI 组件
```

也就是：

```txt
@zeus-ui/headless/react
  提供行为、状态、事件、a11y

registry button.tsx
  提供 className、variants、theme、项目风格
```

---

# 2. 目录结构建议

新增两个包：

```txt
packages/registry/
  package.json
  src/
    index.ts
    schema.ts
    registry.ts
    react/
      button.ts
      switch.ts
      checkbox.ts
      tabs.ts
      dialog.ts
      icon.ts
    vue/
      button.ts
      switch.ts
      checkbox.ts
      tabs.ts
      dialog.ts
      icon.ts
    shared/
      utils.ts
      theme.ts
      cn.ts

create/zeus-ui/
  package.json
  src/
    index.ts
    commands/
      init.ts
      add.ts
      list.ts
    core/
      config.ts
      detect.ts
      fs.ts
      package-manager.ts
      registry.ts
      template.ts
```

也可以命名为：

```txt
packages/registry
create/zeus-ui
```

`packages/registry` 负责提供 registry 数据。
`create/zeus-ui` 负责 CLI，把 registry 内容写入用户项目。

---

# 3. 用户最终体验

## 初始化

```bash
pnpm dlx zeus-ui init
```

生成：

```txt
components.json
src/lib/utils.ts
src/styles/zeus-theme.css
```

`components.json`：

```json
{
  "style": "default",
  "framework": "react",
  "typescript": true,
  "tailwind": true,
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "styles": "@/styles"
  }
}
```

---

## 添加组件

```bash
pnpm dlx zeus-ui add button
```

生成：

```txt
src/components/ui/button.tsx
```

同时安装依赖：

```bash
pnpm add @zeus-ui/headless class-variance-authority clsx tailwind-merge
```

---

## 使用

```tsx
import { Button } from '@/components/ui/button'

export function App() {
  return (
    <Button
      variant="outline"
      size="md"
      onPress={event => {
        console.log(event.detail.nativeEvent)
      }}
    >
      Button
    </Button>
  )
}
```

---

# 4. Registry Schema

## `packages/registry/src/schema.ts`

```ts
export type RegistryFramework = 'react' | 'vue'

export type RegistryItemType = 'component' | 'style' | 'lib' | 'hook' | 'block'

export interface RegistryFile {
  path: string
  content: string
}

export interface RegistryDependency {
  name: string
  version?: string
  dev?: boolean
}

export interface RegistryItem {
  name: string
  type: RegistryItemType
  framework: RegistryFramework

  description?: string

  dependencies?: RegistryDependency[]

  registryDependencies?: string[]

  files: RegistryFile[]

  docs?: string
}
```

---

# 5. Registry 入口

## `packages/registry/src/index.ts`

```ts
export { getRegistryItem, listRegistryItems } from './registry'

export type {
  RegistryDependency,
  RegistryFile,
  RegistryFramework,
  RegistryItem,
  RegistryItemType,
} from './schema'
```

---

## `packages/registry/src/registry.ts`

```ts
import type { RegistryFramework, RegistryItem } from './schema'

import { reactButton } from './react/button'
import { reactSwitch } from './react/switch'
import { reactCheckbox } from './react/checkbox'
import { reactTabs } from './react/tabs'
import { reactDialog } from './react/dialog'
import { reactIcon } from './react/icon'

import { vueButton } from './vue/button'
import { vueSwitch } from './vue/switch'
import { vueCheckbox } from './vue/checkbox'
import { vueTabs } from './vue/tabs'
import { vueDialog } from './vue/dialog'
import { vueIcon } from './vue/icon'

const items: RegistryItem[] = [
  reactButton,
  reactSwitch,
  reactCheckbox,
  reactTabs,
  reactDialog,
  reactIcon,

  vueButton,
  vueSwitch,
  vueCheckbox,
  vueTabs,
  vueDialog,
  vueIcon,
]

export function listRegistryItems(
  framework?: RegistryFramework,
): RegistryItem[] {
  return framework ? items.filter(item => item.framework === framework) : items
}

export function getRegistryItem(
  framework: RegistryFramework,
  name: string,
): RegistryItem | undefined {
  return items.find(item => item.framework === framework && item.name === name)
}
```

---

# 6. Shared 模板

## `packages/registry/src/shared/cn.ts`

```ts
export const cnTemplate = `
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`.trimStart()
```

---

## `packages/registry/src/shared/theme.ts`

```ts
export const themeCssTemplate = `
:root {
  --z-background: 0 0% 100%;
  --z-foreground: 222.2 84% 4.9%;

  --z-muted: 210 40% 96.1%;
  --z-muted-foreground: 215.4 16.3% 46.9%;

  --z-border: 214.3 31.8% 91.4%;
  --z-input: 214.3 31.8% 91.4%;
  --z-ring: 222.2 84% 4.9%;

  --z-primary: 222.2 47.4% 11.2%;
  --z-primary-foreground: 210 40% 98%;

  --z-secondary: 210 40% 96.1%;
  --z-secondary-foreground: 222.2 47.4% 11.2%;

  --z-destructive: 0 84.2% 60.2%;
  --z-destructive-foreground: 210 40% 98%;

  --z-radius: 0.5rem;
}

.dark {
  --z-background: 222.2 84% 4.9%;
  --z-foreground: 210 40% 98%;

  --z-muted: 217.2 32.6% 17.5%;
  --z-muted-foreground: 215 20.2% 65.1%;

  --z-border: 217.2 32.6% 17.5%;
  --z-input: 217.2 32.6% 17.5%;
  --z-ring: 212.7 26.8% 83.9%;

  --z-primary: 210 40% 98%;
  --z-primary-foreground: 222.2 47.4% 11.2%;

  --z-secondary: 217.2 32.6% 17.5%;
  --z-secondary-foreground: 210 40% 98%;

  --z-destructive: 0 62.8% 30.6%;
  --z-destructive-foreground: 210 40% 98%;
}
`.trimStart()
```

---

# 7. React Button Registry

## 输出目标

生成：

```txt
src/components/ui/button.tsx
```

用户拿到的是可改源码。

---

## `packages/registry/src/react/button.ts`

```ts
import type { RegistryItem } from '../schema'

export const reactButton: RegistryItem = {
  name: 'button',
  type: 'component',
  framework: 'react',
  description: 'Button component built on @zeus-ui/headless.',

  dependencies: [
    {
      name: '@zeus-ui/headless',
    },
    {
      name: 'class-variance-authority',
    },
    {
      name: 'clsx',
    },
    {
      name: 'tailwind-merge',
    },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/button.tsx',
      content: `
import * as React from 'react'
import { ZButton } from '@zeus-ui/headless/react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium',
    'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--z-ring))]',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&[data-disabled]]:pointer-events-none [&[data-disabled]]:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-[hsl(var(--z-primary))] text-[hsl(var(--z-primary-foreground))] shadow hover:opacity-90',
        destructive:
          'bg-[hsl(var(--z-destructive))] text-[hsl(var(--z-destructive-foreground))] shadow-sm hover:opacity-90',
        outline:
          'border border-[hsl(var(--z-input))] bg-transparent shadow-sm hover:bg-[hsl(var(--z-muted))]',
        secondary:
          'bg-[hsl(var(--z-secondary))] text-[hsl(var(--z-secondary-foreground))] shadow-sm hover:opacity-90',
        ghost:
          'hover:bg-[hsl(var(--z-muted))] hover:text-[hsl(var(--z-foreground))]',
        link:
          'text-[hsl(var(--z-primary))] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        md: 'h-9 px-4 py-2',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends Omit<React.ComponentPropsWithoutRef<typeof ZButton>, 'variant' | 'size'>,
    VariantProps<typeof buttonVariants> {
  asChild?: false
}

export const Button = React.forwardRef<
  React.ElementRef<typeof ZButton>,
  ButtonProps
>(function Button(
  {
    className,
    variant,
    size,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <ZButton
      ref={ref}
      disabled={disabled}
      variant={variant ?? 'default'}
      size={size ?? 'md'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
})

export { buttonVariants }
`.trimStart(),
    },
  ],
}
```

---

# 8. React Switch Registry

## `packages/registry/src/react/switch.ts`

```ts
import type { RegistryItem } from '../schema'

export const reactSwitch: RegistryItem = {
  name: 'switch',
  type: 'component',
  framework: 'react',
  description: 'Switch component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/switch.tsx',
      content: `
import * as React from 'react'
import { ZSwitch } from '@zeus-ui/headless/react'

import { cn } from '@/lib/utils'

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof ZSwitch> {}

export const Switch = React.forwardRef<
  React.ElementRef<typeof ZSwitch>,
  SwitchProps
>(function Switch(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZSwitch
      ref={ref}
      className={cn(
        [
          'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--z-ring))]',
          'data-[state=checked]:bg-[hsl(var(--z-primary))]',
          'data-[state=unchecked]:bg-[hsl(var(--z-input))]',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          '[&_[part=thumb]]:pointer-events-none [&_[part=thumb]]:block [&_[part=thumb]]:h-4 [&_[part=thumb]]:w-4',
          '[&_[part=thumb]]:rounded-full [&_[part=thumb]]:bg-[hsl(var(--z-background))] [&_[part=thumb]]:shadow',
          '[&_[part=thumb]]:transition-transform',
          'data-[state=checked]:[&_[part=thumb]]:translate-x-4',
          'data-[state=unchecked]:[&_[part=thumb]]:translate-x-0',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
})
`.trimStart(),
    },
  ],
}
```

---

# 9. React Dialog Registry

Dialog 这类组件建议 registry 层再包一层视觉结构，而不是让用户直接使用全部 headless tag。

## `packages/registry/src/react/dialog.ts`

```ts
import type { RegistryItem } from '../schema'

export const reactDialog: RegistryItem = {
  name: 'dialog',
  type: 'component',
  framework: 'react',
  description: 'Dialog components built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/dialog.tsx',
      content: `
import * as React from 'react'
import {
  ZDialog,
  ZDialogContent,
  ZDialogDescription,
  ZDialogTitle,
  ZDialogTrigger,
} from '@zeus-ui/headless/react'

import { cn } from '@/lib/utils'

export const Dialog = ZDialog
export const DialogTrigger = ZDialogTrigger

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof ZDialogContent>,
  React.ComponentPropsWithoutRef<typeof ZDialogContent>
>(function DialogContent(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZDialogContent
      ref={ref}
      className={cn(
        [
          'fixed inset-0 z-50',
          'data-[state=closed]:hidden',
          '[&_[part=overlay]]:fixed [&_[part=overlay]]:inset-0',
          '[&_[part=overlay]]:bg-black/50',
          '[&_[part=panel]]:fixed [&_[part=panel]]:left-1/2 [&_[part=panel]]:top-1/2',
          '[&_[part=panel]]:w-full [&_[part=panel]]:max-w-lg',
          '[&_[part=panel]]:-translate-x-1/2 [&_[part=panel]]:-translate-y-1/2',
          '[&_[part=panel]]:rounded-lg [&_[part=panel]]:border [&_[part=panel]]:border-[hsl(var(--z-border))]',
          '[&_[part=panel]]:bg-[hsl(var(--z-background))] [&_[part=panel]]:p-6',
          '[&_[part=panel]]:text-[hsl(var(--z-foreground))] [&_[part=panel]]:shadow-lg',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
})

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof ZDialogTitle>,
  React.ComponentPropsWithoutRef<typeof ZDialogTitle>
>(function DialogTitle(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZDialogTitle
      ref={ref}
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className,
      )}
      {...props}
    />
  )
})

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof ZDialogDescription>,
  React.ComponentPropsWithoutRef<typeof ZDialogDescription>
>(function DialogDescription(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <ZDialogDescription
      ref={ref}
      className={cn(
        'text-sm text-[hsl(var(--z-muted-foreground))]',
        className,
      )}
      {...props}
    />
  )
})
`.trimStart(),
    },
  ],
}
```

---

# 10. React Icon Registry

Phase 9 已经有 no-runtime icon output，Phase 10 的 icon 组件应该优先用：

```txt
@zeus-ui/headless/icons/react
```

而不是 `@zeus-ui/headless/react` 里的 `ZIcon`。

## `packages/registry/src/react/icon.ts`

```ts
import type { RegistryItem } from '../schema'

export const reactIcon: RegistryItem = {
  name: 'icon',
  type: 'component',
  framework: 'react',
  description: 'No-runtime icon re-export helper.',

  dependencies: [{ name: '@zeus-ui/headless' }],

  files: [
    {
      path: 'src/components/ui/icon.tsx',
      content: `
export {
  CheckIcon,
  XIcon,
} from '@zeus-ui/headless/icons/react'

export type {
  IconProps,
} from '@zeus-ui/headless/icons/react'
`.trimStart(),
    },
  ],
}
```

---

# 11. Vue Registry 示例

Vue 也生成用户项目源码。

## `packages/registry/src/vue/button.ts`

```ts
import type { RegistryItem } from '../schema'

export const vueButton: RegistryItem = {
  name: 'button',
  type: 'component',
  framework: 'vue',
  description: 'Vue Button component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/Button.vue',
      content: `
<script setup lang="ts">
import { computed } from 'vue'
import { ZButton } from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link'
    size?: 'sm' | 'md' | 'lg' | 'icon'
    disabled?: boolean
    class?: string
  }>(),
  {
    variant: 'default',
    size: 'md',
    disabled: false,
  },
)

const classes = computed(() => {
  const variants = {
    default:
      'bg-[hsl(var(--z-primary))] text-[hsl(var(--z-primary-foreground))] shadow hover:opacity-90',
    destructive:
      'bg-[hsl(var(--z-destructive))] text-[hsl(var(--z-destructive-foreground))] shadow-sm hover:opacity-90',
    outline:
      'border border-[hsl(var(--z-input))] bg-transparent shadow-sm hover:bg-[hsl(var(--z-muted))]',
    secondary:
      'bg-[hsl(var(--z-secondary))] text-[hsl(var(--z-secondary-foreground))] shadow-sm hover:opacity-90',
    ghost:
      'hover:bg-[hsl(var(--z-muted))] hover:text-[hsl(var(--z-foreground))]',
    link:
      'text-[hsl(var(--z-primary))] underline-offset-4 hover:underline',
  }

  const sizes = {
    sm: 'h-8 rounded-md px-3 text-xs',
    md: 'h-9 px-4 py-2',
    lg: 'h-10 rounded-md px-8',
    icon: 'h-9 w-9',
  }

  return cn(
    [
      'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium',
      'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--z-ring))]',
      'disabled:pointer-events-none disabled:opacity-50',
    ].join(' '),
    variants[props.variant],
    sizes[props.size],
    props.class,
  )
})
</script>

<template>
  <ZButton
    :variant="variant"
    :size="size"
    :disabled="disabled"
    :class="classes"
  >
    <slot />
  </ZButton>
</template>
`.trimStart(),
    },
  ],
}
```

---

# 12. CLI 包设计

## `create/zeus-ui/package.json`

```json
{
  "name": "zeus-ui",
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "zeus-ui": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean"
  },
  "dependencies": {
    "@zeus-ui/registry": "workspace:*",
    "commander": "^14.0.0",
    "prompts": "^2.4.2",
    "kleur": "^4.1.5"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^6.0.3"
  }
}
```

> 包名可以讨论：
> `zeus-ui` 适合 CLI。
> registry 包建议叫 `@zeus-ui/registry` 或 `@zeus-js/registry`。
> 如果偏生态产品，推荐 `@zeus-ui/registry`。

---

# 13. CLI 入口

## `create/zeus-ui/src/index.ts`

```ts
#!/usr/bin/env node

import { Command } from 'commander'
import { initCommand } from './commands/init'
import { addCommand } from './commands/add'
import { listCommand } from './commands/list'

const program = new Command()

program
  .name('zeus-ui')
  .description('Add customizable Zeus UI components to your project.')
  .version('0.0.1')

program
  .command('init')
  .description('Initialize Zeus UI config.')
  .option('-f, --framework <framework>', 'react or vue')
  .option('-y, --yes', 'skip prompts')
  .action(initCommand)

program
  .command('add')
  .description('Add a component.')
  .argument('[components...]', 'component names')
  .option('-f, --framework <framework>', 'react or vue')
  .option('-y, --yes', 'skip prompts')
  .action(addCommand)

program
  .command('list')
  .description('List available components.')
  .option('-f, --framework <framework>', 'react or vue')
  .action(listCommand)

program.parse()
```

---

# 14. 配置文件处理

## `create/zeus-ui/src/core/config.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

export interface ZeusUiConfig {
  style: string
  framework: 'react' | 'vue'
  typescript: boolean
  tailwind: boolean
  aliases: {
    components: string
    ui: string
    lib: string
    styles: string
  }
}

export const CONFIG_FILE = 'components.json'

export function createDefaultConfig(framework: 'react' | 'vue'): ZeusUiConfig {
  return {
    style: 'default',
    framework,
    typescript: true,
    tailwind: true,
    aliases: {
      components: '@/components',
      ui: '@/components/ui',
      lib: '@/lib',
      styles: '@/styles',
    },
  }
}

export async function readConfig(
  cwd = process.cwd(),
): Promise<ZeusUiConfig | null> {
  const file = path.join(cwd, CONFIG_FILE)

  try {
    const source = await fs.readFile(file, 'utf-8')
    return JSON.parse(source) as ZeusUiConfig
  } catch {
    return null
  }
}

export async function writeConfig(
  config: ZeusUiConfig,
  cwd = process.cwd(),
): Promise<void> {
  await fs.writeFile(
    path.join(cwd, CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}
```

---

# 15. 项目检测

## `create/zeus-ui/src/core/detect.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

export async function detectFramework(
  cwd = process.cwd(),
): Promise<'react' | 'vue' | null> {
  const pkg = await readPackageJson(cwd)

  if (!pkg) return null

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }

  if (deps.vue) return 'vue'
  if (deps.react) return 'react'

  return null
}

export async function readPackageJson(
  cwd = process.cwd(),
): Promise<any | null> {
  try {
    const source = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
    return JSON.parse(source)
  } catch {
    return null
  }
}
```

---

# 16. 文件写入工具

## `create/zeus-ui/src/core/fs.ts`

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensureDir(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), {
    recursive: true,
  })
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

export async function writeFileSafe(
  file: string,
  content: string,
  options: {
    overwrite?: boolean
  } = {},
): Promise<'created' | 'skipped' | 'overwritten'> {
  const exists = await fileExists(file)

  if (exists && !options.overwrite) {
    return 'skipped'
  }

  await ensureDir(file)
  await fs.writeFile(file, content)

  return exists ? 'overwritten' : 'created'
}
```

---

# 17. Registry 解析与路径替换

## `create/zeus-ui/src/core/template.ts`

```ts
import path from 'node:path'
import type { ZeusUiConfig } from './config'

export function resolveAliasPath(config: ZeusUiConfig, value: string): string {
  if (value.startsWith('src/')) {
    return path.resolve(process.cwd(), value)
  }

  return path.resolve(process.cwd(), value)
}

export function transformTemplate(
  content: string,
  config: ZeusUiConfig,
): string {
  return content
    .replaceAll('@/components', config.aliases.components)
    .replaceAll('@/components/ui', config.aliases.ui)
    .replaceAll('@/lib', config.aliases.lib)
    .replaceAll('@/styles', config.aliases.styles)
}
```

---

# 18. 包管理器检测

## `create/zeus-ui/src/core/package-manager.ts`

```ts
import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

export async function detectPackageManager(): Promise<'pnpm' | 'yarn' | 'npm'> {
  if (await exists('pnpm-lock.yaml')) return 'pnpm'
  if (await exists('yarn.lock')) return 'yarn'
  return 'npm'
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

export function installDependencies(
  deps: string[],
  options: {
    dev?: boolean
  } = {},
): void {
  if (!deps.length) return

  const pm =
    spawnSync('pnpm', ['--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    }).status === 0
      ? 'pnpm'
      : 'npm'

  const args =
    pm === 'pnpm'
      ? ['add', options.dev ? '-D' : '', ...deps].filter(Boolean)
      : ['install', options.dev ? '--save-dev' : '', ...deps].filter(Boolean)

  const result = spawnSync(pm, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    throw new Error(`Failed to install dependencies: ${deps.join(', ')}`)
  }
}
```

---

# 19. init 命令

## `create/zeus-ui/src/commands/init.ts`

```ts
import path from 'node:path'
import prompts from 'prompts'
import kleur from 'kleur'

import { createDefaultConfig, writeConfig } from '../core/config'
import { detectFramework } from '../core/detect'
import { writeFileSafe } from '../core/fs'
import { cnTemplate } from '@zeus-ui/registry/shared/cn'
import { themeCssTemplate } from '@zeus-ui/registry/shared/theme'

export async function initCommand(options: {
  framework?: 'react' | 'vue'
  yes?: boolean
}) {
  let framework = options.framework ?? (await detectFramework())

  if (!framework && !options.yes) {
    const response = await prompts({
      type: 'select',
      name: 'framework',
      message: 'Which framework are you using?',
      choices: [
        {
          title: 'React',
          value: 'react',
        },
        {
          title: 'Vue',
          value: 'vue',
        },
      ],
    })

    framework = response.framework
  }

  framework ??= 'react'

  const config = createDefaultConfig(framework)

  await writeConfig(config)

  await writeFileSafe(path.resolve('src/lib/utils.ts'), cnTemplate, {
    overwrite: false,
  })

  await writeFileSafe(
    path.resolve('src/styles/zeus-theme.css'),
    themeCssTemplate,
    {
      overwrite: false,
    },
  )

  console.log(kleur.green('Zeus UI initialized.'))
  console.log(kleur.dim('Created components.json'))
}
```

> 上面从 `@zeus-ui/registry/shared/cn` 导入需要 registry 包增加对应 exports。
> 也可以让 CLI 内部直接调用 `getRegistryItem('react', 'utils')`，统一处理。

---

# 20. add 命令

## `create/zeus-ui/src/commands/add.ts`

```ts
import path from 'node:path'
import prompts from 'prompts'
import kleur from 'kleur'

import { getRegistryItem, listRegistryItems } from '@zeus-ui/registry'

import { readConfig, createDefaultConfig } from '../core/config'
import { detectFramework } from '../core/detect'
import { writeFileSafe } from '../core/fs'
import { installDependencies } from '../core/package-manager'
import { transformTemplate } from '../core/template'

export async function addCommand(
  components: string[],
  options: {
    framework?: 'react' | 'vue'
    yes?: boolean
  },
) {
  let config = await readConfig()

  if (!config) {
    const framework = options.framework ?? (await detectFramework()) ?? 'react'

    config = createDefaultConfig(framework)
  }

  let names = components

  if (!names.length && !options.yes) {
    const available = listRegistryItems(config.framework)

    const response = await prompts({
      type: 'multiselect',
      name: 'components',
      message: 'Select components to add',
      choices: available.map(item => ({
        title: item.name,
        value: item.name,
        description: item.description,
      })),
    })

    names = response.components ?? []
  }

  if (!names.length) {
    console.log(kleur.yellow('No components selected.'))
    return
  }

  const items = names.map(name => {
    const item = getRegistryItem(config.framework, name)

    if (!item) {
      throw new Error(`Unknown component "${name}" for ${config.framework}.`)
    }

    return item
  })

  const deps = new Set<string>()

  for (const item of items) {
    for (const dep of item.dependencies ?? []) {
      deps.add(dep.version ? `${dep.name}@${dep.version}` : dep.name)
    }
  }

  if (deps.size > 0) {
    installDependencies(Array.from(deps))
  }

  for (const item of items) {
    for (const file of item.files) {
      const target = path.resolve(file.path)
      const content = transformTemplate(file.content, config)

      const status = await writeFileSafe(target, content, {
        overwrite: false,
      })

      console.log(`${statusLabel(status)} ${file.path}`)
    }
  }
}

function statusLabel(status: 'created' | 'skipped' | 'overwritten') {
  switch (status) {
    case 'created':
      return kleur.green('create')
    case 'overwritten':
      return kleur.yellow('overwrite')
    case 'skipped':
      return kleur.dim('skip')
  }
}
```

---

# 21. list 命令

## `create/zeus-ui/src/commands/list.ts`

```ts
import { listRegistryItems } from '@zeus-ui/registry'

export async function listCommand(options: { framework?: 'react' | 'vue' }) {
  const items = listRegistryItems(options.framework)

  for (const item of items) {
    console.log(`${item.name}\t${item.framework}\t${item.description ?? ''}`)
  }
}
```

---

# 22. Registry package exports

## `packages/registry/package.json`

```json
{
  "name": "@zeus-ui/registry",
  "version": "0.0.1",
  "type": "module",
  "main": "index.js",
  "module": "dist/registry.esm-bundler.js",
  "types": "dist/registry.d.ts",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/registry.d.ts",
      "import": "./dist/registry.esm-bundler.js"
    },
    "./shared/cn": {
      "types": "./dist/shared/cn.d.ts",
      "import": "./dist/shared/cn.js"
    },
    "./shared/theme": {
      "types": "./dist/shared/theme.d.ts",
      "import": "./dist/shared/theme.js"
    }
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusUiRegistry",
    "formats": ["esm-bundler", "cjs"]
  }
}
```

---

# 23. Tailwind 配置说明

用户项目需要让 Tailwind 扫描生成的组件：

```ts
// tailwind.config.ts

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,vue}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--z-radius)',
        md: 'calc(var(--z-radius) - 2px)',
        sm: 'calc(var(--z-radius) - 4px)',
      },
    },
  },
}
```

Phase 10 CLI 不一定自动改 Tailwind config，第一版可以只提示：

```txt
Remember to import src/styles/zeus-theme.css in your app entry.
```

后续再做自动 patch。

---

# 24. 用户入口样式

React 项目：

```tsx
// src/main.tsx

import '@/styles/zeus-theme.css'
import './index.css'
```

Vue 项目：

```ts
// src/main.ts

import '@/styles/zeus-theme.css'
import './style.css'
```

---

# 25. Phase 10 测试设计

## Registry 单测

```ts
import { describe, expect, it } from 'vitest'
import { getRegistryItem } from '../src'

describe('registry', () => {
  it('returns react button', () => {
    const item = getRegistryItem('react', 'button')

    expect(item?.name).toBe('button')
    expect(item?.framework).toBe('react')
    expect(item?.files[0].path).toBe('src/components/ui/button.tsx')
  })
})
```

---

## CLI init 测试

```ts
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { initCommand } from '../src/commands/init'

describe('zeus-ui init', () => {
  it('creates config and shared files', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-ui-'))
    const old = process.cwd()

    process.chdir(cwd)

    try {
      await fs.writeFile(
        path.join(cwd, 'package.json'),
        JSON.stringify({
          dependencies: {
            react: '^19.0.0',
          },
        }),
      )

      await initCommand({
        yes: true,
        framework: 'react',
      })

      expect(
        await fs.readFile(path.join(cwd, 'components.json'), 'utf-8'),
      ).toContain('"framework": "react"')

      expect(
        await fs.readFile(path.join(cwd, 'src/lib/utils.ts'), 'utf-8'),
      ).toContain('twMerge')
    } finally {
      process.chdir(old)
    }
  })
})
```

---

## CLI add 测试

```ts
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeConfig, createDefaultConfig } from '../src/core/config'
import { addCommand } from '../src/commands/add'

describe('zeus-ui add', () => {
  it('adds button component', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-ui-add-'))
    const old = process.cwd()

    process.chdir(cwd)

    try {
      await fs.writeFile(
        path.join(cwd, 'package.json'),
        JSON.stringify({
          dependencies: {
            react: '^19.0.0',
          },
        }),
      )

      await writeConfig(createDefaultConfig('react'), cwd)

      await addCommand(['button'], {
        yes: true,
      })

      const button = await fs.readFile(
        path.join(cwd, 'src/components/ui/button.tsx'),
        'utf-8',
      )

      expect(button).toContain('@zeus-ui/headless/react')
      expect(button).toContain('buttonVariants')
    } finally {
      process.chdir(old)
    }
  })
})
```

> 测试时建议 mock `installDependencies()`，避免真的执行 `pnpm add`。

---

# 26. Phase 10 文档草案

新增：

```txt
docs/internal/stage05-component-compiler-host/design/phase10.md
```

内容大纲：

````md
# Phase 10: shadcn-like Registry

## Goal

Provide copyable, customizable UI components built on top of `@zeus-ui/headless`.

## Architecture

```txt
@zeus-ui/headless
  -> behavior / state / a11y

@zeus-ui/registry
  -> source templates

zeus-ui CLI
  -> init / add / list
```
````

## User Commands

```bash
pnpm dlx zeus-ui init
pnpm dlx zeus-ui add button
pnpm dlx zeus-ui add dialog
```

## Generated Files

```txt
components.json
src/lib/utils.ts
src/styles/zeus-theme.css
src/components/ui/button.tsx
```

## Principles

- Generated source is owned by the user.
- Headless components own behavior.
- Registry components own style.
- Theme is CSS variables.
- Icons use no-runtime output.

````

---

# 27. 验收清单

```txt
[ ] 新增 packages/registry
[ ] 新增 create/zeus-ui CLI
[ ] registry schema 完成
[ ] react button/switch/checkbox/tabs/dialog/icon 模板
[ ] vue button/switch/checkbox/tabs/dialog/icon 模板
[ ] init 命令可生成 components.json
[ ] init 命令可生成 src/lib/utils.ts
[ ] init 命令可生成 src/styles/zeus-theme.css
[ ] add button 可写入 src/components/ui/button.tsx
[ ] add 支持多个组件
[ ] list 可列出组件
[ ] 自动安装 dependencies
[ ] 不覆盖用户已有文件，默认 skip
[ ] CLI 单测覆盖 init/add/list
[ ] registry 单测覆盖 get/list
[ ] 文档补 phase10
````

---

# 28. 推荐提交顺序

```bash
# 1. registry schema
git add packages/registry/package.json packages/registry/src/schema.ts packages/registry/src/index.ts packages/registry/src/registry.ts
git commit -m "feat(registry): add registry package scaffold"

# 2. shared templates
git add packages/registry/src/shared
git commit -m "feat(registry): add shared utility and theme templates"

# 3. react templates
git add packages/registry/src/react
git commit -m "feat(registry): add react component templates"

# 4. vue templates
git add packages/registry/src/vue
git commit -m "feat(registry): add vue component templates"

# 5. cli scaffold
git add create/zeus-ui/package.json create/zeus-ui/src/index.ts
git commit -m "feat(zeus-ui): add cli scaffold"

# 6. cli core
git add create/zeus-ui/src/core
git commit -m "feat(zeus-ui): add cli core utilities"

# 7. init/add/list
git add create/zeus-ui/src/commands
git commit -m "feat(zeus-ui): add init add and list commands"

# 8. tests
git add packages/registry/__tests__ create/zeus-ui/__tests__
git commit -m "test(registry): cover registry and cli commands"

# 9. docs
git add docs/internal/stage05-component-compiler-host/design/phase10.md
git commit -m "docs: add phase10 registry design"
```

---

# 29. Phase 10 完成后的效果

用户可以这样使用：

```bash
pnpm dlx zeus-ui init
pnpm dlx zeus-ui add button switch dialog
```

得到：

```txt
src/components/ui/button.tsx
src/components/ui/switch.tsx
src/components/ui/dialog.tsx
src/lib/utils.ts
src/styles/zeus-theme.css
```

底层行为来自：

```txt
@zeus-ui/headless/react
@zeus-ui/headless/vue
@zeus-ui/headless/icons/react
@zeus-ui/headless/icons/vue
```

样式和主题由用户项目掌控：

```txt
CSS Variables
Tailwind classes
class-variance-authority
用户可直接修改源码
```

Phase 10 完成后，Zeus 组件生态就从：

```txt
可编译跨框架 Web Component
```

升级为：

```txt
可复制、可定制、可主题化的 UI 组件生态
```

后续 Phase 11 就可以进入：

```txt
Docs + Release Candidate + examples polish
```
