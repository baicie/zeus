import { defineFunctionalWC, useState, useEffect } from '../src'

/**
 * 原生 DOM 版本的计数器组件
 * 不依赖 JSX 编译器，直接使用 DOM API
 */
function Counter(props: { initialValue?: string; step?: string }) {
  const count = useState(parseInt(props.initialValue || '0'))
  const step = parseInt(props.step || '1')

  // 创建 DOM 元素
  const container = document.createElement('div')
  container.style.cssText =
    'padding: 20px; border: 1px solid #ccc; border-radius: 8px; font-family: Arial, sans-serif;'

  const title = document.createElement('h2')
  title.style.cssText = 'margin: 0 0 16px 0; color: #333;'
  title.textContent = 'Counter Component'

  const countDisplay = document.createElement('p')
  countDisplay.style.cssText = 'font-size: 24px; margin: 0 0 16px 0;'

  const countSpan = document.createElement('strong')
  countSpan.style.cssText = 'color: #007acc;'

  const buttonContainer = document.createElement('div')
  buttonContainer.style.cssText = 'display: flex; gap: 8px;'

  // 创建按钮
  const incrementBtn = document.createElement('button')
  incrementBtn.style.cssText =
    'padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;'
  incrementBtn.textContent = `+${step}`
  incrementBtn.onclick = () => count(count() + step)

  const decrementBtn = document.createElement('button')
  decrementBtn.style.cssText =
    'padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;'
  decrementBtn.textContent = `-${step}`
  decrementBtn.onclick = () => count(count() - step)

  const resetBtn = document.createElement('button')
  resetBtn.style.cssText =
    'padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;'
  resetBtn.textContent = 'Reset'
  resetBtn.onclick = () => count(0)

  // 组装 DOM 结构
  countDisplay.appendChild(document.createTextNode('Count: '))
  countDisplay.appendChild(countSpan)

  buttonContainer.appendChild(incrementBtn)
  buttonContainer.appendChild(decrementBtn)
  buttonContainer.appendChild(resetBtn)

  container.appendChild(title)
  container.appendChild(countDisplay)
  container.appendChild(buttonContainer)

  // 响应式更新
  useEffect(() => {
    countSpan.textContent = count().toString()
  })

  return container
}

// 定义 Web Component
defineFunctionalWC('alien-counter-native', Counter, {
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
  `,
  observedAttributes: ['initial-value', 'step'],
})
