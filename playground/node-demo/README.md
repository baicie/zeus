# Zeus Node.js Demo - TSX 编译演示

这个演示项目展示了如何使用 `@zeus-js/compiler-core` 在 Node.js 环境中编译 TSX 文件。

## 目录结构 / Directory Structure

```
node-demo/
├── tsx/                    # 源 TSX 文件 / Source TSX files
│   ├── SimpleComponent.tsx
│   ├── NestedComponent.tsx
│   ├── ComponentWithProps.tsx
│   └── ListComponent.tsx
├── dist/                   # 编译输出目录 / Compiled output directory
├── build.ts               # 编译脚本 / Build script
├── package.json
└── README.md
```

## 使用方法 / Usage

### 1. 安装依赖 / Install dependencies

```bash
pnpm install
```

### 2. 编译 TSX 文件 / Compile TSX files

```bash
pnpm build
```

### 3. 查看编译结果 / View compilation results

编译后的文件会输出到 `dist/` 目录中。

## TSX 文件示例 / TSX File Examples

### SimpleComponent.tsx

```tsx
const SimpleComponent = () => {
  return <div>Hello World</div>
}
```

### NestedComponent.tsx

```tsx
const NestedComponent = () => {
  return (
    <div className="container">
      <h1>Title</h1>
      <p>Some content here</p>
    </div>
  )
}
```

### ComponentWithProps.tsx

```tsx
interface ButtonProps {
  text: string
  disabled?: boolean
}

const ButtonComponent = ({ text, disabled = false }: ButtonProps) => {
  return <button disabled={disabled}>{text}</button>
}
```

## 编译结果 / Compilation Results

编译器会将 TSX 转换为直接的 DOM 操作代码，完全无虚拟DOM。以下是各个文件的编译结果：

### SimpleComponent.tsx → SimpleComponent.js

```tsx
const SimpleComponent = () => {
  return <div>Hello World</div>
}
```

编译为 / Compiles to:

```javascript
const SimpleComponent = () => {
  // JSX: <div>Hello World</div>
  const element = document.createElement('div')
  element.textContent = 'Hello World'
  return element
}

export default SimpleComponent
```

### NestedComponent.tsx → NestedComponent.js

```tsx
const NestedComponent = () => {
  return (
    <div className="container">
      <h1>Title</h1>
      <p>Some content here</p>
      <span>More text</span>
    </div>
  )
}
```

编译为 / Compiles to:

```javascript
const NestedComponent = () => {
  // 创建容器元素 / Create container element
  const container = document.createElement('div')
  container.className = 'container'

  // 创建标题元素 / Create title element
  const title = document.createElement('h1')
  title.textContent = 'Title'
  container.appendChild(title)

  // 创建段落元素 / Create paragraph element
  const paragraph = document.createElement('p')
  paragraph.textContent = 'Some content here'
  container.appendChild(paragraph)

  // 创建span元素 / Create span element
  const span = document.createElement('span')
  span.textContent = 'More text'
  container.appendChild(span)

  return container
}

export default NestedComponent
```

### ComponentWithProps.tsx → ComponentWithProps.js

```tsx
const ComponentWithProps = () => {
  return (
    <div>
      <ButtonComponent text="Click me" />
      <ButtonComponent text="Disabled" disabled={true} />
    </div>
  )
}
```

编译为 / Compiles to:

```javascript
const ComponentWithProps = () => {
  // 创建容器 / Create container
  const container = document.createElement('div')

  // 创建第一个按钮 / Create first button
  const button1 = document.createElement('button')
  button1.textContent = 'Click me'
  container.appendChild(button1)

  // 创建禁用的按钮 / Create disabled button
  const button2 = document.createElement('button')
  button2.textContent = 'Disabled'
  button2.disabled = true
  container.appendChild(button2)

  return container
}

export default ComponentWithProps
```

### ListComponent.tsx → ListComponent.js

```tsx
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
```

编译为 / Compiles to:

```javascript
const ListComponent = () => {
  const items = ['Apple', 'Banana', 'Orange']

  // 创建列表容器 / Create list container
  const ul = document.createElement('ul')

  // 为每个项目创建列表项 / Create list item for each item
  items.forEach(item => {
    const li = document.createElement('li')
    li.textContent = item
    ul.appendChild(li)
  })

  return ul
}

export default ListComponent
```

## 注意事项 / Notes

- 当前编译器实现是基础版本，只支持简单的 JSX 转换
- 复杂的 JSX 语法（如组件嵌套、事件处理等）可能需要进一步开发
- 这是一个演示项目，用于展示编译器的基本功能
