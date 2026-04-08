const booleans = [
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'disabled',
  'formnovalidate',
  'hidden',
  'indeterminate',
  'inert',
  'ismap',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
]

export const BooleanAttributes = new Set(booleans)

export const Properties = new Set([
  'className',
  'value',
  'readOnly',
  'noValidate',
  'formNoValidate',
  'isMap',
  'noModule',
  'playsInline',
  ...booleans,
])

export const ChildProperties = new Set(['innerHTML', 'textContent', 'innerText', 'children'])

export const Aliases: Record<string, string> = Object.assign(Object.create(null), {
  className: 'class',
  htmlFor: 'for',
})

const PropAliases: Record<string, any> = Object.assign(Object.create(null), {
  class: 'className',
  novalidate: { $: 'noValidate', FORM: 1 },
  formnovalidate: { $: 'formNoValidate', BUTTON: 1, INPUT: 1 },
  ismap: { $: 'isMap', IMG: 1 },
  nomodule: { $: 'noModule', SCRIPT: 1 },
  playsinline: { $: 'playsInline', VIDEO: 1 },
  readonly: { $: 'readOnly', INPUT: 1, TEXTAREA: 1 },
})

export function getPropAlias(prop: string, tagName: string): string | undefined {
  const a = PropAliases[prop]
  return typeof a === 'object' ? (a[tagName] ? a.$ : undefined) : a
}

export const DelegatedEvents = new Set([
  'beforeinput',
  'click',
  'dblclick',
  'contextmenu',
  'focusin',
  'focusout',
  'input',
  'keydown',
  'keyup',
  'mousedown',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'pointerdown',
  'pointermove',
  'pointerout',
  'pointerover',
  'pointerup',
  'touchend',
  'touchmove',
  'touchstart',
])

export const SVGElements = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'text',
  'tspan',
  'use',
  'foreignObject',
])

export const SVGNamespace: Record<string, string> = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
}
