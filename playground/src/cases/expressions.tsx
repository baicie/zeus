// Dynamic expressions in JSX
export function DynamicExpr() {
  const name = 'World'
  const count = 42
  return <div>{name}</div>
}

// Ternary expression
export function TernaryExpr() {
  const flag = true
  return <div>{flag ? 'yes' : 'no'}</div>
}

// Logical AND expression
export function LogicalExpr() {
  const show = true
  return <div>{show && 'visible'}</div>
}

// Function call
export function FunctionCall() {
  const format = (n: number) => `Count: ${n}`
  return <span>{format(100)}</span>
}

// Object property access
export function ObjectProp() {
  const user = { name: 'Alice', age: 30 }
  return <div>{user.name}</div>
}

// Array map
export function ArrayMap() {
  const items = ['a', 'b', 'c']
  return (
    <ul>
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
