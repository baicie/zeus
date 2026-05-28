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
      { text: 'API', link: '/api/zeus' },
      { text: 'Examples', link: '/examples/counter' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'State', link: '/guide/state' },
            { text: 'JSX', link: '/guide/jsx' },
            { text: 'Components', link: '/guide/components' },
            { text: 'Refs', link: '/guide/refs' },
            { text: 'Control Flow', link: '/guide/control-flow' },
            { text: 'Runtime Semantics', link: '/guide/runtime-semantics' },
            { text: 'Web Components', link: '/guide/web-components' },
            { text: 'Vite Plugin', link: '/guide/vite-plugin' },
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
