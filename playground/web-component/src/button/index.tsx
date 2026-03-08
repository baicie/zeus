// Button Web Component - 使用 props 定义
import {
  type WebComponentEmitsDefinition,
  type WebComponentExposeDefinition,
  type WebComponentPropsDefinition,
  defineWebComponent,
} from '@zeus-js/web-components'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
  children?: any
}

// 显式定义 props（类似 Vue3 defineComponent）
const buttonProps: WebComponentPropsDefinition = {
  // 简写形式：类型 + 默认值
  variant: {
    type: String,
    default: 'primary',
  },
  size: {
    type: String,
    default: 'medium',
  },
  // Boolean 类型：没有属性时为 false，有属性时为 true
  disabled: Boolean,
  loading: Boolean,
  type: {
    type: String,
    default: 'button',
  },
}

// 定义自定义事件
const buttonEmits: WebComponentEmitsDefinition = {
  // 简单形式：事件名
  click: undefined,
  // 带验证的形式
  custom: (val: any) => typeof val === 'string',
}

// 定义暴露的方法
const buttonExpose: WebComponentExposeDefinition = {
  // 暴露一个函数
  focus: function (props: ButtonProps, element: HTMLElement) {
    return function () {
      console.log('Button focused!')
      // 可以触发自定义事件
      element.dispatchEvent(new CustomEvent('focused', { bubbles: true }))
    }
  },
  // 直接暴露 props 中的值
  // 'variant',
}

function Button(
  props?: ButtonProps & {
    emits?: (event: string, data?: any) => void
    expose?: Record<string, any>
  },
): Node {
  const variant = props?.variant || 'primary'
  const size = props?.size || 'medium'
  const disabled = props?.disabled || false
  const loading = props?.loading || false
  const type = props?.type || 'button'
  const emits = props?.emits
  const expose = props?.expose

  const sizeStyles: Record<string, string> = {
    small: 'padding: 4px 12px; font-size: 12px;',
    medium: 'padding: 8px 16px; font-size: 14px;',
    large: 'padding: 12px 24px; font-size: 16px;',
  }

  const variantStyles: Record<string, string> = {
    primary: 'background: #3b82f6; color: white; border: none;',
    secondary: 'background: #6b7280; color: white; border: none;',
    danger: 'background: #ef4444; color: white; border: none;',
    ghost:
      'background: transparent; color: #3b82f6; border: 1px solid #3b82f6;',
  }

  const buttonStyle = [
    'display: inline-flex;',
    'align-items: center;',
    'justify-content: center;',
    'gap: 8px;',
    'border-radius: 6px;',
    'cursor: pointer;',
    'font-weight: 500;',
    'transition: all 0.2s;',
    variantStyles[variant],
    sizeStyles[size],
    disabled || loading ? 'opacity: 0.6; cursor: not-allowed;' : '',
  ].join(' ')

  const handleClick = (e: MouseEvent) => {
    if (disabled || loading) return

    // 触发自定义事件
    if (emits) {
      emits('click', { timestamp: Date.now() })
    }
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      style={buttonStyle}
      onClick={handleClick}
    >
      {loading ? 'Loading...' : props?.children}
    </button>
  )
}

// 注册 Web Component - 只需传入 props 定义
defineWebComponent(Button, {
  tagName: 'zeus-button',
  shadow: false,
  props: buttonProps,
  emits: buttonEmits,
  expose: buttonExpose,
})
