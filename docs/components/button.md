# Button

A versatile button component built on `@zeus-ui/headless`.

## Import

```tsx
import { Button } from '@/components/ui/button'
```

## Variants

```tsx
<Button>Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="link">Link</Button>
```

## Sizes

```tsx
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">
  <IconX />
</Button>
```

## States

```tsx
<Button disabled>Disabled</Button>
<Button loading>Saving...</Button>
```

## With icon

```tsx
<Button>
  <IconPlus class="h-4 w-4" />
  New item
</Button>
```

## As Web Component

```tsx
import { ZButton } from '@/components/ui/z-button'

;<ZButton variant="outline" onPress={onClick}>
  Click me
</ZButton>
```

## Props

| Prop       | Type                                                           | Default     | Description                         |
| ---------- | -------------------------------------------------------------- | ----------- | ----------------------------------- |
| `variant`  | `'default' \| 'outline' \| 'ghost' \| 'destructive' \| 'link'` | `'default'` | Visual style variant                |
| `size`     | `'sm' \| 'default' \| 'lg' \| 'icon'`                          | `'default'` | Size preset                         |
| `disabled` | `boolean`                                                      | `false`     | Disables the button                 |
| `asChild`  | `boolean`                                                      | `false`     | Merge props onto child element      |
| `onPress`  | `(event: CustomEvent) => void`                                 | —           | Press event handler (Web Component) |
