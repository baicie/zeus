import css from '@zeus-js/output-css'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'

import type { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'
import type { OutputReactWrapperOptions } from '@zeus-js/output-react-wrapper'
import type { OutputVueWrapperOptions } from '@zeus-js/output-vue-wrapper'
import type { OutputWCOptions } from '@zeus-js/output-wc'

export type WebCRegisterMode = 'lazy' | 'side-effect'
export type WebCWrapperMode = 'runtime' | 'minimal' | 'event-bridge'

export interface ComponentLibraryPresetOptions {
  styles?: string | false
  targets?: ComponentLibraryTarget[]

  /**
   * Generate .d.ts declaration files.
   *
   * @default true
   */
  dts?: DtsMode

  /**
   * Generate JSX IntrinsicElements d.ts.
   *
   * @default true
   */
  jsxDts?: DtsMode
  manifest?: boolean
  customElements?: boolean

  /**
   * lazy:
   *   Default. Stencil-style lazy loader.
   *   Registers lightweight ProxyClass on startup; loads real component
   *   entry only on element connectedCallback.
   *
   * side-effect:
   *   Immediately registers full components on import.
   */
  register?: WebCRegisterMode

  /**
   * Whether to generate the auto.js entry (lazy mode).
   *
   * @default true
   */
  autoEntry?: boolean

  /**
   * Vue / React wrapper mode.
   *
   * runtime:
   *   Default. Generates thin proxies powered by framework-specific runtime
   *   helpers.
   *
   * minimal:
   *   Only renders the custom element tag. No watch/sync/event bridge.
   *
   * event-bridge:
   *   Adds prop sync and event listeners for declared component events.
   */
  wrapper?: WebCWrapperMode
}

export type ComponentLibraryTarget = 'wc' | 'react' | 'vue'

export function componentLibrary(
  options: ComponentLibraryPresetOptions = {},
): ZeusComponentPlugin[] {
  const targets = new Set(options.targets ?? ['wc', 'react', 'vue'])

  if (targets.has('react') || targets.has('vue')) {
    targets.add('wc')
  }

  const plugins: ZeusComponentPlugin[] = []

  const registerMode = options.register ?? 'lazy'

  if (options.styles !== false) {
    plugins.push(
      css(typeof options.styles === 'string' ? { input: options.styles } : {}),
    )
  }

  if (targets.has('wc')) {
    const wcOptions: OutputWCOptions = {
      register: registerMode,
      dts: options.dts ?? true,
      jsxDts: options.jsxDts ?? true,
      manifestFile: options.manifest !== false ? 'zeus.components.json' : false,
      customElementsFile:
        options.customElements !== false ? 'custom-elements.json' : false,
      auto: options.autoEntry ?? true,
      entryFileName: tag => `${tag}.entry`,
    }
    plugins.push(wc(wcOptions))
  }

  if (targets.has('react')) {
    const reactOptions: OutputReactWrapperOptions = {
      dts: options.dts ?? true,
      wrapper: options.wrapper ?? 'runtime',
    }
    plugins.push(react(reactOptions))
  }

  if (targets.has('vue')) {
    const vueOptions: OutputVueWrapperOptions = {
      dts: options.dts ?? true,
      globalDts: options.dts ?? 'auto',
      wrapper: options.wrapper ?? 'runtime',
    }
    plugins.push(vue(vueOptions))
  }

  return plugins
}

export { css, wc, react, vue }
