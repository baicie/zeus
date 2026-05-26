/* eslint-disable no-unused-vars */
import type { JSXValue, RefTarget } from '@zeus-js/runtime-dom'
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
  ref?: RefTarget<T>

  class?: ClassValue
  className?: ClassValue
  style?: StyleValue

  id?: PrimitiveAttr
  title?: PrimitiveAttr
  role?: PrimitiveAttr

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

  children?: JSXValue
}

type HTMLAttributes<T extends HTMLElement> = CommonDOMAttributes<T> & {
  [key: `data-${string}`]: PrimitiveAttr
  [key: `aria-${string}`]: PrimitiveAttr
  [key: `prop:${string}`]: unknown
  type?: string
  checked?: boolean
  value?: string | number
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  multiple?: boolean
  name?: string
  for?: string
  href?: string
  target?: string
  rel?: string
  src?: string
  alt?: string
  width?: number | string
  height?: number | string
  download?: string
  accept?: string
  maxlength?: number
  minlength?: number
  max?: number | string
  min?: number | string
  step?: number | string
  rows?: number
  cols?: number
  wrap?: string
  autofocus?: boolean
  autoplay?: boolean
  controls?: boolean
  loop?: boolean
  muted?: boolean
  preload?: string
  poster?: string
  srcset?: string
  sizes?: string
  crossorigin?: string
  defer?: boolean
  async?: boolean
  integrity?: string
  charset?: string
  'http-equiv'?: string
  content?: string
  lang?: string
  dir?: string
  spellcheck?: boolean
  translate?: boolean
  tabindex?: number
  accesskey?: string
  draggable?: boolean
  hidden?: boolean
  contenteditable?: boolean
}

type SVGAttributes<T extends SVGElement> = CommonDOMAttributes<T> & {
  [key: string]: unknown
  d?: string
  cx?: number | string
  cy?: number | string
  r?: number | string
  rx?: number | string
  ry?: number | string
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  viewBox?: string
  fill?: string
  stroke?: string
  'stroke-width'?: number | string
  'stroke-linecap'?: string
  'stroke-linejoin'?: string
  'stroke-dasharray'?: string
  'stroke-dashoffset'?: number | string
  'stroke-opacity'?: number | string
  'fill-opacity'?: number | string
  opacity?: number | string
  transform?: string
  points?: string
  x1?: number | string
  y1?: number | string
  x2?: number | string
  y2?: number | string
}

declare global {
  namespace JSX {
    type Element = JSXValue

    interface ElementChildrenAttribute {
      children: {}
    }

    interface IntrinsicElements {
      div: HTMLAttributes<HTMLDivElement>
      span: HTMLAttributes<HTMLSpanElement>
      p: HTMLAttributes<HTMLParagraphElement>
      a: HTMLAttributes<HTMLAnchorElement>
      button: HTMLAttributes<HTMLButtonElement>
      input: HTMLAttributes<HTMLInputElement>
      textarea: HTMLAttributes<HTMLTextAreaElement>
      select: HTMLAttributes<HTMLSelectElement>
      option: HTMLAttributes<HTMLOptionElement>
      form: HTMLAttributes<HTMLFormElement>
      label: HTMLAttributes<HTMLLabelElement>
      ul: HTMLAttributes<HTMLUListElement>
      ol: HTMLAttributes<HTMLOListElement>
      li: HTMLAttributes<HTMLLIElement>
      h1: HTMLAttributes<HTMLHeadingElement>
      h2: HTMLAttributes<HTMLHeadingElement>
      h3: HTMLAttributes<HTMLHeadingElement>
      h4: HTMLAttributes<HTMLHeadingElement>
      h5: HTMLAttributes<HTMLHeadingElement>
      h6: HTMLAttributes<HTMLHeadingElement>
      img: HTMLAttributes<HTMLImageElement>
      video: HTMLAttributes<HTMLVideoElement>
      audio: HTMLAttributes<HTMLAudioElement>
      canvas: HTMLAttributes<HTMLCanvasElement>
      table: HTMLAttributes<HTMLTableElement>
      tbody: HTMLAttributes<HTMLTableSectionElement>
      thead: HTMLAttributes<HTMLTableSectionElement>
      tr: HTMLAttributes<HTMLTableRowElement>
      td: HTMLAttributes<HTMLTableCellElement>
      th: HTMLAttributes<HTMLTableCellElement>

      svg: SVGAttributes<SVGSVGElement>
      path: SVGAttributes<SVGPathElement>
      circle: SVGAttributes<SVGCircleElement>
      rect: SVGAttributes<SVGRectElement>
      line: SVGAttributes<SVGLineElement>
      ellipse: SVGAttributes<SVGEllipseElement>
      polyline: SVGAttributes<SVGPolylineElement>
      polygon: SVGAttributes<SVGPolygonElement>
      g: SVGAttributes<SVGGElement>

      slot: HTMLAttributes<HTMLSlotElement>

      [name: string]: Record<string, unknown>
    }
  }
}

export type { HostProps, SlotProps }
