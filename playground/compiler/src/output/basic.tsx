// Basic element
export function BasicElement() {
  return <div>Hello World</div>;
}

// Element with text binding
export function TextBinding() {
  return <span>Count: {42}</span>;
}

// Element with multiple children
export function MultipleChildren() {
  return <div>
      <h1>Title</h1>
      <p>Paragraph</p>
    </div>;
}

// Element with attribute
export function WithAttribute() {
  return <button className="primary">Click me</button>;
}

// Element with dynamic attribute
export function DynamicAttribute() {
  return <input type="text" placeholder="Enter text" />;
}

// Fragment
export function WithFragment() {
  return <>
      <span>First</span>
      <span>Second</span>
    </>;
}