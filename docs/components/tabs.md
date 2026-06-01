# Tabs

An accessible tab list component built on `@zeus-ui/headless`.

## Import

```tsx
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
```

## Usage

```tsx
function MyTabs() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p>Overview content goes here.</p>
      </TabsContent>
      <TabsContent value="settings">
        <p>Settings content goes here.</p>
      </TabsContent>
      <TabsContent value="analytics">
        <p>Analytics content goes here.</p>
      </TabsContent>
    </Tabs>
  )
}
```

## Controlled

```tsx
import { useState } from 'react'

function ControlledTabs() {
  const [value, setValue] = useState('overview')

  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Content A</TabsContent>
      <TabsContent value="b">Content B</TabsContent>
    </Tabs>
  )
}
```

## Props

### Tabs

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | — | Controlled active tab value |
| `defaultValue` | `string` | — | Default active tab value |
| `onValueChange` | `(value: string) => void` | — | Tab change handler |

### TabsTrigger

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | — | The value this trigger represents |
| `disabled` | `boolean` | `false` | Disables the trigger |
