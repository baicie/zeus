import css from '@zeus-js/output-css'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'

import type { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

export interface ComponentLibraryPresetOptions {
  styles?: string | false
  targets?: ComponentLibraryTarget[]
  dts?: DtsMode
  jsxDts?: DtsMode
  manifest?: boolean
  customElements?: boolean
}

export type ComponentLibraryTarget = 'wc' | 'react' | 'vue'

export function componentLibrary(
  options: ComponentLibraryPresetOptions = {},
): ZeusComponentPlugin[] {
  const targets = options.targets ?? ['wc', 'react', 'vue']
  const plugins: ZeusComponentPlugin[] = []

  if (options.styles !== false) {
    plugins.push(
      css(typeof options.styles === 'string' ? { input: options.styles } : {}),
    )
  }

  if (targets.includes('wc')) {
    plugins.push(
      wc({
        dts: options.dts ?? 'auto',
        jsxDts: options.jsxDts ?? 'auto',
        manifestFile:
          options.manifest === false ? false : 'zeus.components.json',
        customElementsFile:
          options.customElements === false ? false : 'custom-elements.json',
      }),
    )
  }

  if (targets.includes('react')) {
    plugins.push(
      react({
        dts: options.dts ?? 'auto',
      }),
    )
  }

  if (targets.includes('vue')) {
    plugins.push(
      vue({
        dts: options.dts ?? 'auto',
        globalDts: options.dts ?? 'auto',
      }),
    )
  }

  return plugins
}

export { css, wc, react, vue }
