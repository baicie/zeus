import { type Signal, useEffect, useMemo, useState } from '../src'

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

  it('should create memo', () => {
    const [count, setCount] = useState(0)
    const double = useMemo(() => count() * 2)

    expect(double()).toBe(0)
    setCount(1)
    expect(double()).toBe(2)
    setCount(2)
    expect(double()).toBe(4)
  })

  it('should track nested dependencies', () => {
    const [a, setA] = useState(1)
    const [b, setB] = useState(2)
    const [result, setResult] = useState(0)

    useEffect(() => {
      useEffect(() => {
        setResult(a() + b())
      })
    })

    expect(result()).toBe(3)
    setA(2)
    expect(result()).toBe(4)
    setB(3)
    expect(result()).toBe(5)
  })

  it('should handle conditional dependencies', () => {
    const [condition, setCondition] = useState(true)
    const [a, setA] = useState(1)
    const [b, setB] = useState(2)
    const [result, setResult] = useState(0)

    useEffect(() => {
      setResult(condition() ? a() : b())
    })

    expect(result()).toBe(1) // 初始条件为true，使用a
    setA(3)
    expect(result()).toBe(3) // 更新a应该触发更新

    setCondition(false)
    expect(result()).toBe(2) // 切换到b

    setA(5)
    expect(result()).toBe(2) // 更新a不应该触发更新

    setB(10)
    expect(result()).toBe(10) // 更新b应该触发更新
  })

  it('should batch multiple updates', () => {
    const [count, setCount] = useState(0)
    const [effectCount, setEffectCount] = useState(0)

    useEffect(() => {
      setEffectCount(c => c + 1)
    })

    expect(effectCount()).toBe(1)

    setCount(1)
    setCount(2)
    setCount(3)

    expect(effectCount()).toBe(1)
    expect(count()).toBe(3)
  })

  // it('should support cleanup in effects', () => {
  //   const cleanupCalls: string[] = []
  //   const [trigger, setTrigger] = useState(0)

  //   useEffect(() => {
  //     cleanupCalls.push(`setup ${trigger()}`)
  //     return () => {
  //       cleanupCalls.push(`cleanup ${trigger()}`)
  //     }
  //   })

  //   expect(cleanupCalls).toEqual(['setup 0'])

  //   setTrigger(1)
  //   expect(cleanupCalls).toEqual(['setup 0', 'cleanup 0', 'setup 1'])

  //   setTrigger(2)
  //   expect(cleanupCalls).toEqual([
  //     'setup 0',
  //     'cleanup 0',
  //     'setup 1',
  //     'cleanup 1',
  //     'setup 2',
  //   ])
  // })

  it('should update memo only when dependencies change', () => {
    const [a, setA] = useState(1)
    const [b] = useState(2)
    let computeCount = 0

    const sum = useMemo(() => {
      computeCount++
      return a() + b()
    })

    expect(sum()).toBe(3)
    expect(computeCount).toBe(1)

    // 不相关的状态更新不应触发重新计算
    const [, setUnrelated] = useState(0)
    setUnrelated(1)
    expect(computeCount).toBe(1)
    expect(sum()).toBe(3)

    // 依赖更新应触发重新计算
    setA(2)
    expect(computeCount).toBe(2)
    expect(sum()).toBe(4)
  })

  it('should detect and handle circular dependencies', () => {
    const [a, setA] = useState(1)
    const [b, setB] = useState(2)

    // 创建循环依赖
    useEffect(() => {
      setB(a() + 1)
    })

    useEffect(() => {
      setA(b() + 1)
    })

    // 这里应该测试系统如何处理循环依赖
    // 可能的行为:
    // 1. 抛出错误
    // 2. 达到最大更新次数后停止
    // 3. 其他处理机制

    // 例如，如果系统有最大更新限制:
    expect(a()).toBeGreaterThan(1)
    expect(b()).toBeGreaterThan(2)
  })

  // it('should handle async effects', async () => {
  //   const [count, setCount] = useState(0)
  //   const [asyncResult, setAsyncResult] = useState<number | null>(null)

  //   useEffect(() => {
  //     // 模拟异步操作
  //     Promise.resolve().then(() => {
  //       setAsyncResult(count() * 2)
  //     })
  //   })

  //   // 初始状态
  //   expect(asyncResult()).toBe(null)

  //   // 等待异步操作完成
  //   await new Promise(resolve => setTimeout(resolve, 0))

  //   expect(asyncResult()).toBe(0)

  //   // 更新触发新的异步效果
  //   setCount(5)
  //   await new Promise(resolve => setTimeout(resolve, 0))

  //   expect(asyncResult()).toBe(10)
  // })

  it('should handle errors in effects', () => {
    const [shouldError, setShouldError] = useState(false)
    const [errorCaught, setErrorCaught] = useState(false)

    try {
      useEffect(() => {
        if (shouldError()) {
          throw new Error('Test error')
        }
      })

      setShouldError(true)
    } catch (e) {
      setErrorCaught(true)
    }

    expect(errorCaught()).toBe(true)
  })

  it('should perform efficiently with many dependencies', () => {
    const COUNT = 1000
    const states: Signal<number>[] = []
    const startTime = performance.now()

    // 创建大量状态
    for (let i = 0; i < COUNT; i++) {
      states.push(useState(i))
    }

    // 创建依赖所有状态的计算
    let sum = useMemo(() => {
      return states.reduce((acc, [state]) => acc + state(), 0)
    })

    const setupTime = performance.now() - startTime
    expect(setupTime).toBeLessThan(100) // 假设的性能预期

    // 测试更新性能
    const updateStart = performance.now()
    states[0][1](COUNT) // 更新第一个状态
    const updateTime = performance.now() - updateStart

    expect(updateTime).toBeLessThan(20) // 假设的性能预期
    expect(sum()).toBe((COUNT * (COUNT - 1)) / 2 + COUNT - 0) // 高斯求和公式 + 第一个元素的变化
  })
})
