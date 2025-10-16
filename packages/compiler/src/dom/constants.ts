const booleans = [
  'allowfullscreen',
  'async',
  'alpha', // HTMLInputElement
  'autofocus', // HTMLElement prop
  'autoplay',
  'checked',
  'controls',
  'default',
  'disabled',
  'formnovalidate',
  'hidden', // HTMLElement prop - not a boolean
  'indeterminate',
  'inert', // HTMLElement prop
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
  'seamless', // HTMLIframeElement - non-standard
  'selected',

  'adauctionheaders', // experimental
  'browsingtopics', // experimental
  'credentialless', // experimental
  'defaultchecked',
  'defaultmuted',
  'defaultselected',
  'defer',
  'disablepictureinpicture',
  'disableremoteplayback',
  'preservespitch', // appears as camelCase property only (not as attribute)
  'shadowrootclonable',
  'shadowrootcustomelementregistry', // experimental - doesnt seem to have a prop yet
  'shadowrootdelegatesfocus',
  'shadowrootserializable', // experimental
  'sharedstoragewritable', // experimental
]

export const InlineElements: string[] = [
  'a',
  'abbr',
  'acronym',
  'b',
  'bdi',
  'bdo',
  'big',
  'br',
  'button',
  'canvas',
  'cite',
  'code',
  'data',
  'datalist',
  'del',
  'dfn',
  'em',
  'embed',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'map',
  'mark',
  'meter',
  'noscript',
  'object',
  'output',
  'picture',
  'progress',
  'q',
  'ruby',
  's',
  'samp',
  'script',
  'select',
  'slot',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'svg',
  'template',
  'textarea',
  'time',
  'u',
  'tt',
  'var',
  'video',
]

export const BlockElements: string[] = [
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]

export const BooleanAttributes: Set<string> = new Set(booleans)

export const Aliases: Record<string, string> = Object.assign(
  Object.create(null),
  {
    className: 'class',
    htmlFor: 'for',
  },
)

export const ChildProperties: Set<string> = new Set([
  'innerHTML',
  'textContent',
  'innerText',
  'children',
])

export const DelegatedEvents: Set<string> = new Set([
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

export const Properties: Set<string> = new Set([
  // locked to properties
  'className',
  'value',

  // booleans with camelCase
  'readOnly',
  'noValidate',
  'formNoValidate',
  'isMap',
  'noModule',
  'playsInline',

  'adAuctionHeaders', // experimental
  'allowFullscreen',
  'browsingTopics', // experimental
  'defaultChecked',
  'defaultMuted',
  'defaultSelected',
  'disablePictureInPicture',
  'disableRemotePlayback',
  'preservesPitch',
  'shadowRootClonable',
  'shadowRootCustomElementRegistry', // experimental
  'shadowRootDelegatesFocus',
  'shadowRootSerializable', // experimental
  'sharedStorageWritable', // experimental

  ...booleans,
])

export const SVGElements: Set<string> = new Set([
  // "a",
  'altGlyph',
  'altGlyphDef',
  'altGlyphItem',
  'animate',
  'animateColor',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'color-profile',
  'cursor',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'font',
  'font-face',
  'font-face-format',
  'font-face-name',
  'font-face-src',
  'font-face-uri',
  'foreignObject',
  'g',
  'glyph',
  'glyphRef',
  'hkern',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'metadata',
  'missing-glyph',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  // "script",
  'set',
  'stop',
  // "style",
  'svg',
  'switch',
  'symbol',
  'text',
  'textPath',
  // "title",
  'tref',
  'tspan',
  'use',
  'view',
  'vkern',
])

export const SVGNamespace = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
}

export const PropAliases: Record<
  string,
  Record<string, string>
> = Object.assign(Object.create(null), {
  // locked to properties
  class: 'className',

  // booleans map
  novalidate: {
    $: 'noValidate',
    FORM: 1,
  },
  formnovalidate: {
    $: 'formNoValidate',
    BUTTON: 1,
    INPUT: 1,
  },
  ismap: {
    $: 'isMap',
    IMG: 1,
  },
  nomodule: {
    $: 'noModule',
    SCRIPT: 1,
  },
  playsinline: {
    $: 'playsInline',
    VIDEO: 1,
  },
  readonly: {
    $: 'readOnly',
    INPUT: 1,
    TEXTAREA: 1,
  },

  adauctionheaders: {
    $: 'adAuctionHeaders',
    IFRAME: 1,
  },
  allowfullscreen: {
    $: 'allowFullscreen',
    IFRAME: 1,
  },
  browsingtopics: {
    $: 'browsingTopics',
    IMG: 1,
  },
  defaultchecked: {
    $: 'defaultChecked',
    INPUT: 1,
  },
  defaultmuted: {
    $: 'defaultMuted',
    AUDIO: 1,
    VIDEO: 1,
  },
  defaultselected: {
    $: 'defaultSelected',
    OPTION: 1,
  },
  disablepictureinpicture: {
    $: 'disablePictureInPicture',
    VIDEO: 1,
  },
  disableremoteplayback: {
    $: 'disableRemotePlayback',
    AUDIO: 1,
    VIDEO: 1,
  },
  preservespitch: {
    $: 'preservesPitch',
    AUDIO: 1,
    VIDEO: 1,
  },
  shadowrootclonable: {
    $: 'shadowRootClonable',
    TEMPLATE: 1,
  },
  shadowrootdelegatesfocus: {
    $: 'shadowRootDelegatesFocus',
    TEMPLATE: 1,
  },
  shadowrootserializable: {
    $: 'shadowRootSerializable',
    TEMPLATE: 1,
  },
  sharedstoragewritable: {
    $: 'sharedStorageWritable',
    IFRAME: 1,
    IMG: 1,
  },
})

export function getPropAlias(
  prop: string,
  tagName: string,
): string | undefined {
  const a = PropAliases[prop]
  return typeof a === 'object' ? (a[tagName] ? a['$'] : undefined) : a
}
