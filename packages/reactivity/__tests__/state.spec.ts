import { useEffect, useState } from '../src'

describe('reactivity: state', () => {
  it('should create a state', () => {
    const [state] = useState(0)
    expect(state()).toBe(0)
  })

  it('should update the state', () => {
    const [state, setState] = useState(0)
    setState(1)
    expect(state()).toBe(1)
  })

  it('should update the state with a function', () => {
    const [state, setState] = useState(0)
    setState(state => state + 1)
    expect(state()).toBe(1)
  })

  it('should track dependencies', () => {
    const [count, setCount] = useState(0)
    const [double, setDouble] = useState(0)

    useEffect(() => {
      setDouble(count() * 2)
    })
    expect(double()).toBe(0)
    setCount(1)
    expect(double()).toBe(2)
  })
})
