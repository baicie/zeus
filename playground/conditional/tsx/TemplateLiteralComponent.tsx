// 测试 TemplateLiteral - 模板字符串
// Test: TemplateLiteral - template strings
const TemplateLiteralComponent = () => {
  const name = 'John'
  const age = 30
  return <div>{`Hello, ${name}! You are ${age} years old.`}</div>
}

export default TemplateLiteralComponent
