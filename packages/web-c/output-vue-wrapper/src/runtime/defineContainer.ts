// packages/web-c/output-vue-wrapper/src/runtime/defineContainer.ts

import {
  cloneVNode,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  withDirectives,
} from 'vue'

const EMPTY_PROP = Symbol()
const DEFAULT_EMPTY_PROP = { default: EMPTY_PROP }
const UPDATE_MODEL_VALUE_EVENT = 'update:modelValue'
const MODEL_VALUE = 'modelValue'

export interface ZeusVueModelOptions {
  prop: string
  event: string | string[]
  eventPath?: string
}

export interface ZeusVueContainerOptions {
  tagName: string
  displayName?: string
  defineCustomElement?: () => void
  props?: string[]
  events?: string[]
  slots?: string[]
  model?: ZeusVueModelOptions
  transformTag?: (tagName: string) => string
}

export function defineContainer(options: ZeusVueContainerOptions) {
  const {
    tagName,
    displayName,
    defineCustomElement,
    props: componentProps = [],
    events: emitProps = [],
    slots: slotNames = [],
    model,
    transformTag,
  } = options

  defineCustomElement?.()

  const emits = [...emitProps]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const componentPropsMap: Record<string, any> = {}
  for (const prop of componentProps) {
    componentPropsMap[prop] = DEFAULT_EMPTY_PROP
  }

  if (model) {
    const updateEvent = getModelUpdateEvent(model.prop)
    emits.push(updateEvent)
    if (updateEvent !== UPDATE_MODEL_VALUE_EVENT) {
      emits.push(UPDATE_MODEL_VALUE_EVENT)
    }
    componentPropsMap[MODEL_VALUE] = DEFAULT_EMPTY_PROP
  }

  return defineComponent(
    (propsValue, { attrs, slots: allSlots, emit }) => {
      const containerRef = ref<HTMLElement>()
      const listeners: Array<{
        eventName: string
        listener: EventListener
      }> = []

      onMounted(() => {
        const el = containerRef.value
        if (!el) return

        for (const eventName of emitProps) {
          const listener = (event: Event) => {
            emit(eventName, event)
          }

          el.addEventListener(eventName, listener)
          listeners.push({ eventName, listener })
        }
      })

      onBeforeUnmount(() => {
        const el = containerRef.value
        if (!el) return

        for (const item of listeners) {
          el.removeEventListener(item.eventName, item.listener)
        }

        listeners.length = 0
      })

      const vModelDirective = {
        created: (el: HTMLElement) => {
          if (!model) return

          for (const eventName of toArray(model.event)) {
            el.addEventListener(eventName, event => {
              if ((event.target as HTMLElement).tagName !== el.tagName) {
                return
              }

              const value = readEventPath(
                event,
                model.eventPath ?? `target.${model.prop}`,
              )

              emit(getModelUpdateEvent(model.prop), value)

              if (
                (propsValue as Record<string, unknown>)[MODEL_VALUE] !==
                EMPTY_PROP
              ) {
                emit(UPDATE_MODEL_VALUE_EVENT, value)
              }
            })
          }
        },
      }

      return () => {
        const propsToAdd: Record<string, unknown> = {
          ref: containerRef,
        }

        for (const key in propsValue) {
          const value = (propsValue as Record<string, unknown>)[key]

          if (value !== EMPTY_PROP) {
            propsToAdd[key] = value
          }
        }

        for (const key in attrs) {
          propsToAdd[key] = attrs[key]
        }

        if (model) {
          const modelValue = (propsValue as Record<string, unknown>)[
            MODEL_VALUE
          ]
          const modelPropValue = (propsValue as Record<string, unknown>)[
            model.prop
          ]

          if (modelValue !== EMPTY_PROP) {
            propsToAdd[model.prop] = modelValue
          } else if (modelPropValue !== EMPTY_PROP) {
            propsToAdd[model.prop] = modelPropValue
          }
        }

        const children = createChildren(allSlots, slotNames)
        const finalTagName = transformTag ? transformTag(tagName) : tagName
        const node = h(finalTagName, propsToAdd, children)

        return model ? withDirectives(node, [[vModelDirective]]) : node
      }
    },
    {
      name: displayName ?? tagName,
      props: componentPropsMap,
      emits,
    },
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createChildren(slots: Record<string, any>, slotNames: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = slots.default ? slots.default() : []

  for (const name of slotNames) {
    const slot = slots[name]
    if (!slot) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const vnode of slot() as any[]) {
      children.push(withSlot(name, vnode))
    }
  }

  return children
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSlot(name: string, vnode: any) {
  if (!vnode) return vnode

  if (typeof vnode === 'string') {
    return h('span', { slot: name, style: 'display: contents' }, vnode)
  }

  return cloneVNode(vnode, { slot: name })
}

function getModelUpdateEvent(prop: string): string {
  return `update:${prop}`
}

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

function readEventPath(event: Event, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value == null) return undefined
    return (value as Record<string, unknown>)[key]
  }, event)
}
