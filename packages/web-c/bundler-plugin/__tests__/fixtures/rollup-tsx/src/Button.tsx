// @ts-nocheck
// Use local stub instead of @zeus-js/runtime-dom for the integration test
import { _tmpl as tmpl } from './runtime-dom-stub'

export interface ButtonProps {
  label: string
  disabled?: boolean
}

export function Button(props: ButtonProps) {
  return tmpl`<button>${props.label}</button>`
}
