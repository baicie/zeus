import { isFunction, isObject } from '@zeusjs/shared'
import type { Component, ComponentOptions } from './component'

export function defineComponent<Props, RawBindings = object>(
  options: ComponentOptions<Props, RawBindings>
): Component<Props>

export function defineComponent<Props = {}, RawBindings = {}>(
  setup: (props: Props, ctx: SetupContext) => RawBindings | RenderFunction
): Component<Props>

export function defineComponent(options: unknown) {
  if (isFunction(options)) {
    return { setup: options }
  }

  if (isObject(options)) {
    return options as ComponentOptions
  }

  return {}
}

export interface SetupContext {
  attrs: Record<string, any>
  slots: Record<string, any>
  emit: (event: string, ...args: any[]) => void
  expose: (exposed: Record<string, any>) => void
}
