import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Zeus',
  description: 'Compiler-first fine-grained UI framework',
  base: '/zeus/',

  srcExclude: ['internal/**'],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Compiler Host', link: '/compiler-host/overview' },
      { text: 'API', link: '/api/zeus' },
      { text: 'Examples', link: '/examples/counter' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Web Components', link: '/guide/web-components' },
            { text: 'React', link: '/guide/react' },
            { text: 'Vue', link: '/guide/vue' },
            { text: 'Registry', link: '/guide/registry' },
            { text: 'Icons', link: '/guide/icons' },
            { text: 'Theming', link: '/guide/theming' },
            { text: 'State', link: '/guide/state' },
            { text: 'JSX', link: '/guide/jsx' },
            { text: 'Components', link: '/guide/components' },
            { text: 'Refs', link: '/guide/refs' },
            { text: 'Control Flow', link: '/guide/control-flow' },
            { text: 'Runtime Semantics', link: '/guide/runtime-semantics' },
            { text: 'Vite Plugin', link: '/guide/vite-plugin' },
          ],
        },
      ],

      '/compiler-host/': [
        {
          text: 'Compiler Host',
          items: [
            { text: 'Overview', link: '/compiler-host/overview' },
            { text: 'defineElement', link: '/compiler-host/define-element' },
            { text: 'Host & Slot', link: '/compiler-host/host-slot' },
            {
              text: 'Component Analyzer',
              link: '/compiler-host/component-analyzer',
            },
            { text: 'Bundler Plugin', link: '/compiler-host/bundler-plugin' },
            {
              text: 'Output: Web Components',
              link: '/compiler-host/output-wc',
            },
            {
              text: 'Output: React / Vue',
              link: '/compiler-host/output-react-vue',
            },
            { text: 'Output: Icons', link: '/compiler-host/output-icons' },
            { text: 'Manifest', link: '/compiler-host/manifest' },
            { text: 'DTS', link: '/compiler-host/dts' },
            { text: 'Performance', link: '/compiler-host/performance' },
          ],
        },
      ],

      '/components/': [
        {
          text: 'Components',
          items: [
            { text: 'Button', link: '/components/button' },
            { text: 'Switch', link: '/components/switch' },
            { text: 'Checkbox', link: '/components/checkbox' },
            { text: 'Tabs', link: '/components/tabs' },
            { text: 'Dialog', link: '/components/dialog' },
            { text: 'Icon', link: '/components/icon' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API',
          items: [
            { text: '@zeus-js/zeus', link: '/api/zeus' },
            { text: '@zeus-js/signal', link: '/api/signal' },
            { text: '@zeus-js/runtime-dom', link: '/api/runtime-dom' },
            { text: '@zeus-js/compiler', link: '/api/compiler' },
            { text: '@zeus-js/vite-plugin', link: '/api/vite-plugin' },
          ],
        },
      ],

      '/advanced/': [
        {
          text: 'Advanced',
          items: [
            { text: 'Compiler', link: '/advanced/compiler' },
            { text: 'Runtime', link: '/advanced/runtime' },
            { text: 'Reactivity', link: '/advanced/reactivity' },
            { text: 'Performance', link: '/advanced/performance' },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/baicie/zeus',
      },
    ],
  },
})
