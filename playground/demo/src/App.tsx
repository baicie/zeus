import { defineComponent, onMounted, onUpdated } from '@zeus-js/runtime-core'
import { computed, signal } from '@zeus-js/signal'

const Counter = defineComponent({
  name: 'Counter',
  setup() {
    const count = signal(0)
    const doubleCount = computed(() => count() * 2)

    const increment = () => {
      count(count() + 1)
    }

    const decrement = () => {
      count(count() - 1)
    }

    onMounted(() => {
      console.log('Counter component mounted')
    })

    onUpdated(() => {
      console.log('Counter component updated')
    })

    // 简化版本：直接返回DOM元素
    const render = () => {
      const container = document.createElement('div')
      container.className = 'counter'

      container.innerHTML = `
        <h1>Zeus Counter Demo</h1>
        <div class="count-display">
          Count: <span id="count">${count()}</span> |
          Double: <span id="double">${doubleCount()}</span>
        </div>
        <div class="buttons">
          <button id="increment">+</button>
          <button id="decrement">-</button>
        </div>
      `

      // 绑定事件
      const incrementBtn = container.querySelector(
        '#increment',
      ) as HTMLButtonElement
      const decrementBtn = container.querySelector(
        '#decrement',
      ) as HTMLButtonElement
      const countSpan = container.querySelector('#count') as HTMLSpanElement
      const doubleSpan = container.querySelector('#double') as HTMLSpanElement

      incrementBtn.addEventListener('click', () => {
        count(count() + 1)
        countSpan.textContent = count().toString()
        doubleSpan.textContent = doubleCount().toString()
      })

      decrementBtn.addEventListener('click', () => {
        count(count() - 1)
        countSpan.textContent = count().toString()
        doubleSpan.textContent = doubleCount().toString()
      })

      return container
    }

    return render
  },
})

const TodoApp = defineComponent({
  name: 'TodoApp',
  setup() {
    const todos = signal<string[]>([])
    const newTodo = signal('')

    const addTodo = () => {
      if (newTodo().trim()) {
        todos([...todos(), newTodo().trim()])
        newTodo('')
      }
    }

    const removeTodo = (index: number) => {
      todos(todos().filter((_: any, i: number) => i !== index))
    }

    const render = () => {
      const container = document.createElement('div')
      container.className = 'todo-app'

      container.innerHTML = `
        <h2>Todo List</h2>
        <div class="add-todo">
          <input type="text" id="new-todo" placeholder="Enter a todo..." value="${newTodo()}">
          <button id="add-btn">Add</button>
        </div>
        <ul class="todo-list" id="todo-list">
          ${todos()
            .map(
              (todo, index) => `
            <li class="todo-item">
              ${todo}
              <button class="remove-btn" data-index="${index}">×</button>
            </li>
          `,
            )
            .join('')}
        </ul>
      `

      // 绑定事件
      const input = container.querySelector('#new-todo') as HTMLInputElement
      const addBtn = container.querySelector('#add-btn') as HTMLButtonElement
      const todoList = container.querySelector('#todo-list') as HTMLUListElement

      const updateList = () => {
        const listElement = container.querySelector(
          '#todo-list',
        ) as HTMLUListElement
        listElement.innerHTML = todos()
          .map(
            (todo, index) => `
          <li class="todo-item">
            ${todo}
            <button class="remove-btn" data-index="${index}">×</button>
          </li>
        `,
          )
          .join('')

        // 重新绑定删除事件
        listElement.querySelectorAll('.remove-btn').forEach(btn => {
          btn.addEventListener('click', e => {
            const index = parseInt(
              (e.target as HTMLElement).getAttribute('data-index')!,
            )
            removeTodo(index)
            updateList()
          })
        })
      }

      input.addEventListener('input', e => {
        newTodo((e.target as HTMLInputElement).value)
      })

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          addTodo()
          updateList()
          input.value = ''
        }
      })

      addBtn.addEventListener('click', () => {
        addTodo()
        updateList()
        input.value = ''
      })

      // 初始绑定删除事件
      updateList()

      return container
    }

    return render
  },
})

const App = defineComponent({
  name: 'App',
  setup() {
    const render = () => {
      const container = document.createElement('div')
      container.className = 'app'

      container.innerHTML = `
        <header>
          <h1>Zeus Framework Demo</h1>
          <p>A modern reactive framework built with Rust and TypeScript</p>
        </header>
        <main id="main-content">
          <!-- 组件将在这里渲染 -->
        </main>
        <footer>
          Built with ❤️ using Zeus Framework
        </footer>
      `

      // 渲染子组件
      const mainContent = container.querySelector(
        '#main-content',
      ) as HTMLElement

      // 创建并渲染Counter组件
      const counterComponent = Counter.setup ? Counter.setup() : Counter
      const counterElement =
        typeof counterComponent === 'function'
          ? counterComponent()
          : counterComponent
      mainContent.appendChild(counterElement as any)

      // 创建并渲染TodoApp组件
      const todoComponent = TodoApp.setup ? TodoApp.setup() : TodoApp
      const todoElement =
        typeof todoComponent === 'function' ? todoComponent() : todoComponent
      mainContent.appendChild(todoElement as any)

      return container
    }

    return render
  },
})

export default App
