// 测试 BinaryExpression - 二元运算
// Test: BinaryExpression - binary operations
const BinaryComponent = () => {
  const a = 10
  const b = 3
  return (
    <div>
      {a + b} {a > b} {a * b}
    </div>
  )
}

export default BinaryComponent
