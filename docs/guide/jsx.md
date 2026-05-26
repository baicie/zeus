# JSX

Zeus compiles JSX directly to DOM operations.

## How it works

The `@zeus-js/vite-plugin` transforms JSX into calls like:

```ts
// Input
<div>{name}</div>

// Compiled output
_h('div', text(name))
```

## Static template clone

Static parts of the template are cloned from a cached template, not recreated.

## Dynamic attributes

```tsx
<img src={avatar} alt={name} />

<input value={value} onInput={handleInput} />
```

## Class and style

```tsx
<div class={isActive ? 'active' : ''} style={{ color: 'red' }} />
```

## Event handlers

```tsx
<button onClick={handleClick}>Click</button>
```
