# JSX

Zeus compiles JSX directly to DOM operations.

## How it works

The compiler extracts static markup into a reusable template and creates
bindings only for dynamic expressions. For example, in:

```ts
function Greeting(props) {
  return <div class="greeting">Hello, {props.name}</div>
}
```

the element and fixed text are stored in a static template. Each component
instance clones that template, then a text binding updates the single dynamic
text position when `props.name` changes. Zeus does not build a virtual tree or
diff component output after state updates.

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
