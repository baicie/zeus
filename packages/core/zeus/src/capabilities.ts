const version = __VERSION__ as string

export const ZEUS_CAPABILITIES = {
  packageName: '@zeus-js/zeus',
  version,

  publicApi: {
    createSignal: true,
    createMemo: true,
    createEffect: true,
    createRoot: true,
    batch: true,
    onCleanup: true,

    render: true,
    Show: true,
    For: true,

    createContext: true,
    provide: true,
    inject: true,
    useContext: true,
  },

  jsx: {
    jsxRuntime: true,
    jsxDevRuntime: true,
    fragment: true,
    compiledJsx: true,
  },

  webComponents: {
    defineElement: true,
    Host: true,
    Slot: true,
    shadowDom: true,
    lightDom: true,
    namedSlots: true,
    defaultSlot: true,
    props: true,
    attrs: true,
    reflect: true,
    events: true,
    styles: true,
    context: true,
  },

  stability: {
    main: 'stable',
    advanced: 'advanced',
    internal: 'private',
  },
} as const

export type ZeusCapabilities = typeof ZEUS_CAPABILITIES
