import {
  button,
  defineFunctionalWC,
  div,
  h2,
  p,
  span,
  useEffect,
  useState,
} from '../src'

/**
 * 使用 DOM 辅助函数的计数器组件
 * 更简洁的 DOM 创建方式
 */
function Counter(props: { initialValue?: string; step?: string }) {
  const count = useState(parseInt(props.initialValue || '0'))
  const step = parseInt(props.step || '1')

  // 使用 DOM 辅助函数创建元素
  const countSpan = span({
    styles: { color: '#007acc' },
    textContent: count().toString(),
  })

  const container = div({
    styles: {
      padding: '20px',
      border: '1px solid #ccc',
      borderRadius: '8px',
      fontFamily: 'Arial, sans-serif',
    },
    children: [
      h2({
        styles: { margin: '0 0 16px 0', color: '#333' },
        textContent: 'Counter Component',
      }),
      p({
        styles: { fontSize: '24px', margin: '0 0 16px 0' },
        children: ['Count: ', countSpan],
      }),
      div({
        styles: { display: 'flex', gap: '8px' },
        children: [
          button({
            styles: {
              padding: '8px 16px',
              background: '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
            textContent: `+${step}`,
            events: {
              click: () => count(count() + step),
            },
          }),
          button({
            styles: {
              padding: '8px 16px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
            textContent: `-${step}`,
            events: {
              click: () => count(count() - step),
            },
          }),
          button({
            styles: {
              padding: '8px 16px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
            textContent: 'Reset',
            events: {
              click: () => count(0),
            },
          }),
        ],
      }),
    ],
  })

  // 响应式更新
  useEffect(() => {
    countSpan.textContent = count().toString()
  })

  return container
}

// 定义 Web Component
defineFunctionalWC('alien-counter-dom-helper', Counter, {
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
