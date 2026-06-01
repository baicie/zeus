import { escapeTemplateLiteral } from './svg'

import type { NormalizedIconSource } from './types'

export function generateVueIcon(icon: NormalizedIconSource): string {
  const inner = escapeTemplateLiteral(icon.innerSvg)

  return `
import { defineComponent, h } from 'vue';

export const ${icon.componentName} = defineComponent({
  name: ${JSON.stringify(icon.componentName)},

  props: {
    size: {
      type: [String, Number],
      default: '1em',
    },
    title: {
      type: String,
      default: undefined,
    },
  },

  setup(props, { attrs, slots }) {
    return () => {
      const children = [];

      if (props.title) {
        children.push(h('title', null, props.title));
      }

      if (slots.default) {
        children.push(...slots.default());
      }

      return h(
        'svg',
        {
          ...attrs,
          width: props.size,
          height: props.size,
          viewBox: ${JSON.stringify(icon.viewBox)},
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': props.title ? undefined : true,
          role: props.title ? 'img' : undefined,
          innerHTML: slots.default ? undefined : \`${inner}\`,
        },
        children,
      );
    };
  },
});
`.trimStart()
}

export function generateVueIndex(icons: NormalizedIconSource[]): string {
  return `${icons
    .map(icon => {
      return `export { ${icon.componentName} } from './${icon.name}.js';`
    })
    .join('\n')}\n`
}
