import { isFunction } from '@zeus/shared'

export interface Component {
  render(): any
}

export function defineComponent(options: any): Component {
  return {
    render() {
      return isFunction(options.render) ? options.render() : null
    },
  }
}
