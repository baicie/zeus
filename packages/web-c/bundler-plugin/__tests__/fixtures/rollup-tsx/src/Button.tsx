import { type ButtonProps } from './types'

export function Button(props: ButtonProps) {
  return <button disabled={props.disabled}>{props.label}</button>
}
