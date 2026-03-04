// 测试 MemberExpression - 对象属性访问
// Test: MemberExpression - object property access
const MemberComponent = () => {
  const user = { name: 'John', age: 30 }
  return <div>{user.name}</div>
}

export default MemberComponent
