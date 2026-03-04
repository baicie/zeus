// 测试复杂的嵌套条件表达式
// Test: Complex nested conditional expressions
const NestedConditions = () => {
  const a = 1
  const b = 2
  const c = 3
  const flag = true
  const getValue = () => 10

  return (
    <div>
      {/* 三层嵌套三元运算符 */}
      {a === 1 ? (b === 2 ? 'a=1 且 b=2' : 'a=1 但 b≠2') : 'a≠1'}

      {/* 嵌套逻辑运算符 */}
      {flag && a > 0 && b > 0 && <span>All positive</span>}

      {/* 条件中的函数调用 */}
      {getValue() > 5 ? <span>Large</span> : <span>Small</span>}

      {/* 复杂逻辑组合 */}
      {a + b > c && (flag || false) ? <span>Complex</span> : null}

      {/* 嵌套条件 + 列表 */}
      {flag ? (
        [1, 2, 3].map(n => <li key={n}>{n * 2}</li>)
      ) : (
        <span>No items</span>
      )}
    </div>
  )
}

export default NestedConditions
