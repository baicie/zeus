// Dynamic expressions in JSX
export function DynamicExpr() {
  const name = 'World';
  const count = 42;
  return template("<div></div>");
}

// Ternary expression
export function TernaryExpr() {
  const flag = true;
  return template("<div></div>");
}

// Logical AND expression
export function LogicalExpr() {
  const show = true;
  return template("<div></div>");
}

// Function call
export function FunctionCall() {
  const format = (n: number) => `Count: ${n}`;
  return template("<span></span>");
}

// Object property access
export function ObjectProp() {
  const user = {
    name: 'Alice',
    age: 30
  };
  return template("<div></div>");
}

// Array map
export function ArrayMap() {
  const items = ['a', 'b', 'c'];
  return template("<ul></ul>");
}