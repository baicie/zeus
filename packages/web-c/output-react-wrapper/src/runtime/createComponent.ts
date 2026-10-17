import type {
  ForwardRefExoticComponent,
  HTMLAttributes,
  ReactNode,
  RefAttributes,
} from 'react'

export type EventName<T extends Event = Event> = string & {
  __eventType: T
}

type EventNames = Record<string, EventName | string>
type PropertyConfig = string[] | Record<string, string | false>

type ElementProps<I extends HTMLElement> = Partial<Omit<I, keyof HTMLElement>>

export type ReactModule = Pick<
  typeof import('react'),
  | 'createElement'
  | 'forwardRef'
  | 'useRef'
  | 'useCallback'
  | 'useEffect'
  | 'useLayoutEffect'
>

type EventListeners<E extends EventNames> = {
  [K in keyof E]?: E[K] extends EventName<infer T>
    ? (event: T) => void
    : (event: Event) => void
}

type ComponentProps<I extends HTMLElement, E extends EventNames> = Omit<
  HTMLAttributes<I>,
  keyof E | keyof ElementProps<I>
> &
  Record<string, unknown> &
  EventListeners<E> &
  ElementProps<I>

export type ZeusReactComponent<
  I extends HTMLElement,
  E extends EventNames = {},
> = ForwardRefExoticComponent<ComponentProps<I, E> & RefAttributes<I>>

export interface ZeusReactCreateComponentOptions<
  I extends HTMLElement,
  E extends EventNames,
> {
  tagName: string
  react: ReactModule
  defineCustomElement?: () => void
  elementClass?: { new (): I }
  /** Declared properties and optional reflected attribute aliases. */
  props?: PropertyConfig
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
    props: propertyConfig = [],
    slots = [],
    displayName,
  } = options
  const events: EventNames = options.events ?? {}

  const finalTagName = transformTag ? transformTag(tagName) : tagName
  const declaredProps = new Map<string, string | false>(
    Array.isArray(propertyConfig)
      ? propertyConfig.map(name => [name, false])
      : Object.entries(propertyConfig),
  )
  const registered = new WeakSet<CustomElementRegistry>()
  const slotSet = new Set(slots)
  function isProperty(key: string, node?: I | null): boolean {
    if (declaredProps.has(key)) return true
    const target = elementClass?.prototype ?? node
    return (
      target != null &&
      key in target &&
      (typeof HTMLElement === 'undefined' || !(key in HTMLElement.prototype))
    )
  }
  function getAttributeName(key: string): string | undefined {
    const configured = declaredProps.get(key)
    if (typeof configured === 'string') return configured
    return undefined
  }
  const Component = react.forwardRef<I, ComponentProps<I, E>>(
    (inputProps, ref) => {
      const props = (inputProps ?? {}) as ComponentProps<I, E>
      const propsRef = react.useRef(props)
      propsRef.current = props
      const elementRef = react.useRef<I | null>(null)
      const previousProperties = react.useRef(new Map<string, unknown>())
      const listeners = react.useRef(new Map<string, EventListener>())
      const rest: Record<string, unknown> = {}
      const slottedChildren: ReactNode[] = []

      function setProperty(node: I, key: string, value: unknown) {
        ;(node as unknown as Record<string, unknown>)[key] = value
        if (
          value == null &&
          typeof HTMLElement !== 'undefined' &&
          key in HTMLElement.prototype
        ) {
          node.removeAttribute(key)
        }
      }

      function syncProperties(node: I) {
        const next = new Map<string, unknown>()
        for (const [key, value] of Object.entries(propsRef.current)) {
          if (
            !RESERVED_PROPS.has(key) &&
            !slotSet.has(key) &&
            !Object.prototype.hasOwnProperty.call(events, key) &&
            (isProperty(key, node) || key in node)
          ) {
            if (
              !previousProperties.current.has(key) ||
              !Object.is(previousProperties.current.get(key), value)
            ) {
              setProperty(node, key, value)
            }
            next.set(key, value)
          }
        }
        for (const key of previousProperties.current.keys()) {
          if (!next.has(key)) {
            setProperty(node, key, undefined)
          }
        }
        previousProperties.current = next
      }

      function removeListeners(node: I) {
        for (const [key, listener] of listeners.current) {
          node.removeEventListener(events[key], listener)
        }
        listeners.current.clear()
      }

      function syncListeners(node: I) {
        for (const [key, name] of Object.entries(events)) {
          if (listeners.current.has(key)) continue
          const listener: EventListener = event => {
            const handler = propsRef.current[key]
            if (typeof handler === 'function') handler(event)
          }
          node.addEventListener(name, listener)
          listeners.current.set(key, listener)
        }
      }

      const setRef = react.useCallback(
        (node: I | null) => {
          if (elementRef.current) removeListeners(elementRef.current)
          elementRef.current = node
          previousProperties.current.clear()
          if (node) {
            const registry = node.ownerDocument.defaultView?.customElements
            if (defineCustomElement && registry && !registered.has(registry)) {
              defineCustomElement()
              registered.add(registry)
              registry.upgrade(node)
            }
            syncProperties(node)
            syncListeners(node)
          }
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        },
        [ref],
      )

      // SSR runs no DOM effects, including when a browser-targeted bundle is imported.
      const useCommitEffect =
        typeof window === 'undefined' ? react.useEffect : react.useLayoutEffect
      useCommitEffect(() => {
        const node = elementRef.current
        if (!node) return
        syncProperties(node)
        syncListeners(node)
        return () => removeListeners(node)
      })

      for (const key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue

        const value = (props as Record<string, unknown>)[key]
        const attributeName = getAttributeName(key)
        if (
          key === 'children' ||
          key === 'ref' ||
          Object.prototype.hasOwnProperty.call(events, key)
        ) {
          continue
        }
        if (slotSet.has(key)) {
          const child = createNamedSlot(react, key, value)
          if (child != null) slottedChildren.push(child)
          continue
        }

        const outputKey = key === 'className' ? 'class' : (attributeName ?? key)
        // Declared property-only values must never be serialized by React SSR.
        if (declaredProps.has(key) && attributeName === undefined) continue
        if (
          attributeName === undefined &&
          isProperty(key, elementRef.current)
        ) {
          continue
        }
        rest[outputKey] = value
      }

      rest.ref = setRef

      if (props.children != null) {
        slottedChildren.push(
          (props as Record<string, unknown>).children as ReactNode,
        )
      }

      return react.createElement(finalTagName, rest, ...slottedChildren)
    },
  )

  Component.displayName = displayName ?? tagName

  return Component as unknown as ZeusReactComponent<I, E>
}

const RESERVED_PROPS = new Set([
  'children',
  'localName',
  'ref',
  'style',
  'className',
])

function createNamedSlot(
  react: ReactModule,
  name: string,
  value: unknown,
): ReactNode {
  if (value == null || value === false) return null

  return react.createElement(
    'span',
    { slot: name, style: { display: 'contents' } },
    value as ReactNode,
  )
}
