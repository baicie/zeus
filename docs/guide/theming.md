# Theming

Customize the visual appearance of registry components.

## CSS Variables

Registry components use CSS custom properties for theming. Define them in your global stylesheet.

### Base colors

```css
:root {
  --z-background: 0 0% 100%;
  --z-foreground: 222.2 84% 4.9%;
  --z-card: 0 0% 100%;
  --z-card-foreground: 222.2 84% 4.9%;
  --z-popover: 0 0% 100%;
  --z-popover-foreground: 222.2 84% 4.9%;
  --z-primary: 221.2 83.2% 53.3%;
  --z-primary-foreground: 210 40% 98%;
  --z-secondary: 210 40% 96.1%;
  --z-secondary-foreground: 222.2 47.4% 11.2%;
  --z-muted: 210 40% 96.1%;
  --z-muted-foreground: 215.4 16.3% 46.9%;
  --z-accent: 210 40% 96.1%;
  --z-accent-foreground: 222.2 47.4% 11.2%;
  --z-destructive: 0 84.2% 60.2%;
  --z-destructive-foreground: 210 40% 98%;
  --z-border: 214.3 31.8% 91.4%;
  --z-input: 214.3 31.8% 91.4%;
  --z-ring: 221.2 83.2% 53.3%;
  --z-radius: 0.5rem;
}
```

### Using with Tailwind CSS

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --z-background: 0 0% 100%;
    --z-foreground: 222.2 84% 4.9%;
    /* ... */
  }
}
```

Then reference them in your CSS:

```css
.my-component {
  background-color: hsl(var(--z-background));
  color: hsl(var(--z-foreground));
  border-radius: calc(var(--z-radius) - 2px);
}
```

## Web Components

Web Components expose public custom properties through `cssVars`. Declare the
token with the component so it is included in `zeus.components.json` and
`custom-elements.json`, then set it on an ancestor or on the host. Changing a
token updates Shadow DOM and Light DOM content without remounting the
component.

```tsx
defineElement(
  'z-panel',
  {
    shadow: true,
    cssVars: {
      '--z-panel-accent': { description: 'Panel accent color.' },
    },
    styles: [':host { color: var(--z-panel-accent); }'],
    styleNonce: serverStyleNonce,
  },
  props => (
    <Host data-theme={props.theme}>
      <button part="control">Open</button>
    </Host>
  ),
)
```

Use `::part(name)` for styles that cross a Shadow DOM boundary. In Light DOM,
use the host's `data-*` state with a normal selector instead:

```css
z-panel::part(control) {
  border-color: var(--z-panel-accent);
}

z-panel[data-theme='dark'] {
  --z-panel-accent: #8ab4f8;
}
```

`styles` are injected into the active ShadowRoot or Light DOM host. Every
injected style receives `styleNonce` when provided, and styles are removed on
owner disposal and recreated on reconnect. Configure the page CSP to allow
that nonce in `style-src`.
