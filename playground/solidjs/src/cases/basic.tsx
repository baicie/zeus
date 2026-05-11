// Basic element
export function BasicElement() {
  return <div>Hello World</div>
}

// Element with text binding
export function TextBinding() {
  return <span>Count: {42}</span>
}

// Element with multiple children
export function MultipleChildren() {
  return (
    <div>
      <h1>Title</h1>
      <p>Paragraph</p>
    </div>
  )
}

// Element with class attribute
export function WithClass() {
  return <button class="primary">Click me</button>
}

// Element with dynamic attribute
export function DynamicAttribute() {
  return <input type="text" placeholder="Enter text" />
}

// Input self-closing
export function SelfClosing() {
  return <input type="checkbox" checked />
}

// Fragment
export function WithFragment() {
  return (
    <>
      <span>First</span>
      <span>Second</span>
    </>
  )
}

// SVG element
export function WithSVG() {
  return (
    <svg width="100" height="100">
      <rect x="10" y="10" width="80" height="80" fill="red" />
    </svg>
  )
}
