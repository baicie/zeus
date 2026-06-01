# Registry

The Zeus UI registry provides copyable UI components built on top of `@zeus-ui/headless`.

## Init

```bash
pnpm dlx zeus-ui init
```

This creates:

```
components.json
src/lib/utils.ts
src/styles/zeus-theme.css
```

## Add a component

```bash
pnpm dlx zeus-ui add button
```

This writes:

```
src/components/ui/button.tsx
```

## Add multiple components

```bash
pnpm dlx zeus-ui add button dialog switch
```

## List available components

```bash
pnpm dlx zeus-ui list
```

## Use the component

```tsx
import { Button } from '@/components/ui/button'

export function App() {
  return <Button variant="outline">Button</Button>
}
```

The generated source belongs to your project. You can edit it freely.

## Supported components

- **button** — button with variants and sizes
- **switch** — accessible toggle switch
- **checkbox** — accessible checkbox
- **tabs** — accessible tab list
- **dialog** — accessible modal dialog
- **icon** — zero-runtime SVG icon component

## Framework

Registry currently supports React. Vue support is planned.
