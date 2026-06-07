import { createComponent as createLitComponent } from './litCreateComponent.js'

export type EventName<T extends Event = Event> = string & {
  __eventType: T
}

type EventNames = Record<string, EventName | string>

type ElementProps<I extends HTMLElement> = Partial<Omit<I, keyof HTMLElement>>

type ReactRef<I extends HTMLElement> =
  | ((instance: I | null) => void)
  | { current: I | null }
  | null

export interface ReactModule {
  createElement: (...args: unknown[]) => unknown
  forwardRef: (...args: unknown[]) => unknown
}

type EventListeners<E extends EventNames> = {
  [K in keyof E]?: E[K] extends EventName<infer T>
    ? (event: T) => void
    : (event: Event) => void
}

type ComponentProps<I extends HTMLElement, E extends EventNames> = {
  children?: unknown
  className?: string
  ref?: ReactRef<I>
  style?: unknown
} & {
  [key: string]: unknown
} & EventListeners<E> &
  ElementProps<I>

export type ZeusReactComponent<
  I extends HTMLElement,
  E extends EventNames = {},
> = (props: ComponentProps<I, E>) => unknown

export interface ZeusReactCreateComponentOptions<
  I extends HTMLElement,
  E extends EventNames,
> {
  tagName: string
  react: ReactModule
  defineCustomElement?: () => void
  elementClass?: { new (): I }
  events?: E
  slots?: string[]
  displayName?: string
  transformTag?: (tagName: string) => string
}

export function createComponent<
  I extends HTMLElement,
  E extends EventNames = {},
>(options: ZeusReactCreateComponentOptions<I, E>): ZeusReactComponent<I, E> {
  const {
    defineCustomElement,
    react,
    tagName,
    transformTag,
    elementClass,
    events = {},
    slots = [],
    displayName,
  } = options

  const finalTagName = transformTag ? transformTag(tagName) : tagName
  defineCustomElement?.()

  const resolvedClass =
    elementClass ??
    (typeof customElements === 'undefined'
      ? HTMLElement
      : (customElements.get(finalTagName) ?? HTMLElement))

  const LitComponent = createLitComponent({
    react,
    tagName: finalTagName,
    elementClass: resolvedClass as { new (): I },
    events,
    displayName,
  })

  if (!slots.length) {
    return LitComponent as unknown as ZeusReactComponent<I, E>
  }

  const slotSet = new Set(slots)
  const Component = react.forwardRef(
    (inputProps: ComponentProps<I, E> | null | undefined, ref: ReactRef<I>) => {
      const rest: Record<string, unknown> = {}
      const slottedChildren: unknown[] = []

      if (inputProps == null) {
        rest.ref = ref
        return react.createElement(LitComponent, rest)
      }

      const props = inputProps

      for (const key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue

        const value = (props as Record<string, unknown>)[key]
        if (slotSet.has(key)) {
          const child = createNamedSlot(react, key, value)
          if (child != null) slottedChildren.push(child)
          continue
        }

        rest[key] = value
      }

      rest.ref = ref

      if (props.children != null) {
        slottedChildren.push(props.children)
      }

      return react.createElement(LitComponent, rest, ...slottedChildren)
    },
  )

  return Component as unknown as ZeusReactComponent<I, E>
}

function createNamedSlot(
  react: ReactModule,
  name: string,
  value: unknown,
): unknown {
  if (value == null || value === false) return null

  return react.createElement(
    'span',
    { slot: name, style: { display: 'contents' } },
    value,
  )
}
