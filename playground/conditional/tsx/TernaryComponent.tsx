// 测试1: 三元运算符条件渲染
// Test 1: Ternary operator conditional rendering
const TernaryComponent = () => {
  const show = () => true

  return <div>{show() ? <span>Yes</span> : <span>No</span>}</div>
}

export default TernaryComponent
