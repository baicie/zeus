// Event handlers
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

// Input with onChange
export function InputWithChange() {
  return <input onChange={e => console.log(e.target.value)} />
}
