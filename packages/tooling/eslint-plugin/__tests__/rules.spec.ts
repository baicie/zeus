import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'

import { noInternalImports, validBuiltinUsage } from '../src/rules'

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
      sourceType: 'module',
    },
  },
})

tester.run('no-internal-imports', noInternalImports, {
  valid: [
    "import { createSignal } from '@zeus-js/zeus'",
    "import { createRuntimeDiagnosticsSession } from '@zeus-js/signal/diagnostics'",
    "import type { ZeusComponentPlugin } from '@zeus-js/bundler-plugin'",
    "import value from './local-module'",
  ],
  invalid: [
    {
      code: "import { effect } from '@zeus-js/signal/internal'",
      errors: [{ messageId: 'internalImport' }],
    },
    {
      code: "import { render } from '@zeus-js/runtime-dom/src/render'",
      errors: [{ messageId: 'internalImport' }],
    },
    {
      code: "import value from '../../packages/core/zeus/dist/zeus.js'",
      errors: [{ messageId: 'internalImport' }],
    },
  ],
})

tester.run('valid-builtin-usage', validBuiltinUsage, {
  valid: [
    `
      import { For, Host, Show, Slot, defineElement } from '@zeus-js/zeus'
      const App = () => (
        <>
          <Show when={true}><p>Visible</p></Show>
          <For each={[1, 2]}>{item => <p>{item}</p>}</For>
        </>
      )
      export const Card = defineElement('z-card', {}, () => (
        <Host><Slot /></Host>
      ))
    `,
  ],
  invalid: [
    {
      code: `
        import { Show } from '@zeus-js/zeus'
        const App = () => <Show><p>Missing condition</p></Show>
      `,
      errors: [{ messageId: 'missingShowWhen' }],
    },
    {
      code: `
        import { For } from '@zeus-js/zeus'
        const App = () => <For each={[1]}><p>Missing callback</p></For>
      `,
      errors: [{ messageId: 'missingForChildren' }],
    },
    {
      code: `
        import { Host } from '@zeus-js/zeus'
        const App = () => <Host><p>Outside</p></Host>
      `,
      errors: [{ messageId: 'hostOutsideDefineElement' }],
    },
    {
      code: `
        import { Host, defineElement } from '@zeus-js/zeus'
        const Card = defineElement('z-card', {}, () => (
          <div><Host><p>Nested</p></Host></div>
        ))
      `,
      errors: [{ messageId: 'hostMustBeRoot' }],
    },
    {
      code: `
        import { Host, defineElement } from '@zeus-js/zeus'
        const Card = defineElement('z-card', {}, () => (
          <><Host><p>Fragment root</p></Host></>
        ))
      `,
      errors: [{ messageId: 'hostMustBeRoot' }],
    },
    {
      code: `
        import { Slot, defineElement } from '@zeus-js/zeus'
        const Card = defineElement('z-card', {}, () => <Slot />)
      `,
      errors: [{ messageId: 'slotOutsideHost' }],
    },
  ],
})
