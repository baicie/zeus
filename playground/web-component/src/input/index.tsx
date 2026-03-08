// Input Web Component - 使用 props 定义
import {
  type WebComponentPropsDefinition,
  defineCustomElement,
} from '@zeus-js/web-components'

export interface InputProps {
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url'
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  value?: string
  size?: 'small' | 'medium' | 'large'
}

// 显式定义 props
const inputProps: WebComponentPropsDefinition = {
  type: {
    type: String,
    default: 'text',
  },
  placeholder: String,
  disabled: Boolean,
  readonly: Boolean,
  value: String,
  size: {
    type: String,
    default: 'medium',
  },
}

function Input(props?: InputProps): Node {
  const type = props?.type || 'text'
  const placeholder = props?.placeholder || ''
  const disabled = props?.disabled || false
  const readonly = props?.readonly || false
  const value = props?.value || ''
  const size = props?.size || 'medium'

  const sizeStyles: Record<string, string> = {
    small: 'padding: 4px 8px; font-size: 12px;',
    medium: 'padding: 8px 12px; font-size: 14px;',
    large: 'padding: 12px 16px; font-size: 16px;',
  }

  const baseStyle = [
    'display: block;',
    'width: 200px;',
    'border: 1px solid #d1d5db;',
    'border-radius: 6px;',
    'outline: none;',
    'transition: border-color 0.2s, box-shadow 0.2s;',
    sizeStyles[size],
    disabled ? 'background: #f3f4f6; cursor: not-allowed;' : '',
  ].join(' ')

  const focusStyle = [
    'display: block;',
    'width: 200px;',
    'border: 1px solid #3b82f6;',
    'border-radius: 6px;',
    'outline: none;',
    'box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);',
    'transition: border-color 0.2s, box-shadow 0.2s;',
    sizeStyles[size],
    disabled ? 'background: #f3f4f6; cursor: not-allowed;' : '',
  ].join(' ')

  return (
    <div style="display: inline-block;">
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        readonly={readonly}
        style={baseStyle}
        onFocus={(e: FocusEvent) => {
          const target = e.target as HTMLInputElement
          target.setAttribute('style', focusStyle)
        }}
        onBlur={(e: FocusEvent) => {
          const target = e.target as HTMLInputElement
          target.setAttribute('style', baseStyle)
        }}
      />
    </div>
  )
}

// 注册 Web Component
defineCustomElement(Input, {
  tagName: 'zeus-input',
  shadow: false,
  props: inputProps,
})
