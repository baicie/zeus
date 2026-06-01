# Icon

Zero-runtime SVG icon components built on `@zeus-ui/headless`.

## Import

```tsx
import { IconX, IconPlus, IconCheck } from '@/components/ui/icon'
```

## Usage

```tsx
import { IconX } from '@/components/ui/icon'

function CloseButton() {
  return (
    <button class="close-btn">
      <IconX class="h-4 w-4" />
    </button>
  )
}
```

## Available icons

- `IconX` — close / dismiss
- `IconCheck` — check / success
- `IconPlus` — add / expand
- `IconMinus` — remove / collapse
- `IconChevronLeft` — navigate left
- `IconChevronRight` — navigate right
- `IconChevronDown` — expand / dropdown
- `IconChevronUp` — collapse
- `IconMenu` — hamburger menu
- `IconSearch` — search
- `IconSettings` — settings / gear
- `IconUser` — user / account
- `IconMail` — email
- `IconLock` — lock / security
- `IconEye` — show / visible
- `IconEyeOff` — hide / hidden
- `IconArrowRight` — forward
- `IconArrowLeft` — back

## Props

| Prop          | Type               | Default | Description             |
| ------------- | ------------------ | ------- | ----------------------- |
| `class`       | `string`           | —       | CSS classes for styling |
| `size`        | `number \| string` | `24`    | Icon width and height   |
| `strokeWidth` | `number`           | `2`     | SVG stroke width        |

## As Web Component

```tsx
import { ZIconX } from '@/components/ui/z-icon'

;<z-icon-x class="h-5 w-5 text-muted-foreground" />
```

## No-runtime SVG

The `output-icons` plugin can extract icons as pure SVG files for zero-JS icon rendering:

```bash
pnpm dlx zeus-ui add icon
```

Then reference directly:

```html
<img src="/icons/x.svg" alt="Close" />
```
