// 测试列表渲染的不同 key 策略
// Test: Different key strategies in list rendering
const KeyStrategies = () => {
  const items = () => [
    { id: 1, name: 'Apple' },
    { id: 2, name: 'Banana' },
    { id: 3, name: 'Orange' },
  ]

  const simpleArray = () => ['A', 'B', 'C']

  return (
    <div>
      {/* 最佳实践：使用唯一 id 作为 key */}
      <ul>
        {items().map(item => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>

      {/* 不推荐：使用数组索引作为 key（当列表可能重新排序时） */}
      <ul>
        {simpleArray().map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>

      {/* 可接受：静态列表，不会重新排序 */}
      <ul>
        {['Static1', 'Static2', 'Static3'].map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>

      {/* 复合 key */}
      <ul>
        {items().map((item, idx) => (
          <li key={`${item.id}-${idx}`}>{item.name}</li>
        ))}
      </ul>
    </div>
  )
}

export default KeyStrategies
