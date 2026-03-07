/**
 * DOM Types for Zeus Framework
 *
 * Zeus uses a SolidJS-style approach where JSX compiles to direct DOM operations.
 * Components return actual DOM nodes, not virtual DOM nodes.
 */

import type * as csstype from 'csstype'

// ============================================
// Core Types
// ============================================

export type DOMElement = Element

export type JSXElement =
  | Node
  | JSXElement[]
  | string
  | number
  | boolean
  | null
  | undefined

export type Component<P = unknown> = (props: P) => JSXElement

export type ParentComponent<P = unknown> = (props: P) => JSXElement

export type ElementType = string | Component

// ============================================
// Event Types
// ============================================

export interface Events {
  // Clipboard events
  onCopy: ClipboardEvent
  onCut: ClipboardEvent
  onPaste: ClipboardEvent

  // Composition events
  onCompositionEnd: CompositionEvent
  onCompositionStart: CompositionEvent
  onCompositionUpdate: CompositionEvent

  // Focus events
  onFocus: FocusEvent
  onBlur: FocusEvent

  // Form events
  onChange: Event
  onInput: InputEvent
  onInvalid: Event
  onReset: Event
  onSubmit: Event

  // Keyboard events
  onKeyDown: KeyboardEvent
  onKeyUp: KeyboardEvent
  onKeyPress: KeyboardEvent

  // Mouse events
  onClick: MouseEvent
  onContextMenu: MouseEvent
  onDblClick: MouseEvent
  onDrag: DragEvent
  onDragEnd: DragEvent
  onDragEnter: DragEvent
  onDragLeave: DragEvent
  onDragOver: DragEvent
  onDragStart: DragEvent
  onDrop: DragEvent
  onMouseDown: MouseEvent
  onMouseEnter: MouseEvent
  onMouseLeave: MouseEvent
  onMouseMove: MouseEvent
  onMouseOut: MouseEvent
  onMouseOver: MouseEvent
  onMouseUp: MouseEvent

  // Touch events
  onTouchCancel: TouchEvent
  onTouchEnd: TouchEvent
  onTouchMove: TouchEvent
  onTouchStart: TouchEvent

  // Pointer events
  onPointerDown: PointerEvent
  onPointerEnter: PointerEvent
  onPointerLeave: PointerEvent
  onPointerMove: PointerEvent
  onPointerOut: PointerEvent
  onPointerOver: PointerEvent
  onPointerUp: PointerEvent
  onPointerCancel: PointerEvent

  // Scroll events
  onScroll: UIEvent
  onWheel: WheelEvent

  // Media events
  onAbort: Event
  onCanPlay: Event
  onCanPlayThrough: Event
  onDurationChange: Event
  onEmptied: Event
  onEncrypted: Event
  onEnded: Event
  onError: Event
  onLoadedData: Event
  onLoadedMetadata: Event
  onLoadStart: Event
  onPause: Event
  onPlay: Event
  onPlaying: Event
  onProgress: ProgressEvent
  onRateChange: Event
  onSeeked: Event
  onSeeking: Event
  onStalled: Event
  onSuspend: Event
  onTimeUpdate: Event
  onVolumeChange: Event
  onWaiting: Event

  // Animation events
  onAnimationStart: AnimationEvent
  onAnimationEnd: AnimationEvent
  onAnimationIteration: AnimationEvent

  // Transition events
  onTransitionEnd: TransitionEvent

  // Details events
  onToggle: Event

  // Message events
  onMessage: MessageEvent
  onMessageError: MessageEvent
}

/**
 * Generate event handler types from Events interface
 */
type EventHandlers<E> = {
  [K in keyof E]?: E[K] extends (...args: any) => any
    ? E[K]
    : (payload: E[K]) => void
}

/**
 * Event handler type
 */
export interface DOMEventHandler<T, E extends Event = Event> {
  (e: E & { currentTarget: T; target: DOMElement }): void
}

// ============================================
// Aria Attributes
// ============================================

export interface AriaAttributes {
  'aria-atomic'?: Booleanish
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both'
  'aria-braillelabel'?: string
  'aria-brailleroledescription'?: string
  'aria-busy'?: Booleanish
  'aria-checked'?: Booleanish | 'mixed'
  'aria-colcount'?: number
  'aria-colindex'?: number
  'aria-colindextext'?: string
  'aria-colspan'?: number
  'aria-controls'?: string
  'aria-current'?: Booleanish | 'page' | 'step' | 'location' | 'date' | 'time'
  'aria-describedby'?: string
  'aria-description'?: string
  'aria-disabled'?: Booleanish
  'aria-dropeffect'?: 'copy' | 'execute' | 'link' | 'move' | 'none' | 'popup'
  'aria-errormessage'?: string
  'aria-expanded'?: Booleanish
  'aria-flowto'?: string
  'aria-grabbed'?: Booleanish
  'aria-haspopup'?: Booleanish | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'
  'aria-hidden'?: Booleanish
  'aria-invalid'?: Booleanish | 'grammar' | 'spelling'
  'aria-keyshortcuts'?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-level'?: number
  'aria-live'?: 'off' | 'assertive' | 'polite'
  'aria-modal'?: Booleanish
  'aria-multiline'?: Booleanish
  'aria-multiselectable'?: Booleanish
  'aria-orientation'?: 'horizontal' | 'vertical' | 'unknown'
  'aria-owns'?: string
  'aria-placeholder'?: string
  'aria-posinset'?: number
  'aria-pressed'?: Booleanish | 'mixed'
  'aria-readonly'?: Booleanish
  'aria-relevant'?: 'additions' | 'additions-text' | 'all' | 'removals' | 'text'
  'aria-required'?: Booleanish
  'aria-roledescription'?: string
  'aria-rowcount'?: number
  'aria-rowindex'?: number
  'aria-rowindextext'?: string
  'aria-rowspan'?: number
  'aria-selected'?: Booleanish
  'aria-setsize'?: number
  'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other'
  'aria-valuemax'?: number
  'aria-valuemin'?: number
  'aria-valuenow'?: number
  'aria-valuetext'?: string
}

export type Booleanish = boolean | 'true' | 'false'

// ============================================
// Base Attributes
// ============================================

export interface ReservedProps {
  key?: string | number | null
  children?: JSXElement
}

export interface DOMAttributes<T = Element> extends EventHandlers<Events> {
  children?: JSXElement
  key?: string | number | null
}

export interface HTMLAttributes<T = HTMLElement>
  extends DOMAttributes<T>, AriaAttributes {
  // Standard attributes
  accessKey?: string
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  autoFocus?: boolean
  contentEditable?: Booleanish | 'plaintext-only' | 'inherit'
  dataset?: Record<string, string>
  dir?: 'ltr' | 'rtl' | 'auto'
  draggable?: Booleanish
  hidden?: boolean | 'hidden' | 'until-found'
  id?: string
  inert?: boolean
  innerText?: string
  lang?: string
  part?: string
  role?: string
  slot?: string
  spellCheck?: Booleanish
  style?: csstype.Properties | string
  tabIndex?: number
  title?: string
  translate?: 'yes' | 'no'

  // Class attributes
  class?: string | Record<string, boolean | string | number> | undefined
  className?: string | Record<string, boolean | string | number> | undefined

  // Allow any custom attribute
  [key: string]: unknown
}

// ============================================
// Element-Specific Attributes
// ============================================

export interface AnchorHTMLAttributes<
  T = HTMLAnchorElement,
> extends HTMLAttributes<T> {
  download?: string
  href?: string
  hreflang?: string
  ping?: string
  referrerPolicy?: ReferrerPolicy
  rel?: string
  target?: '_self' | '_blank' | '_parent' | '_top'
  type?: string
}

export interface AreaHTMLAttributes<
  T = HTMLAreaElement,
> extends HTMLAttributes<T> {
  alt?: string
  coords?: string
  download?: string
  href?: string
  ping?: string
  referrerPolicy?: ReferrerPolicy
  rel?: string
  shape?: 'rect' | 'circle' | 'poly' | 'default'
  target?: string
}

export type AudioHTMLAttributes<T = HTMLAudioElement> = MediaHTMLAttributes<T>

export interface BaseHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  href?: string
  target?: string
}

export interface BlockquoteHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  cite?: string
}

export interface ButtonHTMLAttributes<
  T = HTMLButtonElement,
> extends HTMLAttributes<T> {
  disabled?: boolean
  form?: string
  formAction?: string
  formEnctype?:
    | 'application/x-www-form-urlencoded'
    | 'multipart/form-data'
    | 'text/plain'
  formMethod?: 'get' | 'post'
  formNoValidate?: boolean
  formTarget?: '_self' | '_blank' | '_parent' | '_top'
  name?: string
  popoverTarget?: string
  popoverTargetAction?: 'hide' | 'show'
  type?: 'submit' | 'reset' | 'button'
  value?: string | number | readonly string[]
}

export interface CanvasHTMLAttributes<
  T = HTMLCanvasElement,
> extends HTMLAttributes<T> {
  height?: number | string
  width?: number | string
}

export interface ColHTMLAttributes<
  T = HTMLTableColElement,
> extends HTMLAttributes<T> {
  span?: number
  width?: number | string
}

export interface DataHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  value?: string | number | readonly string[]
}

export interface DelHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  cite?: string
  dateTime?: string
}

export interface DetailsHTMLAttributes<
  T = HTMLDetailsElement,
> extends HTMLAttributes<T> {
  name?: string
  open?: boolean
}

export interface DialogHTMLAttributes<
  T = HTMLDialogElement,
> extends HTMLAttributes<T> {
  open?: boolean
  returnValue?: string
}

export interface EmbedHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  height?: number | string
  src?: string
  type?: string
  width?: number | string
}

export interface FieldsetHTMLAttributes<
  T = HTMLFieldSetElement,
> extends HTMLAttributes<T> {
  disabled?: boolean
  form?: string
  name?: string
}

export interface FormHTMLAttributes<
  T = HTMLFormElement,
> extends HTMLAttributes<T> {
  acceptCharset?: string
  action?: string
  autoComplete?: string
  encoding?: 'multipart/form-data' | 'application/x-www-form-urlencoded'
  enctype?:
    | 'application/x-www-form-urlencoded'
    | 'multipart/form-data'
    | 'text/plain'
  method?: 'get' | 'post' | 'dialog'
  name?: string
  noValidate?: boolean
  target?: string
}

export interface HeadHTMLAttributes<
  T = HTMLHeadElement,
> extends HTMLAttributes<T> {
  profile?: string
}

export type HeaderHTMLAttributes<T = HTMLElement> = HTMLAttributes<T>

export type HrHTMLAttributes<T = HTMLHRElement> = HTMLAttributes<T>

export interface HtmlHTMLAttributes<
  T = HTMLHtmlElement,
> extends HTMLAttributes<T> {
  manifest?: string
  version?: string
  xmlns?: string
}

export interface IframeHTMLAttributes<
  T = HTMLIFrameElement,
> extends HTMLAttributes<T> {
  allow?: string
  allowFullScreen?: boolean
  allowPaymentRequest?: boolean
  csp?: string
  height?: number | string
  loading?: 'eager' | 'lazy'
  name?: string
  referrerPolicy?: ReferrerPolicy
  sandbox?: string
  src?: string
  srcdoc?: string
  width?: number | string
}

export interface ImgHTMLAttributes<
  T = HTMLImageElement,
> extends HTMLAttributes<T> {
  alt?: string
  crossOrigin?: 'anonymous' | 'use-credentials' | ''
  decoding?: 'async' | 'auto' | 'sync'
  fetchPriority?: 'high' | 'low' | 'auto'
  height?: number | string
  isMap?: boolean
  loading?: 'eager' | 'lazy'
  referrerPolicy?: ReferrerPolicy
  sizes?: string
  src?: string
  srcset?: string
  useMap?: string
  width?: number | string
}

export interface InputHTMLAttributes<
  T = HTMLInputElement,
> extends HTMLAttributes<T> {
  accept?: string
  alt?: string
  autoComplete?: string
  capture?: boolean | 'user' | 'environment'
  checked?: boolean
  disabled?: boolean
  form?: string
  formAction?: string
  formEnctype?: string
  formMethod?: string
  formNoValidate?: boolean
  formTarget?: string
  height?: number | string
  list?: string
  max?: number | string
  maxLength?: number
  min?: number | string
  minLength?: number
  multiple?: boolean
  name?: string
  pattern?: string
  placeholder?: string
  readOnly?: boolean
  required?: boolean
  size?: number
  src?: string
  step?: number | string
  type?: string
  useMap?: string
  value?: string | number | readonly string[]
  width?: number | string
}

export type InsHTMLAttributes<T = HTMLElement> = DelHTMLAttributes<T>

export interface LabelHTMLAttributes<
  T = HTMLLabelElement,
> extends HTMLAttributes<T> {
  form?: string
  htmlFor?: string
}

export interface LiHTMLAttributes<T = HTMLLIElement> extends HTMLAttributes<T> {
  value?: string | number | readonly string[]
}

export interface LinkHTMLAttributes<
  T = HTMLLinkElement,
> extends HTMLAttributes<T> {
  as?: string
  crossOrigin?: 'anonymous' | 'use-credentials' | ''
  fetchPriority?: 'high' | 'low' | 'auto'
  href?: string
  hreflang?: string
  integrity?: string
  media?: string
  prefetch?: string
  referrerPolicy?: ReferrerPolicy
  rel?: string
  sizes?: string
  title?: string
  type?: string
}

export interface MapHTMLAttributes<
  T = HTMLMapElement,
> extends HTMLAttributes<T> {
  name?: string
}

export type MenuHTMLAttributes<T = HTMLElement> = HTMLAttributes<T>

export interface MediaHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  autoPlay?: boolean
  controls?: boolean
  crossOrigin?: 'anonymous' | 'use-credentials' | ''
  loop?: boolean
  muted?: boolean
  preload?: 'none' | 'metadata' | 'auto' | ''
  src?: string
}

export interface MetaHTMLAttributes<
  T = HTMLMetaElement,
> extends HTMLAttributes<T> {
  charSet?: string
  content?: string
  httpEquiv?: string
  media?: string
  name?: string
}

export interface MeterHTMLAttributes<
  T = HTMLMeterElement,
> extends HTMLAttributes<T> {
  high?: number
  low?: number
  max?: number | string
  min?: number | string
  optimum?: number
  value?: string | number | readonly string[]
}

export interface ObjectHTMLAttributes<
  T = HTMLObjectElement,
> extends HTMLAttributes<T> {
  data?: string
  form?: string
  height?: number | string
  name?: string
  type?: string
  useMap?: string
  width?: number | string
}

export interface OlHTMLAttributes<
  T = HTMLOListElement,
> extends HTMLAttributes<T> {
  reversed?: boolean
  start?: number
  type?: '1' | 'a' | 'A' | 'i' | 'I'
}

export interface OptgroupHTMLAttributes<
  T = HTMLOptGroupElement,
> extends HTMLAttributes<T> {
  disabled?: boolean
  label?: string
}

export interface OptionHTMLAttributes<
  T = HTMLOptionElement,
> extends HTMLAttributes<T> {
  disabled?: boolean
  label?: string
  selected?: boolean
  value?: string | number | readonly string[]
}

export interface OutputHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  htmlFor?: string
  name?: string
}

export interface ParamHTMLAttributes<
  T = HTMLParamElement,
> extends HTMLAttributes<T> {
  name?: string
  value?: string | number | readonly string[]
}

export interface ProgressHTMLAttributes<
  T = HTMLProgressElement,
> extends HTMLAttributes<T> {
  max?: number | string
  value?: string | number | readonly string[]
}

export interface QuoteHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  cite?: string
}

export interface ScriptHTMLAttributes<
  T = HTMLScriptElement,
> extends HTMLAttributes<T> {
  async?: boolean
  crossOrigin?: 'anonymous' | 'use-credentials' | ''
  defer?: boolean
  fetchPriority?: 'high' | 'low' | 'auto'
  integrity?: string
  noModule?: boolean
  referrerPolicy?: ReferrerPolicy
  src?: string
  type?: string
}

export interface SelectHTMLAttributes<
  T = HTMLSelectElement,
> extends HTMLAttributes<T> {
  autoComplete?: string
  disabled?: boolean
  form?: string
  multiple?: boolean
  name?: string
  required?: boolean
  size?: number
  value?: string | number | readonly string[]
}

export interface SlotHTMLAttributes<
  T = HTMLSlotElement,
> extends HTMLAttributes<T> {
  name?: string
}

export interface SourceHTMLAttributes<
  T = HTMLSourceElement,
> extends HTMLAttributes<T> {
  height?: number | string
  media?: string
  sizes?: string
  src?: string
  srcset?: string
  type?: string
  width?: number | string
}

export interface StyleHTMLAttributes<
  T = HTMLStyleElement,
> extends HTMLAttributes<T> {
  media?: string
  type?: string
}

export interface TableHTMLAttributes<
  T = HTMLTableElement,
> extends HTMLAttributes<T> {
  align?: 'left' | 'center' | 'right'
  bgColor?: string
  border?: number | string
  caption?: string
  cellPadding?: number | string
  cellSpacing?: number | string
  frame?:
    | 'void'
    | 'above'
    | 'below'
    | 'hsides'
    | 'lhs'
    | 'rhs'
    | 'vsides'
    | 'box'
    | 'border'
  rules?: 'none' | 'groups' | 'rows' | 'cols' | 'all'
  summary?: string
  width?: number | string
}

export interface TdHTMLAttributes<
  T = HTMLTableCellElement,
> extends HTMLAttributes<T> {
  abbr?: string
  colSpan?: number
  headers?: string
  rowSpan?: number
  scope?: 'col' | 'colgroup' | 'row' | 'rowgroup'
}

export interface ThHTMLAttributes<
  T = HTMLTableCellElement,
> extends TdHTMLAttributes<T> {
  abbr?: string
}

export type TrHTMLAttributes<T = HTMLTableRowElement> = HTMLAttributes<T>

export interface TrackHTMLAttributes<
  T = HTMLTrackElement,
> extends HTMLAttributes<T> {
  default?: boolean
  kind?: 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata'
  label?: string
  src?: string
  srclang?: string
}

export interface TextareaHTMLAttributes<
  T = HTMLTextAreaElement,
> extends HTMLAttributes<T> {
  autoComplete?: string
  cols?: number
  dirName?: string
  disabled?: boolean
  form?: string
  maxLength?: number
  minLength?: number
  name?: string
  placeholder?: string
  readOnly?: boolean
  required?: boolean
  rows?: number
  value?: string | number | readonly string[]
  wrap?: 'hard' | 'soft' | 'off'
}

export interface TimeHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  dateTime?: string
}

export interface VideoHTMLAttributes<
  T = HTMLVideoElement,
> extends MediaHTMLAttributes<T> {
  height?: number | string
  playsInline?: boolean
  poster?: string
  src?: string
  width?: number | string
}

// ============================================
// SVG Attributes (Simplified)
// ============================================

export interface SVGAttributes<T = SVGElement> extends DOMAttributes<T> {
  // Core attributes
  id?: string
  lang?: string
  tabIndex?: number
  style?: string

  // SVG-specific
  viewBox?: string
  xmlns?: string

  // Class
  class?: string | Record<string, boolean | string | number> | undefined
  className?: string | Record<string, boolean | string | number> | undefined

  // Allow any SVG attribute
  [key: string]: unknown
}

// ============================================
// Intrinsic Elements Map
// ============================================

export interface HTMLElementTags {
  a: AnchorHTMLAttributes
  abbr: HTMLAttributes
  address: HTMLAttributes
  area: AreaHTMLAttributes
  article: HTMLAttributes
  aside: HTMLAttributes
  audio: AudioHTMLAttributes
  b: HTMLAttributes
  base: BaseHTMLAttributes
  bdi: HTMLAttributes
  bdo: HTMLAttributes
  blockquote: BlockquoteHTMLAttributes
  body: HTMLAttributes
  br: HTMLAttributes
  button: ButtonHTMLAttributes
  canvas: CanvasHTMLAttributes
  caption: HTMLAttributes
  cite: HTMLAttributes
  code: HTMLAttributes
  col: ColHTMLAttributes
  colgroup: ColHTMLAttributes
  data: DataHTMLAttributes
  datalist: HTMLAttributes
  dd: HTMLAttributes
  del: DelHTMLAttributes
  details: DetailsHTMLAttributes
  dfn: HTMLAttributes
  dialog: DialogHTMLAttributes
  div: HTMLAttributes
  dl: HTMLAttributes
  dt: HTMLAttributes
  em: HTMLAttributes
  embed: EmbedHTMLAttributes
  fieldset: FieldsetHTMLAttributes
  figcaption: HTMLAttributes
  figure: HTMLAttributes
  footer: HTMLAttributes
  form: FormHTMLAttributes
  h1: HTMLAttributes
  h2: HTMLAttributes
  h3: HTMLAttributes
  h4: HTMLAttributes
  h5: HTMLAttributes
  h6: HTMLAttributes
  head: HeadHTMLAttributes
  header: HeaderHTMLAttributes
  hgroup: HTMLAttributes
  hr: HrHTMLAttributes
  html: HtmlHTMLAttributes
  i: HTMLAttributes
  iframe: IframeHTMLAttributes
  img: ImgHTMLAttributes
  input: InputHTMLAttributes
  ins: InsHTMLAttributes
  kbd: HTMLAttributes
  label: LabelHTMLAttributes
  legend: HTMLAttributes
  li: LiHTMLAttributes
  link: LinkHTMLAttributes
  main: HTMLAttributes
  map: MapHTMLAttributes
  mark: HTMLAttributes
  menu: MenuHTMLAttributes
  meta: MetaHTMLAttributes
  meter: MeterHTMLAttributes
  nav: HTMLAttributes
  noscript: HTMLAttributes
  object: ObjectHTMLAttributes
  ol: OlHTMLAttributes
  optgroup: OptgroupHTMLAttributes
  option: OptionHTMLAttributes
  output: OutputHTMLAttributes
  p: HTMLAttributes
  picture: HTMLAttributes
  pre: HTMLAttributes
  progress: ProgressHTMLAttributes
  q: QuoteHTMLAttributes
  rp: HTMLAttributes
  rt: HTMLAttributes
  ruby: HTMLAttributes
  s: HTMLAttributes
  samp: HTMLAttributes
  script: ScriptHTMLAttributes
  section: HTMLAttributes
  select: SelectHTMLAttributes
  slot: SlotHTMLAttributes
  small: HTMLAttributes
  source: SourceHTMLAttributes
  span: HTMLAttributes
  strong: HTMLAttributes
  style: StyleHTMLAttributes
  sub: HTMLAttributes
  summary: HTMLAttributes
  sup: HTMLAttributes
  table: TableHTMLAttributes
  tbody: HTMLAttributes
  td: TdHTMLAttributes
  template: HTMLAttributes
  textarea: TextareaHTMLAttributes
  tfoot: HTMLAttributes
  th: ThHTMLAttributes
  thead: HTMLAttributes
  time: TimeHTMLAttributes
  title: HTMLAttributes
  tr: TrHTMLAttributes
  track: TrackHTMLAttributes
  u: HTMLAttributes
  ul: HTMLAttributes
  var: HTMLAttributes
  video: VideoHTMLAttributes
  wbr: HTMLAttributes
}

export interface SVGElementTags {
  svg: SVGAttributes
  g: SVGAttributes
  defs: SVGAttributes
  desc: SVGAttributes
  symbol: SVGAttributes
  use: SVGAttributes
  path: SVGAttributes
  rect: SVGAttributes
  circle: SVGAttributes
  ellipse: SVGAttributes
  line: SVGAttributes
  polyline: SVGAttributes
  polygon: SVGAttributes
  text: SVGAttributes
  tspan: SVGAttributes
  textPath: SVGAttributes
  clipPath: SVGAttributes
  filter: SVGAttributes
  linearGradient: SVGAttributes
  radialGradient: SVGAttributes
  stop: SVGAttributes
  marker: SVGAttributes
  pattern: SVGAttributes
  mask: SVGAttributes
  image: SVGAttributes
  switch: SVGAttributes
  foreignObject: SVGAttributes
}

export type IntrinsicElements = HTMLElementTags & SVGElementTags

// ============================================
// JSX Namespace for TypeScript
// ============================================

declare global {
  namespace JSX {
    interface ElementChildrenAttribute {
      children: {}
    }
    interface IntrinsicAttributes {
      key?: string | number | null
    }
    interface IntrinsicElements extends HTMLElementTags, SVGElementTags {}
  }
}
