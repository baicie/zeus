import { defineFunctionalWC, useState, useEffect, jsx } from '../src'

/**
 * 计数器组件示例
 * 展示函数式 Web Component 的基本用法
 */
function Counter(props: { initialValue?: string; step?: string }) {
  const count = useState(parseInt(props.initialValue || '0'))
  const step = parseInt(props.step || '1')

  // 副作用：监听 count 变化
  useEffect(() => {
    console.log(`Count changed to: ${count()}`)
  })

  return jsx(
    'div',
    {
      style:
        'padding: 20px; border: 1px solid #ccc; border-radius: 8px; font-family: Arial, sans-serif;',
    },
    jsx(
      'h2',
      { style: 'margin: 0 0 16px 0; color: #333;' },
      'Counter Component'
    ),
    jsx(
      'p',
      { style: 'font-size: 24px; margin: 0 0 16px 0;' },
      'Count: ',
      jsx('strong', { style: 'color: #007acc;' }, count().toString())
    ),
    jsx(
      'div',
      { style: 'display: flex; gap: 8px;' },
      jsx(
        'button',
        {
          style:
            'padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;',
          onClick: () => count(count() + step),
        },
        `+${step}`
      ),
      jsx(
        'button',
        {
          style:
            'padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;',
          onClick: () => count(count() - step),
        },
        `-${step}`
      ),
      jsx(
        'button',
        {
          style:
            'padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;',
          onClick: () => count(0),
        },
        'Reset'
      )
    )
  )
}

// 定义 Web Component
defineFunctionalWC('alien-counter', Counter, {
  shadow: true,
  styles: `
    :host {
      display: block;
      margin: 10px 0;
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
