/**
 * DOM Types for Zeus Framework
 *
 * Zeus uses a SolidJS-style approach where JSX compiles to direct DOM operations.
 * Components return actual DOM nodes, not virtual DOM nodes.
 */

import type * as csstype from 'csstype'

/**
 * Common DOM element type
 */
export type DOMElement = Element

/**
 * JSX Element - can be Node, array of elements, string, number, boolean, or null/undefined
 */
export type JSXElement =
  | Node
  | JSXElement[]
  | string
  | number
  | boolean
  | null
  | undefined

/**
 * Function component type
 */
export type Component<P = unknown> = (props: P) => JSXElement

/**
 * Parent component - can return any valid child node type
 */
export type ParentComponent<P = unknown> = (props: P) => JSXElement

/**
 * Element type - HTML tag name or Component
 */
export type ElementType = string | Component

/**
 * Reserved props
 */
export interface ReservedProps {
  key?: string | number | null
  children?: JSXElement
}

/**
 * Event handler type
 */
export interface DOMEventHandler<T, E extends Event = Event> {
  (e: E & { currentTarget: T; target: DOMElement }): void
}

/**
 * Common DOM attributes
 */
export interface DOMAttributes<T = Element> {
  children?: JSXElement
  key?: string | number | null

  // Clipboard events
  onCopy?: DOMEventHandler<T, ClipboardEvent>
  onCut?: DOMEventHandler<T, ClipboardEvent>
  onPaste?: DOMEventHandler<T, ClipboardEvent>

  // Composition events
  onCompositionEnd?: DOMEventHandler<T, CompositionEvent>
  onCompositionStart?: DOMEventHandler<T, CompositionEvent>
  onCompositionUpdate?: DOMEventHandler<T, CompositionEvent>

  // Focus events
  onFocus?: DOMEventHandler<T, FocusEvent>
  onBlur?: DOMEventHandler<T, FocusEvent>

  // Form events
  onChange?: DOMEventHandler<T, Event>
  onInput?: DOMEventHandler<T, Event>
  onInvalid?: DOMEventHandler<T, Event>
  onReset?: DOMEventHandler<T, Event>
  onSubmit?: DOMEventHandler<T, Event>

  // Keyboard events
  onKeyDown?: DOMEventHandler<T, KeyboardEvent>
  onKeyUp?: DOMEventHandler<T, KeyboardEvent>
  onKeyPress?: DOMEventHandler<T, KeyboardEvent>

  // Mouse events
  onClick?: DOMEventHandler<T, MouseEvent>
  onContextMenu?: DOMEventHandler<T, MouseEvent>
  onDblClick?: DOMEventHandler<T, MouseEvent>
  onDrag?: DOMEventHandler<T, DragEvent>
  onDragEnd?: DOMEventHandler<T, DragEvent>
  onDragEnter?: DOMEventHandler<T, DragEvent>
  onDragLeave?: DOMEventHandler<T, DragEvent>
  onDragOver?: DOMEventHandler<T, DragEvent>
  onDragStart?: DOMEventHandler<T, DragEvent>
  onDrop?: DOMEventHandler<T, DragEvent>
  onMouseDown?: DOMEventHandler<T, MouseEvent>
  onMouseEnter?: DOMEventHandler<T, MouseEvent>
  onMouseLeave?: DOMEventHandler<T, MouseEvent>
  onMouseMove?: DOMEventHandler<T, MouseEvent>
  onMouseOut?: DOMEventHandler<T, MouseEvent>
  onMouseOver?: DOMEventHandler<T, MouseEvent>
  onMouseUp?: DOMEventHandler<T, MouseEvent>

  // Touch events
  onTouchCancel?: DOMEventHandler<T, TouchEvent>
  onTouchEnd?: DOMEventHandler<T, TouchEvent>
  onTouchMove?: DOMEventHandler<T, TouchEvent>
  onTouchStart?: DOMEventHandler<T, TouchEvent>

  // Pointer events
  onPointerDown?: DOMEventHandler<T, PointerEvent>
  onPointerEnter?: DOMEventHandler<T, PointerEvent>
  onPointerLeave?: DOMEventHandler<T, PointerEvent>
  onPointerMove?: DOMEventHandler<T, PointerEvent>
  onPointerOut?: DOMEventHandler<T, PointerEvent>
  onPointerOver?: DOMEventHandler<T, PointerEvent>
  onPointerUp?: DOMEventHandler<T, PointerEvent>
  onPointerCancel?: DOMEventHandler<T, PointerEvent>

  // Scroll events
  onScroll?: DOMEventHandler<T, UIEvent>
  onWheel?: DOMEventHandler<T, WheelEvent>

  // Media events
  onAbort?: DOMEventHandler<T, Event>
  onCanPlay?: DOMEventHandler<T, Event>
  onCanPlayThrough?: DOMEventHandler<T, Event>
  onDurationChange?: DOMEventHandler<T, Event>
  onEmptied?: DOMEventHandler<T, Event>
  onEncrypted?: DOMEventHandler<T, Event>
  onEnded?: DOMEventHandler<T, Event>
  onError?: DOMEventHandler<T, Event>
  onLoadedData?: DOMEventHandler<T, Event>
  onLoadedMetadata?: DOMEventHandler<T, Event>
  onLoadStart?: DOMEventHandler<T, Event>
  onPause?: DOMEventHandler<T, Event>
  onPlay?: DOMEventHandler<T, Event>
  onPlaying?: DOMEventHandler<T, Event>
  onProgress?: DOMEventHandler<T, ProgressEvent>
  onRateChange?: DOMEventHandler<T, Event>
  onSeeked?: DOMEventHandler<T, Event>
  onSeeking?: DOMEventHandler<T, Event>
  onStalled?: DOMEventHandler<T, Event>
  onSuspend?: DOMEventHandler<T, Event>
  onTimeUpdate?: DOMEventHandler<T, Event>
  onVolumeChange?: DOMEventHandler<T, Event>
  onWaiting?: DOMEventHandler<T, Event>

  // Animation events
  onAnimationStart?: DOMEventHandler<T, AnimationEvent>
  onAnimationEnd?: DOMEventHandler<T, AnimationEvent>
  onAnimationIteration?: DOMEventHandler<T, AnimationEvent>

  // Transition events
  onTransitionEnd?: DOMEventHandler<T, TransitionEvent>

  // Details events
  onToggle?: DOMEventHandler<T, Event>

  // Message events
  onMessage?: DOMEventHandler<T, MessageEvent>
  onMessageError?: DOMEventHandler<T, MessageEvent>
}

/**
 * Boolean attribute
 */
export type Booleanish = boolean | 'true' | 'false'

/**
 * HTML element attributes
 */
export interface HTMLAttributes<T = HTMLElement> extends DOMAttributes<T> {
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

  // Class attributes - supports string, object, or array
  class?: string | Record<string, boolean | string | number> | undefined
  className?: string | Record<string, boolean | string | number> | undefined

  // Aria attributes
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

  // Non-standard attributes
  [key: string]: unknown
}

/**
 * Anchor element attributes
 */
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

/**
 * Area element attributes
 */
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

/**
 * Audio element attributes
 */
export interface AudioHTMLAttributes<
  T = HTMLAudioElement,
> extends MediaHTMLAttributes<T> {}

/**
 * Base element attributes
 */
export interface BaseHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  href?: string
  target?: string
}

/**
 * Blockquote element attributes
 */
export interface BlockquoteHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  cite?: string
}

/**
 * Button element attributes
 */
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

/**
 * Canvas element attributes
 */
export interface CanvasHTMLAttributes<
  T = HTMLCanvasElement,
> extends HTMLAttributes<T> {
  height?: number | string
  width?: number | string
}

/**
 * Col element attributes
 */
export interface ColHTMLAttributes<
  T = HTMLTableColElement,
> extends HTMLAttributes<T> {
  span?: number
  width?: number | string
}

/**
 * Data element attributes
 */
export interface DataHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  value?: string | number | readonly string[]
}

/**
 * Del element attributes
 */
export interface DelHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  cite?: string
  dateTime?: string
}

/**
 * Details element attributes
 */
export interface DetailsHTMLAttributes<
  T = HTMLDetailsElement,
> extends HTMLAttributes<T> {
  name?: string
  open?: boolean
}

/**
 * Dialog element attributes
 */
export interface DialogHTMLAttributes<
  T = HTMLDialogElement,
> extends HTMLAttributes<T> {
  open?: boolean
  returnValue?: string
}

/**
 * Embed element attributes
 */
export interface EmbedHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  height?: number | string
  src?: string
  type?: string
  width?: number | string
}

/**
 * Fieldset element attributes
 */
export interface FieldsetHTMLAttributes<
  T = HTMLFieldSetElement,
> extends HTMLAttributes<T> {
  disabled?: boolean
  form?: string
  name?: string
}

/**
 * Form element attributes
 */
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

/**
 * Head element attributes
 */
export interface HeadHTMLAttributes<
  T = HTMLHeadElement,
> extends HTMLAttributes<T> {
  profile?: string
}

/**
 * Header element attributes
 */
export interface HeaderHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {}

/**
 * HR element attributes
 */
export interface HrHTMLAttributes<
  T = HTMLHRElement,
> extends HTMLAttributes<T> {}

/**
 * HTML element attributes
 */
export interface HtmlHTMLAttributes<
  T = HTMLHtmlElement,
> extends HTMLAttributes<T> {
  manifest?: string
  version?: string
  xmlns?: string
}

/**
 * Iframe element attributes
 */
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

/**
 * Img element attributes
 */
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

/**
 * Input element attributes
 */
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

  onChange?: DOMEventHandler<T, Event>
  onInput?: DOMEventHandler<T, Event>
}

/**
 * Ins element attributes
 */
export interface InsHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  cite?: string
  dateTime?: string
}

/**
 * Label element attributes
 */
export interface LabelHTMLAttributes<
  T = HTMLLabelElement,
> extends HTMLAttributes<T> {
  form?: string
  htmlFor?: string
}

/**
 * Li element attributes
 */
export interface LiHTMLAttributes<T = HTMLLIElement> extends HTMLAttributes<T> {
  value?: string | number | readonly string[]
}

/**
 * Link element attributes
 */
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

/**
 * Map element attributes
 */
export interface MapHTMLAttributes<
  T = HTMLMapElement,
> extends HTMLAttributes<T> {
  name?: string
}

/**
 * Menu element attributes
 */
export interface MenuHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  type?: 'context' | 'toolbar'
}

/**
 * Media element attributes
 */
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

/**
 * Meta element attributes
 */
export interface MetaHTMLAttributes<
  T = HTMLMetaElement,
> extends HTMLAttributes<T> {
  charSet?: string
  content?: string
  httpEquiv?: string
  media?: string
  name?: string
}

/**
 * Meter element attributes
 */
export interface MeterHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  high?: number
  low?: number
  max?: number | string
  min?: number | string
  optimum?: number
  value?: string | number | readonly string[]
}

/**
 * Object element attributes
 */
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

/**
 * Ol element attributes
 */
export interface OlHTMLAttributes<
  T = HTMLOListElement,
> extends HTMLAttributes<T> {
  reversed?: boolean
  start?: number
  type?: '1' | 'a' | 'A' | 'i' | 'I'
}

/**
 * Optgroup element attributes
 */
export interface OptgroupHTMLAttributes<
  T = HTMLOptGroupElement,
> extends HTMLAttributes<T> {
  disabled?: boolean
  label?: string
}

/**
 * Option element attributes
 */
export interface OptionHTMLAttributes<
  T = HTMLOptionElement,
> extends HTMLAttributes<T> {
  disabled?: boolean
  label?: string
  selected?: boolean
  value?: string | number | readonly string[]
}

/**
 * Output element attributes
 */
export interface OutputHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  htmlFor?: string
  name?: string
}

/**
 * Param element attributes
 */
export interface ParamHTMLAttributes<
  T = HTMLParamElement,
> extends HTMLAttributes<T> {
  name?: string
  value?: string | number | readonly string[]
}

/**
 * Progress element attributes
 */
export interface ProgressHTMLAttributes<
  T = HTMLProgressElement,
> extends HTMLAttributes<T> {
  max?: number | string
  value?: string | number | readonly string[]
}

/**
 * Quote element attributes
 */
export interface QuoteHTMLAttributes<
  T = HTMLElement,
> extends HTMLAttributes<T> {
  cite?: string
}

/**
 * Script element attributes
 */
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

/**
 * Select element attributes
 */
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

  onChange?: DOMEventHandler<T, Event>
}

/**
 * Slot element attributes
 */
export interface SlotHTMLAttributes<
  T = HTMLSlotElement,
> extends HTMLAttributes<T> {
  name?: string
}

/**
 * Source element attributes
 */
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

/**
 * Style element attributes
 */
export interface StyleHTMLAttributes<
  T = HTMLStyleElement,
> extends HTMLAttributes<T> {
  media?: string
  type?: string
}

/**
 * Table element attributes
 */
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

/**
 * td/th element attributes
 */
export interface TdHTMLAttributes<
  T = HTMLTableCellElement,
> extends HTMLAttributes<T> {
  abbr?: string
  colSpan?: number
  headers?: string
  rowSpan?: number
  scope?: 'col' | 'colgroup' | 'row' | 'rowgroup'
}

/**
 * th element attributes
 */
export interface ThHTMLAttributes<
  T = HTMLTableCellElement,
> extends TdHTMLAttributes<T> {
  abbr?: string
}

/**
 * Tr element attributes
 */
export interface TrHTMLAttributes<
  T = HTMLTableRowElement,
> extends HTMLAttributes<T> {}

/**
 * Track element attributes
 */
export interface TrackHTMLAttributes<
  T = HTMLTrackElement,
> extends HTMLAttributes<T> {
  default?: boolean
  kind?: 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata'
  label?: string
  src?: string
  srclang?: string
}

/**
 * Textarea element attributes
 */
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

  onChange?: DOMEventHandler<T, Event>
  onInput?: DOMEventHandler<T, Event>
}

/**
 * Time element attributes
 */
export interface TimeHTMLAttributes<T = HTMLElement> extends HTMLAttributes<T> {
  dateTime?: string
}

/**
 * Video element attributes
 */
export interface VideoHTMLAttributes<
  T = HTMLVideoElement,
> extends MediaHTMLAttributes<T> {
  height?: number | string
  playsInline?: boolean
  poster?: string
  src?: string
  width?: number | string
}

/**
 * SVG attributes
 */
export interface SVGAttributes<T = SVGElement> extends DOMAttributes<T> {
  // SVG attributes
  accentHeight?: number | string
  alignmentBaseline?:
    | 'auto'
    | 'baseline'
    | 'before-edge'
    | 'text-before-edge'
    | 'middle'
    | 'after-edge'
    | 'text-after-edge'
    | 'ideographic'
    | 'alphabetic'
    | 'hanging'
    | 'mathematical'
    | 'central'
    | 'end'
    | 'start'
  allowReorder?: string
  alphabetic?: number | string
  amplitude?: number | string
  arabicForm?: 'initial' | 'medial' | 'terminal' | 'isolated'
  ascent?: number | string
  attributeName?: string
  attributeType?: string
  azimuth?: number | string
  baseFrequency?: number | string
  baselineShift?: number | string
  baseProfile?: number | string
  bbox?: number | string
  begin?: number | string
  bias?: number | string
  by?: number | string
  calcMode?: number | string
  clip?: number | string
  clipPath?: string
  clipPathUnits?: number | string
  clipRule?: number | string
  colorInterpolation?: number | string
  colorInterpolationFilters?: 'auto' | 'sRGB' | 'linearRGB' | 'inherit'
  colorProfile?: number | string
  colorRendering?: number | string
  contentScriptType?: number | string
  contentStyleType?: number | string
  cursor?: number | string
  cx?: number | string
  cy?: number | string
  d?: string
  descent?: number | string
  diffuseConstant?: number | string
  direction?: number | string
  display?: number | string
  divisor?: number | string
  dominantBaseline?: number | string
  dur?: number | string
  dx?: number | string
  dy?: number | string
  edgeMode?: number | string
  elevation?: number | string
  enableBackground?: number | string
  end?: number | string
  exponent?: number | string
  externalResourcesRequired?: number | string
  fill?: string
  fillOpacity?: number | string
  fillRule?: 'nonzero' | 'evenodd' | 'inherit'
  filter?: string
  filterRes?: number | string
  filterUnits?: number | string
  floodColor?: number | string
  floodOpacity?: number | string
  fontFamily?: string
  fontSize?: number | string
  fontSizeAdjust?: number | string
  fontStretch?: number | string
  fontStyle?: number | string
  fontVariant?: number | string
  fontWeight?: number | string
  format?: number | string
  from?: number | string
  fx?: number | string
  fy?: number | string
  g1?: number | string
  g2?: number | string
  glyphName?: number | string
  glyphOrientationHorizontal?: number | string
  glyphOrientationVertical?: number | string
  glyphRef?: number | string
  gradientTransform?: string
  gradientUnits?: number | string
  hanging?: number | string
  height?: number | string
  horizAdvX?: number | string
  horizOriginX?: number | string
  horizOriginY?: number | string
  horizOneX?: number | string
  ideographic?: number | string
  imageRendering?: number | string
  in?: string
  in2?: number | string
  intercept?: number | string
  k1?: number | string
  k2?: number | string
  k3?: number | string
  k4?: number | string
  k?: number | string
  kernelMatrix?: number | string
  kernelUnitLength?: number | string
  kerning?: number | string
  keyPoints?: number | string
  keySplines?: number | string
  keyTimes?: number | string
  lang?: number | string
  lengthAdjust?: number | string
  letterSpacing?: number | string
  lightingColor?: number | string
  limitingConeAngle?: number | string
  local?: number | string
  markerEnd?: string
  markerHeight?: number | string
  markerMid?: string
  markerStart?: string
  markerUnits?: number | string
  markerWidth?: number | string
  mask?: string
  maskContentUnits?: number | string
  maskUnits?: number | string
  mathematical?: number | string
  max?: number | string
  media?: string
  method?: string
  min?: number | string
  mode?: number | string
  name?: number | string
  numOctaves?: number | string
  offset?: number | string
  opacity?: number | string
  operator?: number | string
  order?: number | string
  orient?: number | string
  orientation?: number | string
  origin?: number | string
  overflow?: number | string
  overlinePosition?: number | string
  overlineThickness?: number | string
  paintOrder?: number | string
  panose1?: number | string
  pathLength?: number | string
  patternContentUnits?: string
  patternTransform?: number | string
  patternUnits?: string
  pointerEvents?: number | string
  points?: string
  pointsAtX?: number | string
  pointsAtY?: number | string
  pointsAtZ?: number | string
  preserveAlpha?: number | string
  preserveAspectRatio?: string
  primitiveUnits?: number | string
  r?: number | string
  radius?: number | string
  refX?: number | string
  refY?: number | string
  renderingIntent?: number | string
  repeatCount?: number | string
  repeatDur?: number | string
  requiredExtensions?: number | string
  requiredFeatures?: number | string
  restart?: number | string
  result?: string
  rotate?: number | string
  rx?: number | string
  ry?: number | string
  scale?: number | string
  seed?: number | string
  shapeRendering?: number | string
  slope?: number | string
  spacing?: number | string
  specularConstant?: number | string
  specularExponent?: number | string
  spreadMethod?: string
  startOffset?: number | string
  stdDeviation?: number | string
  stitchTiles?: number | string
  stopColor?: string
  stopOpacity?: number | string
  strokeDasharray?: number | string
  strokeDashoffset?: number | string
  strokeLinecap?: 'butt' | 'round' | 'square' | 'inherit'
  strokeLinejoin?: 'miter' | 'round' | 'bevel' | 'inherit'
  strokeMiterlimit?: number | string
  strokeOpacity?: number | string
  strokeWidth?: number | string
  style?: string
  surfaceScale?: number | string
  systemLanguage?: number | string
  tableValues?: number | string
  target?: string
  targetX?: number | string
  targetY?: number | string
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit'
  textDecoration?: number | string
  textLength?: number | string
  textRendering?: number | string
  to?: number | string
  transform?: string
  type?: string
  u1?: number | string
  u2?: number | string
  underlinePosition?: number | string
  underlineThickness?: number | string
  unicode?: number | string
  unicodeBidi?: number | string
  unicodeRange?: number | string
  unitsPerEm?: number | string
  vAdvanceHeight?: number | string
  vAlphabetic?: number | string
  vHanging?: number | string
  vIdeographic?: number | string
  vMathematical?: number | string
  values?: number | string
  version?: string
  vertAdvY?: number | string
  vertOriginX?: number | string
  vertOriginY?: number | string
  viewBox?: string
  viewTarget?: number | string
  width?: number | string
  wordSpacing?: number | string
  writingMode?: number | string
  x?: number | string
  x1?: number | string
  x2?: number | string
  xChannelSelector?: string
  xHeight?: number | string
  xlinkActuate?: string
  xlinkArcrole?: string
  xlinkHref?: string
  xlinkRole?: string
  xlinkShow?: string
  xlinkTitle?: string
  xlinkType?: string
  xmlns?: string
  xmlnsXlink?: string
  y?: number | string
  y1?: number | string
  y2?: number | string
  yChannelSelector?: string
  z?: number | string
  zoomAndPan?: string

  // Class
  class?: string | Record<string, boolean | string | number> | undefined
  className?: string | Record<string, boolean | string | number> | undefined
}

/**
 * All HTML element types
 */
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

/**
 * All SVG element types
 */
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
  animate: SVGAttributes
  animateMotion: SVGAttributes
  animateTransform: SVGAttributes
  set: SVGAttributes
  mpath: SVGAttributes
  feBlend: SVGAttributes
  feColorMatrix: SVGAttributes
  feComponentTransfer: SVGAttributes
  feComposite: SVGAttributes
  feConvolveMatrix: SVGAttributes
  feDiffuseLighting: SVGAttributes
  feDisplacementMap: SVGAttributes
  feDistantLight: SVGAttributes
  feFlood: SVGAttributes
  feFuncA: SVGAttributes
  feFuncB: SVGAttributes
  feFuncG: SVGAttributes
  feFuncR: SVGAttributes
  feGaussianBlur: SVGAttributes
  feImage: SVGAttributes
  feMerge: SVGAttributes
  feMergeNode: SVGAttributes
  feMorphology: SVGAttributes
  feOffset: SVGAttributes
  fePointLight: SVGAttributes
  feSpecularLighting: SVGAttributes
  feSpotLight: SVGAttributes
  feTile: SVGAttributes
  feTurbulence: SVGAttributes
}

/**
 * All intrinsic elements (HTML + SVG)
 */
export type IntrinsicElements = HTMLElementTags & SVGElementTags

/**
 * JSX namespace for TypeScript
 */
declare global {
  namespace JSX {
    // JSX.Element is defined in dom-types.ts as JSXElement
    interface ElementChildrenAttribute {
      children: {}
    }
    interface IntrinsicAttributes {
      key?: string | number | null
    }
    interface IntrinsicElements extends HTMLElementTags, SVGElementTags {}
  }
}
