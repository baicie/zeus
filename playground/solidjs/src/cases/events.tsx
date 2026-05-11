// Click handler
export function ClickHandler() {
  return <button onClick={() => console.log('clicked')}>Click me</button>
}

// Multiple event handlers
export function MultipleEvents() {
  return (
    <div
      onMouseEnter={() => console.log('enter')}
      onMouseLeave={() => console.log('leave')}
    >
      Hover me
    </div>
  )
}

// Event with args
export function EventWithArgs() {
  const handleClick = (e: Event, id: number) => {
    console.log(id)
  }
  return <button onClick={e => handleClick(e, 123)}>Click</button>
}

// Input with onInput
export function InputWithChange() {
  return <input onInput={e => console.log(e.currentTarget.value)} />
}

// Prevent default
export function PreventDefault() {
  return (
    <form onSubmit={e => e.preventDefault()}>
      <button type="submit">Submit</button>
    </form>
  )
}

// Delegated event (camelCase -> kebab)
export function DelegatedEvents() {
  return (
    <div>
      <button onClick={() => console.log('btn1')}>Button 1</button>
      <button onClick={() => console.log('btn2')}>Button 2</button>
    </div>
  )
}
