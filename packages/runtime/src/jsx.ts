// Note: this file is auto concatenated to the end of the bundled d.ts during
// build.

// This file is copied from Vue 3 core repository and adapted for Zeus framework.
// Original source: https://github.com/vuejs/core/blob/main/packages/runtime-core/src/jsx.ts
//
// The original Vue code is based on React definition in DefinitelyTyped published under the MIT license.
//      Repository: https://github.com/DefinitelyTyped/DefinitelyTyped
//      Path in the repository: types/react/index.d.ts
//
// Copyrights of original React definition are:
//      AssureSign <http://www.assuresign.com>
//      Microsoft <https://microsoft.com>
//                 John Reilly <https://github.com/johnnyreilly>
//      Benoit Benezech <https://github.com/bbenezech>
//      Patricio Zavolinsky <https://github.com/pzavolinsky>
//      Digiguru <https://github.com/digiguru>
//      Eric Anderson <https://github.com/ericanderson>
//      Dovydas Navickas <https://github.com/DovydasNavickas>
//                 Josh Rutherford <https://github.com/theruther4d>
//                 Guilherme Hübner <https://github.com/guilhermehubner>
//                 Ferdy Budhidharma <https://github.com/ferdaber>
//                 Johann Rakotoharisoa <https://github.com/jrakotoharisoa>
//                 Olivier Pascal <https://github.com/pascaloliv>
//                 Martin Hochel <https://github.com/hotell>
//                 Frank Li <https://github.com/franklixuefei>
//                 Jessica Franco <https://github.com/Jessidhia>
//                 Saransh Kataria <https://github.com/saranshkataria>
//                 Kanitkorn Sujautra <https://github.com/lukyth>
//                 Sebastian Silbermann <https://github.com/eps1lon>
//
// Vue.js is released under the MIT License.
// Copyright (c) 2014-present, Yuxi (Evan) You and Vue.js contributors.
//
// Zeus framework modifications:
// - Simplified type definitions for better performance
// - Removed unused complex types
// - Adapted for Zeus framework's specific needs

import type * as CSS from 'csstype'

export interface CSSProperties
  extends CSS.Properties<string | number>,
    CSS.PropertiesHyphen<string | number> {
  /**
   * The index signature was removed to enable closed typing for style
   * using CSSType. You're able to use type assertion or module augmentation
   * to add properties or an index signature of your own.
   *
   * For examples and more information, visit:
   * https://github.com/frenic/csstype#what-should-i-do-when-i-get-type-errors
   */
  [v: `--${string}`]: string | number | undefined
}

type Booleanish = boolean | 'true' | 'false'
type Numberish = number | string

// All the WAI-ARIA 1.1 attributes from https://www.w3.org/TR/wai-aria-1.1/
export interface AriaAttributes {
  /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
  'aria-activedescendant'?: string | undefined
  /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
  'aria-atomic'?: Booleanish | undefined
  /**
   * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
   * presented if they are made.
   */
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both' | undefined
  /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
  'aria-busy'?: Booleanish | undefined
  /**
   * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
   * @see aria-pressed @see aria-selected.
   */
  'aria-checked'?: Booleanish | 'mixed' | undefined
  /**
   * Defines the total number of columns in a table, grid, or treegrid.
   * @see aria-colindex.
   */
  'aria-colcount'?: Numberish | undefined
  /**
   * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
   * @see aria-colcount @see aria-colspan.
   */
  'aria-colindex'?: Numberish | undefined
  /**
   * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-colindex @see aria-rowspan.
   */
  'aria-colspan'?: Numberish | undefined
  /**
   * Identifies the element (or elements) whose contents or presence are controlled by the current element.
   * @see aria-owns.
   */
  'aria-controls'?: string | undefined
  /** Indicates the element that represents the current item within a container or set of related elements. */
  'aria-current'?:
    | Booleanish
    | 'page'
    | 'step'
    | 'location'
    | 'date'
    | 'time'
    | undefined
  /**
   * Identifies the element (or elements) that describes the object.
   * @see aria-labelledby
   */
  'aria-describedby'?: string | undefined
  /**
   * Identifies the element that provides a detailed, extended description for the object.
   * @see aria-describedby.
   */
  'aria-details'?: string | undefined
  /**
   * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
   * @see aria-hidden @see aria-readonly.
   */
  'aria-disabled'?: Booleanish | undefined
  /**
   * Indicates what functions can be performed when a dragged object is released on the drop target.
   * @deprecated in ARIA 1.1
   */
  'aria-dropeffect'?:
    | 'none'
    | 'copy'
    | 'execute'
    | 'link'
    | 'move'
    | 'popup'
    | undefined
  /**
   * Identifies the element that provides an error message for the object.
   * @see aria-invalid @see aria-describedby.
   */
  'aria-errormessage'?: string | undefined
  /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
  'aria-expanded'?: Booleanish | undefined
  /**
   * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
   * allows assistive technology to override the general default of reading in document source order.
   */
  'aria-flowto'?: string | undefined
  /**
   * Indicates an element's "grabbed" state in a drag-and-drop operation.
   * @deprecated in ARIA 1.1
   */
  'aria-grabbed'?: Booleanish | undefined
  /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
  'aria-haspopup'?:
    | Booleanish
    | 'menu'
    | 'listbox'
    | 'tree'
    | 'grid'
    | 'dialog'
    | undefined
  /**
   * Indicates whether the element is exposed to an accessibility API.
   * @see aria-disabled.
   */
  'aria-hidden'?: Booleanish | undefined
  /**
   * Indicates the entered value does not conform to the format expected by the application.
   * @see aria-errormessage.
   */
  'aria-invalid'?: Booleanish | 'grammar' | 'spelling' | undefined
  /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
  'aria-keyshortcuts'?: string | undefined
  /**
   * Defines a string value that labels the current element.
   * @see aria-labelledby.
   */
  'aria-label'?: string | undefined
  /**
   * Identifies the element (or elements) that labels the current element.
   * @see aria-describedby.
   */
  'aria-labelledby'?: string | undefined
  /** Defines the hierarchical level of an element within a structure. */
  'aria-level'?: Numberish | undefined
  /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
  'aria-live'?: 'off' | 'assertive' | 'polite' | undefined
  /** Indicates whether an element is modal when displayed. */
  'aria-modal'?: Booleanish | undefined
  /** Indicates whether a text box accepts multiple lines of input or only a single line. */
  'aria-multiline'?: Booleanish | undefined
  /** Indicates that the user may select more than one item from the current selectable descendants. */
  'aria-multiselectable'?: Booleanish | undefined
  /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
  'aria-orientation'?: 'horizontal' | 'vertical' | undefined
  /**
   * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
   * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
   * @see aria-controls.
   */
  'aria-owns'?: string | undefined
  /**
   * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
   * A hint could be a sample value or a brief description of the expected format.
   */
  'aria-placeholder'?: string | undefined
  /**
   * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-setsize.
   */
  'aria-posinset'?: Numberish | undefined
  /**
   * Indicates the current "pressed" state of toggle buttons.
   * @see aria-checked @see aria-selected.
   */
  'aria-pressed'?: Booleanish | 'mixed' | undefined
  /**
   * Indicates that the element is not editable, but is otherwise operable.
   * @see aria-disabled.
   */
  'aria-readonly'?: Booleanish | undefined
  /**
   * Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.
   * @see aria-atomic.
   */
  'aria-relevant'?:
    | 'additions'
    | 'additions removals'
    | 'additions text'
    | 'all'
    | 'removals'
    | 'removals additions'
    | 'removals text'
    | 'text'
    | 'text additions'
    | 'text removals'
    | undefined
  /** Indicates that user input is required on the element before a form may be submitted. */
  'aria-required'?: Booleanish | undefined
  /** Defines a human-readable, author-localized description for the role of an element. */
  'aria-roledescription'?: string | undefined
  /**
   * Defines the total number of rows in a table, grid, or treegrid.
   * @see aria-rowindex.
   */
  'aria-rowcount'?: Numberish | undefined
  /**
   * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
   * @see aria-rowcount @see aria-rowspan.
   */
  'aria-rowindex'?: Numberish | undefined
  /**
   * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-rowindex @see aria-colspan.
   */
  'aria-rowspan'?: Numberish | undefined
  /**
   * Indicates the current "selected" state of various widgets.
   * @see aria-checked @see aria-pressed.
   */
  'aria-selected'?: Booleanish | undefined
  /**
   * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-posinset.
   */
  'aria-setsize'?: Numberish | undefined
  /** Indicates if items in a table or grid are sorted in ascending or descending order. */
  'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other' | undefined
  /** Defines the maximum allowed value for a range widget. */
  'aria-valuemax'?: Numberish | undefined
  /** Defines the minimum allowed value for a range widget. */
  'aria-valuemin'?: Numberish | undefined
  /**
   * Defines the current value for a range widget.
   * @see aria-valuetext.
   */
  'aria-valuenow'?: Numberish | undefined
  /** Defines the human readable text alternative of aria-valuenow for a range widget. */
  'aria-valuetext'?: string | undefined
}

// Vue's style normalization supports nested arrays
export type StyleValue =
  | false
  | null
  | undefined
  | string
  | CSSProperties
  | Array<StyleValue>

export interface HTMLAttributes extends AriaAttributes, EventHandlers<Events> {
  innerHTML?: string | undefined

  class?: any
  style?: StyleValue | undefined

  // Standard HTML Attributes
  accesskey?: string | undefined
  contenteditable?: Booleanish | 'inherit' | 'plaintext-only' | undefined
  contextmenu?: string | undefined
  dir?: string | undefined
  draggable?: Booleanish | undefined
  hidden?: Booleanish | '' | 'hidden' | 'until-found' | undefined
  id?: string | undefined
  inert?: Booleanish | undefined
  lang?: string | undefined
  placeholder?: string | undefined
  spellcheck?: Booleanish | undefined
  tabindex?: Numberish | undefined
  title?: string | undefined
  translate?: 'yes' | 'no' | undefined

  // Unknown
  radiogroup?: string | undefined // <command>, <menuitem>

  // WAI-ARIA
  role?: string | undefined

  // RDFa Attributes
  about?: string | undefined
  datatype?: string | undefined
  inlist?: any
  prefix?: string | undefined
  property?: string | undefined
  resource?: string | undefined
  typeof?: string | undefined
  vocab?: string | undefined

  // Non-standard Attributes
  autocapitalize?: string | undefined
  autocorrect?: string | undefined
  autosave?: string | undefined
  color?: string | undefined
  itemprop?: string | undefined
  itemscope?: Booleanish | undefined
  itemtype?: string | undefined
  itemid?: string | undefined
  itemref?: string | undefined
  results?: Numberish | undefined
  security?: string | undefined
  unselectable?: 'on' | 'off' | undefined

  // Living Standard
  /**
   * Hints at the type of data that might be entered by the user while editing the element or its contents
   * @see https://html.spec.whatwg.org/multipage/interaction.html#input-modalities:-the-inputmode-attribute
   */
  inputmode?:
    | 'none'
    | 'text'
    | 'tel'
    | 'url'
    | 'email'
    | 'numeric'
    | 'decimal'
    | 'search'
    | undefined
  /**
   * Specify that a standard HTML element should behave like a defined custom built-in element
   * @see https://html.spec.whatwg.org/multipage/custom-elements.html#attr-is
   */
  is?: string | undefined
}

// 简化的类型定义，只包含常用的 HTML 元素
export interface IntrinsicElementAttributes {
  a: HTMLAttributes
  abbr: HTMLAttributes
  address: HTMLAttributes
  area: HTMLAttributes
  article: HTMLAttributes
  aside: HTMLAttributes
  audio: HTMLAttributes
  b: HTMLAttributes
  base: HTMLAttributes
  bdi: HTMLAttributes
  bdo: HTMLAttributes
  blockquote: HTMLAttributes
  body: HTMLAttributes
  br: HTMLAttributes
  button: HTMLAttributes
  canvas: HTMLAttributes
  caption: HTMLAttributes
  cite: HTMLAttributes
  code: HTMLAttributes
  col: HTMLAttributes
  colgroup: HTMLAttributes
  data: HTMLAttributes
  datalist: HTMLAttributes
  dd: HTMLAttributes
  del: HTMLAttributes
  details: HTMLAttributes
  dfn: HTMLAttributes
  dialog: HTMLAttributes
  div: HTMLAttributes
  dl: HTMLAttributes
  dt: HTMLAttributes
  em: HTMLAttributes
  embed: HTMLAttributes
  fieldset: HTMLAttributes
  figcaption: HTMLAttributes
  figure: HTMLAttributes
  footer: HTMLAttributes
  form: HTMLAttributes
  h1: HTMLAttributes
  h2: HTMLAttributes
  h3: HTMLAttributes
  h4: HTMLAttributes
  h5: HTMLAttributes
  h6: HTMLAttributes
  head: HTMLAttributes
  header: HTMLAttributes
  hgroup: HTMLAttributes
  hr: HTMLAttributes
  html: HTMLAttributes
  i: HTMLAttributes
  iframe: HTMLAttributes
  img: HTMLAttributes
  input: HTMLAttributes
  ins: HTMLAttributes
  kbd: HTMLAttributes
  label: HTMLAttributes
  legend: HTMLAttributes
  li: HTMLAttributes
  link: HTMLAttributes
  main: HTMLAttributes
  map: HTMLAttributes
  mark: HTMLAttributes
  menu: HTMLAttributes
  meta: HTMLAttributes
  meter: HTMLAttributes
  nav: HTMLAttributes
  noscript: HTMLAttributes
  object: HTMLAttributes
  ol: HTMLAttributes
  optgroup: HTMLAttributes
  option: HTMLAttributes
  output: HTMLAttributes
  p: HTMLAttributes
  param: HTMLAttributes
  picture: HTMLAttributes
  pre: HTMLAttributes
  progress: HTMLAttributes
  q: HTMLAttributes
  rp: HTMLAttributes
  rt: HTMLAttributes
  ruby: HTMLAttributes
  s: HTMLAttributes
  samp: HTMLAttributes
  script: HTMLAttributes
  section: HTMLAttributes
  select: HTMLAttributes
  small: HTMLAttributes
  source: HTMLAttributes
  span: HTMLAttributes
  strong: HTMLAttributes
  style: HTMLAttributes
  sub: HTMLAttributes
  summary: HTMLAttributes
  sup: HTMLAttributes
  table: HTMLAttributes
  template: HTMLAttributes
  tbody: HTMLAttributes
  td: HTMLAttributes
  textarea: HTMLAttributes
  tfoot: HTMLAttributes
  th: HTMLAttributes
  thead: HTMLAttributes
  time: HTMLAttributes
  title: HTMLAttributes
  tr: HTMLAttributes
  track: HTMLAttributes
  u: HTMLAttributes
  ul: HTMLAttributes
  var: HTMLAttributes
  video: HTMLAttributes
  wbr: HTMLAttributes

  // SVG
  svg: HTMLAttributes
  circle: HTMLAttributes
  defs: HTMLAttributes
  ellipse: HTMLAttributes
  g: HTMLAttributes
  line: HTMLAttributes
  path: HTMLAttributes
  polygon: HTMLAttributes
  polyline: HTMLAttributes
  rect: HTMLAttributes
  text: HTMLAttributes
}

// 简化的事件类型
export interface Events {
  // clipboard events
  onCopy: ClipboardEvent
  onCut: ClipboardEvent
  onPaste: ClipboardEvent

  // drag drop events
  onDrag: DragEvent
  onDragend: DragEvent
  onDragenter: DragEvent
  onDragleave: DragEvent
  onDragover: DragEvent
  onDragstart: DragEvent
  onDrop: DragEvent

  // focus events
  onFocus: FocusEvent
  onFocusin: FocusEvent
  onFocusout: FocusEvent
  onBlur: FocusEvent

  // form events
  onChange: Event
  onInput: Event
  onReset: Event
  onSubmit: SubmitEvent

  // keyboard events
  onKeydown: KeyboardEvent
  onKeypress: KeyboardEvent
  onKeyup: KeyboardEvent

  // mouse events
  onDblclick: MouseEvent
  onMousedown: MouseEvent
  onMouseenter: MouseEvent
  onMouseleave: MouseEvent
  onMousemove: MouseEvent
  onMouseout: MouseEvent
  onMouseover: MouseEvent
  onMouseup: MouseEvent

  // pointer events
  onClick: PointerEvent
  onContextmenu: PointerEvent
  onPointerdown: PointerEvent
  onPointermove: PointerEvent
  onPointerup: PointerEvent
  onPointercancel: PointerEvent
  onPointerenter: PointerEvent
  onPointerleave: PointerEvent
  onPointerover: PointerEvent
  onPointerout: PointerEvent

  // scroll events
  onScroll: Event

  // touch events
  onTouchcancel: TouchEvent
  onTouchend: TouchEvent
  onTouchmove: TouchEvent
  onTouchstart: TouchEvent

  // wheel events
  onWheel: WheelEvent
}

type EventHandlers<E> = {
  [K in keyof E]?: E[K] extends (...args: any) => any
    ? E[K]
    : (payload: E[K]) => void
}

export type ReservedProps = {
  key?: PropertyKey | undefined
  ref?: any | undefined
}

export type NativeElements = {
  [K in keyof IntrinsicElementAttributes]: IntrinsicElementAttributes[K] &
    ReservedProps
}
