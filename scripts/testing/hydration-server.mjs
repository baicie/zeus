import {
  renderToString,
  ssrAttr,
  ssrElement,
  ssrHydrationMarker,
  ssrCustomElement,
} from '../../packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js'

const html = renderToString(() => [
  ssrElement(
    'main',
    [],
    [
      ssrHydrationMarker('input'),
      ssrElement('input', [
        ssrAttr('aria-label', 'Name'),
        ssrAttr('value', 'Server'),
      ]),
      ssrHydrationMarker('button'),
      ssrElement('button', [], 'Increment'),
      ssrElement('output', [], [ssrHydrationMarker('count'), '0']),
    ],
  ),
  ssrCustomElement('z-ssr-card', {
    attributes: [ssrAttr('title', 'Server card')],
    shadowRoot: [
      ssrElement('style', [], ':host { display: block }'),
      ssrHydrationMarker('shadow-text'),
      ssrElement('strong', [], [ssrHydrationMarker('label'), 'Server shadow']),
      ssrElement('slot', [ssrAttr('name', 'details')], 'Fallback'),
    ],
    children: ssrElement(
      'span',
      [ssrAttr('slot', 'details')],
      'Projected details',
    ),
  }),
])
process.stdout.write(html)
