# @zeus-js/zeus (./jsx) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import type { ErrorBoundary, JSXValue, RefTarget } from '@zeus-js/runtime-dom'
import type { HostProps, SlotProps } from '@zeus-js/runtime-dom'

type EventHandler<E extends Event = Event> = (event: E) => void

type PrimitiveAttr = string | number | boolean | null | undefined

type ClassValue =
  | string
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>
  | ClassValue[]

type StyleValue =
  | string
  | null
  | undefined
  | Partial<CSSStyleDeclaration>
  | Record<string, string | number | null | undefined>

type CommonDOMAttributes<T extends Element> = {
  [key: `data-${string}`]: PrimitiveAttr
  [key: `aria-${string}`]: PrimitiveAttr
  [key: `prop:${string}`]: unknown

  ref?: RefTarget<T>

  class?: ClassValue
  className?: ClassValue
  style?: StyleValue

  id?: PrimitiveAttr
  title?: PrimitiveAttr
  role?: PrimitiveAttr
  slot?: string
  part?: string
  exportparts?: string

  onClick?: EventHandler<MouseEvent>
  onDblClick?: EventHandler<MouseEvent>
  onInput?: EventHandler<InputEvent>
  onChange?: EventHandler<Event>
  onSubmit?: EventHandler<SubmitEvent>
  onKeyDown?: EventHandler<KeyboardEvent>
  onKeyUp?: EventHandler<KeyboardEvent>
  onFocus?: EventHandler<FocusEvent>
  onBlur?: EventHandler<FocusEvent>
  onKeyPress?: EventHandler<KeyboardEvent>
  onMouseDown?: EventHandler<MouseEvent>
  onMouseUp?: EventHandler<MouseEvent>
  onMouseMove?: EventHandler<MouseEvent>
  onMouseLeave?: EventHandler<MouseEvent>
  onDrag?: EventHandler<DragEvent>
  onDragEnd?: EventHandler<DragEvent>
  onDragStart?: EventHandler<DragEvent>
  onDrop?: EventHandler<DragEvent>
  onScroll?: EventHandler<Event>
  onWheel?: EventHandler<WheelEvent>
  onTouchStart?: EventHandler<TouchEvent>
  onTouchMove?: EventHandler<TouchEvent>
  onTouchEnd?: EventHandler<TouchEvent>
  onTouchCancel?: EventHandler<TouchEvent>
  onPointerDown?: EventHandler<PointerEvent>
  onPointerUp?: EventHandler<PointerEvent>
  onPointerMove?: EventHandler<PointerEvent>
  onPointerEnter?: EventHandler<PointerEvent>
  onPointerLeave?: EventHandler<PointerEvent>
  onPointerCancel?: EventHandler<PointerEvent>
  onGotPointerCapture?: EventHandler<PointerEvent>
  onLostPointerCapture?: EventHandler<PointerEvent>
  onContextMenu?: EventHandler<PointerEvent>
  onDragEnter?: EventHandler<DragEvent>
  onDragLeave?: EventHandler<DragEvent>
  onDragOver?: EventHandler<DragEvent>
  onLoad?: EventHandler<Event>
  onError?: EventHandler<Event>
  onAnimationStart?: EventHandler<AnimationEvent>
  onAnimationEnd?: EventHandler<AnimationEvent>
  onAnimationIteration?: EventHandler<AnimationEvent>
  onTransitionEnd?: EventHandler<TransitionEvent>
  onCompositionStart?: EventHandler<CompositionEvent>
  onCompositionUpdate?: EventHandler<CompositionEvent>
  onCompositionEnd?: EventHandler<CompositionEvent>
  onCancel?: EventHandler<Event>
  onClose?: EventHandler<Event>
  onToggle?: EventHandler<Event>

  children?: JSXValue
}

type HTMLAttributes<T extends HTMLElement> = CommonDOMAttributes<T> & {
  type?: string
  checked?: boolean
  value?: string | number
  placeholder?: PrimitiveAttr
  disabled?: boolean
  readonly?: boolean
  multiple?: boolean
  name?: PrimitiveAttr
  for?: PrimitiveAttr
  href?: PrimitiveAttr
  target?: PrimitiveAttr
  rel?: PrimitiveAttr
  src?: PrimitiveAttr
  alt?: PrimitiveAttr
  width?: number | string
  height?: number | string
  download?: PrimitiveAttr
  accept?: PrimitiveAttr
  maxlength?: number
  minlength?: number
  max?: number | string
  min?: number | string
  step?: number | string
  rows?: number
  cols?: number
  wrap?: PrimitiveAttr
  autofocus?: boolean
  autoplay?: boolean
  controls?: boolean
  loop?: boolean
  muted?: boolean
  preload?: PrimitiveAttr
  poster?: PrimitiveAttr
  srcset?: PrimitiveAttr
  sizes?: PrimitiveAttr
  crossorigin?: PrimitiveAttr
  defer?: boolean
  async?: boolean
  integrity?: PrimitiveAttr
  charset?: PrimitiveAttr
  'http-equiv'?: PrimitiveAttr
  content?: PrimitiveAttr
  lang?: PrimitiveAttr
  dir?: PrimitiveAttr
  spellcheck?: boolean
  translate?: boolean
  tabindex?: number
  tabIndex?: number
  accesskey?: PrimitiveAttr
  draggable?: boolean
  hidden?: boolean
  contenteditable?: boolean | 'true' | 'false' | 'plaintext-only'
  autocomplete?: PrimitiveAttr
  inputmode?: PrimitiveAttr
  enterkeyhint?: PrimitiveAttr
  pattern?: PrimitiveAttr
  required?: boolean
  form?: PrimitiveAttr
  formaction?: PrimitiveAttr
  formmethod?: PrimitiveAttr
  formenctype?: PrimitiveAttr
  formtarget?: PrimitiveAttr
  novalidate?: boolean
  method?: PrimitiveAttr
  action?: PrimitiveAttr
  enctype?: PrimitiveAttr
  selected?: boolean
  size?: number
  span?: number
  colspan?: number
  rowspan?: number
  scope?: PrimitiveAttr
  datetime?: PrimitiveAttr
  open?: boolean
  inert?: boolean
  popover?: '' | 'auto' | 'manual' | 'hint'
  loading?: 'eager' | 'lazy'
  decoding?: 'async' | 'sync' | 'auto'
  capture?: PrimitiveAttr
  is?: string
}

type SVGAttributes<T extends SVGElement> = CommonDOMAttributes<T> & {
  d?: PrimitiveAttr
  cx?: number | string
  cy?: number | string
  r?: number | string
  rx?: number | string
  ry?: number | string
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  viewBox?: PrimitiveAttr
  focusable?: boolean | 'true' | 'false' | 'auto'
  fill?: PrimitiveAttr
  stroke?: PrimitiveAttr
  'stroke-width'?: number | string
  'stroke-linecap'?: PrimitiveAttr
  'stroke-linejoin'?: PrimitiveAttr
  'stroke-dasharray'?: PrimitiveAttr
  'stroke-dashoffset'?: number | string
  'stroke-opacity'?: number | string
  'fill-opacity'?: number | string
  opacity?: number | string
  transform?: PrimitiveAttr
  points?: PrimitiveAttr
  xmlns?: string
  'xmlns:xlink'?: string
  'xlink:href'?: string
  preserveAspectRatio?: PrimitiveAttr
  offset?: number | string
  'stop-color'?: PrimitiveAttr
  'stop-opacity'?: number | string
  'fill-rule'?: PrimitiveAttr
  'clip-rule'?: PrimitiveAttr
  'clip-path'?: PrimitiveAttr
  'stroke-miterlimit'?: number | string
  'text-anchor'?: PrimitiveAttr
  'font-size'?: number | string
  x1?: number | string
  y1?: number | string
  x2?: number | string
  y2?: number | string
}

// Custom elements receive their JSX contract from component declarations.
// HTMLElementTagNameMap also contains those tags, but describes their DOM API.
type HTMLIntrinsicElements = {
  [Name in Exclude<
    keyof HTMLElementTagNameMap,
    `${string}-${string}`
  >]: HTMLAttributes<HTMLElementTagNameMap[Name]>
}

type SVGIntrinsicElements = {
  [Name in Exclude<
    keyof SVGElementTagNameMap,
    keyof HTMLElementTagNameMap
  >]: SVGAttributes<SVGElementTagNameMap[Name]>
}

/** Zeus owns this JSX namespace; importing its types never augments another framework. */
export namespace JSX {
  export type Element = JSXValue

  /** Only compiler-owned boundaries turn JSX children into a lazy factory. */
  export type LibraryManagedAttributes<Component, Props> =
    Component extends typeof ErrorBoundary
      ? Omit<Props, 'children'> & { children?: JSXValue }
      : Props

  export interface ElementChildrenAttribute {
    children: {}
  }

  export interface IntrinsicElements
    extends HTMLIntrinsicElements, SVGIntrinsicElements {
    [name: `${string}-${string}`]: Record<string, unknown> & {
      consumes?: unknown[]
    }
  }
}

export type { HostProps, SlotProps }
```
