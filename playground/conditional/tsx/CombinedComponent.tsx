// 测试4: 综合测试 - 组合使用所有特性
// Test 4: Combined test - using all features together
const CombinedComponent = () => {
  const isLoggedIn = () => true
  const username = () => 'John'
  const notifications = () => [
    { id: 1, message: 'Message 1' },
    { id: 2, message: 'Message 2' },
    { id: 3, message: 'Message 3' },
  ]
  const hasNotifications = () => true

  return (
    <div>
      {/* 三元运算符: 登录状态 */}
      <h1>{isLoggedIn() ? `Welcome, ${username()}` : 'Please login'}</h1>

      {/* 逻辑与: 通知列表 */}
      {hasNotifications() && (
        <ul>
          {notifications().map(n => (
            <li key={n.id}>{n.message}</li>
          ))}
        </ul>
      )}

      {/* 嵌套条件 */}
      <p>
        {isLoggedIn()
          ? username() === 'Admin'
            ? 'You are admin'
            : 'You are user'
          : 'Guest'}
      </p>
    </div>
  )
}

export default CombinedComponent
