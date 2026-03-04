// 测试条件表达式中的函数调用
// Test: Function calls in conditional expressions
const FunctionInConditions = () => {
  const getUser = () => ({ name: 'John', age: 30, role: 'admin' })
  const getItems = () => [1, 2, 3]
  const isAdmin = () => true
  const getStatus = () => 'active'
  const getCount = () => 0

  return (
    <div>
      {/* 条件中的对象属性访问 */}
      {getUser().name === 'John' && <span>Welcome John</span>}

      {/* 条件中的函数返回值比较 */}
      {getUser().role === 'admin' ? (
        <span>Admin Panel</span>
      ) : (
        <span>User Panel</span>
      )}

      {/* 逻辑运算符中的函数调用 */}
      {isAdmin() && <span>Admin</span>}
      {getStatus() || <span>No status</span>}

      {/* 函数调用作为 map 的参数 */}
      {getItems().map(x => x * 2)}

      {/* 函数调用作为三元条件 */}
      {getCount() > 0 ? <span>Has items</span> : <span>Empty</span>}

      {/* 嵌套函数调用 */}
      {getUser().name.toUpperCase()}
      {getItems().length}

      {/* 条件中的数组方法调用 */}
      {getItems()
        .filter(x => x > 1)
        .map(x => x)}
      {getItems().find(x => x === 2)}
      {getItems().includes(1)}

      {/* 链式函数调用 */}
      {getUser()?.name}
      {getItems()?.[0]}
    </div>
  )
}

export default FunctionInConditions
