/* eslint-disable no-unused-vars */
import type { JSXValue, RefTarget } from '@zeus-js/runtime-dom'
import type { HostProps, SlotProps } from '@zeus-js/runtime-dom'

type EventHandler<E extends Event = Event> = (event: E) => void

type PrimitiveAttr = string | number | boolean | null | undefined
type MaybeGetter<T> = T | (() => T)
type ReactiveAttr = MaybeGetter<PrimitiveAttr>

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

  class?: MaybeGetter<ClassValue>
  className?: MaybeGetter<ClassValue>
  style?: MaybeGetter<StyleValue>

  id?: ReactiveAttr
  title?: ReactiveAttr
  role?: ReactiveAttr

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
  [key: `data-${string}`]: ReactiveAttr
  [key: `aria-${string}`]: ReactiveAttr
  [key: `prop:${string}`]: unknown
  [key: string]: unknown
  type?: string
  checked?: MaybeGetter<boolean | undefined>
  value?: MaybeGetter<string | number | undefined>
  placeholder?: ReactiveAttr
  disabled?: MaybeGetter<boolean | undefined>
  readonly?: MaybeGetter<boolean | undefined>
  multiple?: MaybeGetter<boolean | undefined>
  name?: ReactiveAttr
  for?: ReactiveAttr
  href?: ReactiveAttr
  target?: ReactiveAttr
  rel?: ReactiveAttr
  src?: ReactiveAttr
  alt?: ReactiveAttr
  width?: MaybeGetter<number | string | undefined>
  height?: MaybeGetter<number | string | undefined>
  download?: ReactiveAttr
  accept?: ReactiveAttr
  maxlength?: MaybeGetter<number | undefined>
  minlength?: MaybeGetter<number | undefined>
  max?: MaybeGetter<number | string | undefined>
  min?: MaybeGetter<number | string | undefined>
  step?: MaybeGetter<number | string | undefined>
  rows?: MaybeGetter<number | undefined>
  cols?: MaybeGetter<number | undefined>
  wrap?: ReactiveAttr
  autofocus?: MaybeGetter<boolean | undefined>
  autoplay?: MaybeGetter<boolean | undefined>
  controls?: MaybeGetter<boolean | undefined>
  loop?: MaybeGetter<boolean | undefined>
  muted?: MaybeGetter<boolean | undefined>
  preload?: ReactiveAttr
  poster?: ReactiveAttr
  srcset?: ReactiveAttr
  sizes?: ReactiveAttr
  crossorigin?: ReactiveAttr
  defer?: MaybeGetter<boolean | undefined>
  async?: MaybeGetter<boolean | undefined>
  integrity?: ReactiveAttr
  charset?: ReactiveAttr
  'http-equiv'?: ReactiveAttr
  content?: ReactiveAttr
  lang?: ReactiveAttr
  dir?: ReactiveAttr
  spellcheck?: MaybeGetter<boolean | undefined>
  translate?: MaybeGetter<boolean | undefined>
  tabindex?: MaybeGetter<number | undefined>
  accesskey?: ReactiveAttr
  draggable?: MaybeGetter<boolean | undefined>
  hidden?: MaybeGetter<boolean | undefined>
  contenteditable?: MaybeGetter<boolean | undefined>
}

type SVGAttributes<T extends SVGElement> = CommonDOMAttributes<T> & {
  [key: string]: unknown
  d?: ReactiveAttr
  cx?: MaybeGetter<number | string | undefined>
  cy?: MaybeGetter<number | string | undefined>
  r?: MaybeGetter<number | string | undefined>
  rx?: MaybeGetter<number | string | undefined>
  ry?: MaybeGetter<number | string | undefined>
  x?: MaybeGetter<number | string | undefined>
  y?: MaybeGetter<number | string | undefined>
  width?: MaybeGetter<number | string | undefined>
  height?: MaybeGetter<number | string | undefined>
  viewBox?: ReactiveAttr
  fill?: ReactiveAttr
  stroke?: ReactiveAttr
  'stroke-width'?: MaybeGetter<number | string | undefined>
  'stroke-linecap'?: ReactiveAttr
  'stroke-linejoin'?: ReactiveAttr
  'stroke-dasharray'?: ReactiveAttr
  'stroke-dashoffset'?: MaybeGetter<number | string | undefined>
  'stroke-opacity'?: MaybeGetter<number | string | undefined>
  'fill-opacity'?: MaybeGetter<number | string | undefined>
  opacity?: MaybeGetter<number | string | undefined>
  transform?: ReactiveAttr
  points?: ReactiveAttr
  x1?: MaybeGetter<number | string | undefined>
  y1?: MaybeGetter<number | string | undefined>
  x2?: MaybeGetter<number | string | undefined>
  y2?: MaybeGetter<number | string | undefined>
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

      slot: HTMLAttributes<HTMLSlotElement> & {
        name?: string
      }

      [name: string]: Record<string, unknown> & {
        consumes?: unknown[]
      }
    }
  }
}

export type { HostProps, SlotProps }
