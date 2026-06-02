# Checkbox

An accessible checkbox component built on `@zeus-ui/headless`.

## Import

```tsx
import { Checkbox } from '@/components/ui/checkbox'
```

## Usage

```tsx
import { Checkbox } from '@/components/ui/checkbox'

function Terms() {
  return (
    <label class="flex items-center gap-2">
      <Checkbox id="terms" />
      <span>I agree to the terms</span>
    </label>
  )
}
```

## Controlled

```tsx
import { Checkbox } from '@/components/ui/checkbox'
import { useState } from 'react'

function ControlledCheckbox() {
  const [checked, setChecked] = useState(false)

  return (
    <label class="flex items-center gap-2">
      <Checkbox
        checked={checked}
        onCheckedChange={event => setChecked(event.detail.checked)}
      />
      <span>{checked ? 'Checked' : 'Unchecked'}</span>
    </label>
  )
}
```

## Indeterminate

```tsx
import { Checkbox } from '@/components/ui/checkbox'
import { useState } from 'react'

function SelectAll() {
  const [checked, setChecked] = useState<
    'unchecked' | 'checked' | 'indeterminate'
  >('indeterminate')
  // ... handle with onCheckedChange
}
```

## As Web Component

```tsx
import { ZCheckbox } from '@/components/ui/z-checkbox'
;<ZCheckbox
  checked={false}
  onCheckedChange={event => {
    console.log(event.detail.checked)
  }}
/>
```

## Props

| Prop              | Type                                                 | Default | Description               |
| ----------------- | ---------------------------------------------------- | ------- | ------------------------- |
| `checked`         | `boolean`                                            | `false` | Controlled checked state  |
| `indeterminate`   | `boolean`                                            | `false` | Indeterminate state       |
| `disabled`        | `boolean`                                            | `false` | Disables the checkbox     |
| `onCheckedChange` | `(event: CustomEvent<{ checked: boolean }>) => void` | —       | Change handler            |
| `id`              | `string`                                             | —       | Associates with `<label>` |
