import {
  defineFunctionalWC,
  useState,
  useComputed,
  useEffect,
  jsx,
} from '../src'

/**
 * 待办事项列表组件
 * 展示更复杂的函数式组件用法
 */
interface TodoItem {
  id: number
  text: string
  completed: boolean
}

function TodoList(props: { title?: string }) {
  const todos = useState<TodoItem[]>([])
  const newTodo = useState('')
  const filter = useState<'all' | 'active' | 'completed'>('all')

  // 计算属性：过滤后的待办事项
  const filteredTodos = useComputed(() => {
    switch (filter()) {
      case 'active':
        return todos().filter(todo => !todo.completed)
      case 'completed':
        return todos().filter(todo => todo.completed)
      default:
        return todos()
    }
  })

  // 计算属性：统计信息
  const stats = useComputed(() => {
    const all = todos()
    const completed = all.filter(todo => todo.completed)
    return {
      total: all.length,
      completed: completed.length,
      active: all.length - completed.length,
    }
  })

  // 添加待办事项
  const addTodo = () => {
    if (newTodo().trim()) {
      todos([
        ...todos(),
        {
          id: Date.now(),
          text: newTodo().trim(),
          completed: false,
        },
      ])
      newTodo('')
    }
  }

  // 切换待办事项状态
  const toggleTodo = (id: number) => {
    todos(
      todos().map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    )
  }

  // 删除待办事项
  const deleteTodo = (id: number) => {
    todos(todos().filter(todo => todo.id !== id))
  }

  // 清空已完成的待办事项
  const clearCompleted = () => {
    todos(todos().filter(todo => !todo.completed))
  }

  // 副作用：保存到 localStorage
  useEffect(() => {
    const saved = localStorage.getItem('zeus-todos')
    if (saved) {
      try {
        todos(JSON.parse(saved))
      } catch (e) {
        console.warn('Failed to parse saved todos')
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('zeus-todos', JSON.stringify(todos()))
  })

  return jsx(
    'div',
    {
      style:
        'max-width: 500px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;',
    },
    jsx(
      'h2',
      { style: 'margin: 0 0 20px 0; color: #333; text-align: center;' },
      props.title || 'Todo List'
    ),

    // 输入区域
    jsx(
      'div',
      { style: 'display: flex; gap: 8px; margin-bottom: 20px;' },
      jsx('input', {
        type: 'text',
        placeholder: 'Add a new todo...',
        value: newTodo(),
        style:
          'flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px;',
        onInput: (e: Event) => newTodo((e.target as HTMLInputElement).value),
        onKeyPress: (e: KeyboardEvent) => {
          if (e.key === 'Enter') addTodo()
        },
      }),
      jsx(
        'button',
        {
          style:
            'padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;',
          onClick: addTodo,
        },
        'Add'
      )
    ),

    // 过滤器
    jsx(
      'div',
      {
        style:
          'display: flex; gap: 8px; margin-bottom: 16px; justify-content: center;',
      },
      jsx(
        'button',
        {
          style: `padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: ${
            filter() === 'all' ? '#007acc' : 'white'
          }; color: ${filter() === 'all' ? 'white' : '#333'};`,
          onClick: () => filter('all'),
        },
        'All'
      ),
      jsx(
        'button',
        {
          style: `padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: ${
            filter() === 'active' ? '#007acc' : 'white'
          }; color: ${filter() === 'active' ? 'white' : '#333'};`,
          onClick: () => filter('active'),
        },
        'Active'
      ),
      jsx(
        'button',
        {
          style: `padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: ${
            filter() === 'completed' ? '#007acc' : 'white'
          }; color: ${filter() === 'completed' ? 'white' : '#333'};`,
          onClick: () => filter('completed'),
        },
        'Completed'
      )
    ),

    // 统计信息
    jsx(
      'div',
      {
        style:
          'text-align: center; margin-bottom: 16px; color: #666; font-size: 14px;',
      },
      `Total: ${stats().total} | Active: ${stats().active} | Completed: ${
        stats().completed
      }`
    ),

    // 待办事项列表
    jsx(
      'div',
      { style: 'space-y: 8px;' },
      ...filteredTodos().map(todo =>
        jsx(
          'div',
          {
            key: todo.id,
            style:
              'display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid #eee; border-radius: 4px;',
          },
          jsx('input', {
            type: 'checkbox',
            checked: todo.completed,
            style: 'margin: 0;',
            onChange: () => toggleTodo(todo.id),
          }),
          jsx(
            'span',
            {
              style: `flex: 1; ${
                todo.completed
                  ? 'text-decoration: line-through; color: #999;'
                  : ''
              }`,
            },
            todo.text
          ),
          jsx(
            'button',
            {
              style:
                'padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;',
              onClick: () => deleteTodo(todo.id),
            },
            'Delete'
          )
        )
      )
    ),

    // 清空按钮
    stats().completed > 0 &&
      jsx(
        'div',
        { style: 'text-align: center; margin-top: 16px;' },
        jsx(
          'button',
          {
            style:
              'padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;',
            onClick: clearCompleted,
          },
          `Clear ${stats().completed} completed`
        )
      )
  )
}

// 定义 Web Component
defineFunctionalWC('alien-todo-list', TodoList, {
  shadow: true,
  styles: `
    :host {
      display: block;
      margin: 20px 0;
    }
    
    button:hover {
      opacity: 0.8;
    }
    
    button:active {
      transform: translateY(1px);
    }
    
    input[type="checkbox"] {
      cursor: pointer;
    }
  `,
  observedAttributes: ['title'],
})
