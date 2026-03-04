// 测试 UnaryExpression - 一元运算
// Test: UnaryExpression - unary operations
const UnaryComponent = () => {
  const flag = true
  const num = 5
  return (
    <div>
      {!flag} {-num} {typeof flag}
    </div>
  )
}

export default UnaryComponent
