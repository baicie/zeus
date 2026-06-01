# Switch

An accessible toggle switch component built on `@zeus-ui/headless`.

## Import

```tsx
import { Switch } from '@/components/ui/switch'
```

## Usage

```tsx
import { Switch } from '@/components/ui/switch'

function Settings() {
  return (
    <div class="flex items-center justify-between">
      <label htmlFor="notifications">Enable notifications</label>
      <Switch id="notifications" />
    </div>
  )
}
```

## Controlled

```tsx
import { Switch } from '@/components/ui/switch'
import { useState } from 'react'

function ControlledSwitch() {
  const [checked, setChecked] = useState(false)

  return (
    <Switch
      checked={checked}
      onCheckedChange={event => setChecked(event.detail.checked)}
    />
  )
}
```

## As Web Component

```tsx
import { ZSwitch } from '@/components/ui/z-switch'

<ZSwitch
  checked={true}
  onCheckedChange={event => {
    console.log(event.detail.checked)
  }}
/>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `checked` | `boolean` | `false` | Controlled checked state |
| `disabled` | `boolean` | `false` | Disables the switch |
| `onCheckedChange` | `(event: CustomEvent<{ checked: boolean }>) => void` | — | Change handler |
| `id` | `string` | — | Associates with `<label>` |
