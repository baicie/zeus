// 测试多层 .map() 嵌套
// Test: Multi-layer .map() nesting
const NestedMaps = () => {
  const categories = () => [
    {
      id: 1,
      name: 'Fruits',
      items: ['Apple', 'Banana', 'Orange'],
    },
    {
      id: 2,
      name: 'Vegetables',
      items: ['Carrot', 'Broccoli'],
    },
  ]

  const matrix = () => [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]

  return (
    <div>
      {/* 两层 map 嵌套 */}
      <ul>
        {categories().map(cat => (
          <li key={cat.id}>
            {cat.name}
            <ul>
              {cat.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {/* 三层 map 嵌套 - 矩阵 */}
      <table>
        {matrix().map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </table>

      {/* map 中的条件渲染 */}
      <ul>
        {categories().map(cat => (
          <li key={cat.id}>
            {cat.name}
            {cat.items.length > 0 && <span>({cat.items.length} items)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default NestedMaps
