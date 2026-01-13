// 列表组件 / List component
const ListComponent = () => {
  const items = ['Apple', 'Banana', 'Orange']

  return (
    <ul>
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export default ListComponent
