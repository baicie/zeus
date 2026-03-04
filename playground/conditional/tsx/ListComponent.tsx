// 测试3: .map() 列表渲染
// Test 3: .map() list rendering
const ListComponent = () => {
  const items = () => ['Apple', 'Banana', 'Orange']

  return (
    <ul>
      {items().map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export default ListComponent
