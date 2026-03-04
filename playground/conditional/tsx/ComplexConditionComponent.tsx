// 测试5: 复杂条件表达式
// Test 5: Complex conditional expressions
const ComplexConditionComponent = () => {
  const status = () => 'loading'
  const data = () => null
  const error = () => null
  const items = () => []

  return (
    <div>
      {/* 多层三元运算符 */}
      {status() === 'loading' ? (
        <span>Loading...</span>
      ) : status() === 'error' ? (
        <span>Error occurred</span>
      ) : (
        <span>Success</span>
      )}

      {/* 与逻辑组合 */}
      {data() && error() === null && <div>Data loaded successfully</div>}

      {/* 空列表提示 */}
      {items().length === 0 ? (
        <p>No items available</p>
      ) : (
        <ul>
          {items().map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ComplexConditionComponent
