// 测试所有表达式类型
// Test: All Expression Types
const AllExpressions = () => {
  const obj = { a: 1, b: 2 }
  const arr = [1, 2, 3]
  const fn = () => 'test'
  const date = new Date()
  const num = 5
  const str = 'hello'
  const flag = true

  return (
    <div>
      {/* MemberExpression */}
      {obj.a}
      {obj['b']}
      {arr[0]}

      {/* BinaryExpression */}
      {1 + 2}
      {10 - 3}
      {4 * 5}
      {10 / 2}
      {10 % 3}
      {2 ** 3}
      {1 === 1}
      {(() => {
        const a = Number(1)
        const b = Number(2)
        return a !== b
      })()}
      {(() => {
        const a = Number(1)
        const b = Number(2)
        return a === b
      })()}
      {1 > 0}
      {1 >= 1}
      {0 < 1}
      {0 <= 0}

      {/* TemplateLiteral */}
      {`string`}
      {`${str}`}
      {`${num} + ${obj.a}`}

      {/* UnaryExpression */}
      {!flag}
      {!!flag}
      {-num}
      {+num}
      {~0}
      {typeof str}
      {typeof num}
      {void 0}

      {/* LogicalExpression */}
      {flag && 'yes'}
      {flag || 'no'}
      {flag ? 'yes' : 'no'}

      {/* NewExpression */}
      {new Date().getTime()}
      {new Array(3).length}

      {/* UpdateExpression */}
      {(() => {
        let n = num
        return (n++, n)
      })()}
      {(() => {
        let n = num
        return (n--, n)
      })()}

      {/* AssignmentExpression */}
      {((obj.a = 10), obj.a)}

      {/* SequenceExpression */}
      {(a => a + 1)(5)}

      {/* ChainExpression */}
      {obj?.a}
      {arr?.[0]}
      {fn?.()}
    </div>
  )
}

export default AllExpressions
