// 测试2: 逻辑与运算符条件渲染
// Test 2: Logical AND operator conditional rendering
const LogicalAndComponent = () => {
  const show = () => true

  return <div>{show() && <span>Visible</span>}</div>
}

export default LogicalAndComponent
