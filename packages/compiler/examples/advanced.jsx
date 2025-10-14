/**
 * 高级 JSX 示例
 * 展示复杂场景的转换
 */

import React from 'react'

function TodoList({ todos, onToggle, onDelete }) {
  return (
    <div className="todo-list">
      <h2>Todo List</h2>
      <ul>
        {todos.map(todo => (
          <li
            key={todo.id}
            className={todo.completed ? 'completed' : 'pending'}
          >
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => onToggle(todo.id)}
            />
            <span>{todo.text}</span>
            <button onClick={() => onDelete(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function App() {
  const [todos, setTodos] = React.useState([
    { id: 1, text: 'Learn Zeus', completed: false },
    { id: 2, text: 'Build app', completed: true },
  ])

  const handleToggle = id => {
    setTodos(
      todos.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    )
  }

  const handleDelete = id => {
    setTodos(todos.filter(todo => todo.id !== id))
  }

  return (
    <div className="app">
      <h1>Zeus Todo App</h1>
      <TodoList todos={todos} onToggle={handleToggle} onDelete={handleDelete} />
    </div>
  )
}

export default App
