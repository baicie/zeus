# Dialog

An accessible modal dialog component built on `@zeus-ui/headless`.

## Import

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
```

## Usage

```tsx
function MyDialog() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button>Cancel</button>
          <button>Confirm</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

## With form

```tsx
<Dialog>
  <DialogTrigger>Edit profile</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit profile</DialogTitle>
      <DialogDescription>Make changes to your profile here.</DialogDescription>
    </DialogHeader>
    <form>
      <input placeholder="Name" />
      <input placeholder="Email" />
    </form>
    <DialogFooter>
      <button type="button">Cancel</button>
      <button type="submit">Save changes</button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Props

### Dialog

| Prop           | Type                      | Default | Description               |
| -------------- | ------------------------- | ------- | ------------------------- |
| `open`         | `boolean`                 | `false` | Controlled open state     |
| `onOpenChange` | `(open: boolean) => void` | —       | Open state change handler |

### DialogTrigger

Renders as a `<button>` by default. Supports `asChild` for custom trigger elements.

### DialogContent

Contains the dialog body. Supports `onClose` for custom close handling.
