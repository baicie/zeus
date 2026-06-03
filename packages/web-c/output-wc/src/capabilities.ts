export const ZEUS_OUTPUT_WC_CAPABILITIES = {
  packageName: '@zeus-js/output-wc',
  version: __VERSION__,

  output: {
    webComponent: true,
    customElements: true,
    shadowDom: true,
    lightDom: true,
    slots: true,
    props: true,
    attrs: true,
    events: true,
    styles: true,
  },

  manifest: {
    componentManifest: true,
    props: true,
    events: true,
    slots: true,
    cssVars: true,
    cssParts: true,
    dts: true,
  },

  wrappers: {
    react: false,
    vue: false,
  },
} as const

export type ZeusOutputWcCapabilities = typeof ZEUS_OUTPUT_WC_CAPABILITIES
