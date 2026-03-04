// 测试缺少 key 的列表渲染（应该触发警告）
// Test: List rendering without key (should trigger warning)
const NoKeyList = () => {
  const items = () => ['Apple', 'Banana', 'Orange']

  return (
    <ul>
      {/* 没有 key 的列表 - 应该产生警告 */}
      {items().map(item => (
        <li>{item}</li>
      ))}
    </ul>
  )
}

export default NoKeyList
