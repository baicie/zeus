// Basic element
export function BasicElement() {
  return template("<div>Hello World</div>");
}

// Element with text binding
export function TextBinding() {
  return template("<span>Count:</span>");
}

// Element with multiple children
export function MultipleChildren() {
  return template("<div><h1>Title</h1><p>Paragraph</p></div>");
}

// Element with attribute
export function WithAttribute() {
  return template("<button>Click me</button>");
}

// Element with dynamic attribute
export function DynamicAttribute() {
  return template("<input>");
}

// Fragment
export function WithFragment() {
  return <>
      template("<span>First</span>")
      template("<span>Second</span>")
    </>;
}