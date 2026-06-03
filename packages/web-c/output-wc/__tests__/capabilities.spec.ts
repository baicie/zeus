import { describe, expect, it } from 'vitest'

import {
  ZEUS_OUTPUT_WC_CAPABILITIES,
  type ZeusOutputWcCapabilities,
} from '../src/capabilities'

describe('@zeus-js/output-wc capabilities', () => {
  it('declares web component output capabilities', () => {
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.output.webComponent).toBe(true)
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.output.customElements).toBe(true)
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.output.shadowDom).toBe(true)
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.output.lightDom).toBe(true)
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.output.slots).toBe(true)
  })

  it('declares manifest generation capabilities', () => {
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.manifest.componentManifest).toBe(true)
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.manifest.dts).toBe(true)
  })

  it('declares no React/Vue wrappers', () => {
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.wrappers.react).toBe(false)
    expect(ZEUS_OUTPUT_WC_CAPABILITIES.wrappers.vue).toBe(false)
  })

  it('has a valid capabilities type', () => {
    const caps: ZeusOutputWcCapabilities = ZEUS_OUTPUT_WC_CAPABILITIES
    expect(caps.packageName).toBe('@zeus-js/output-wc')
    expect(caps.version).toBeDefined()
  })
})
