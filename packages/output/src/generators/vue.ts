export function generateVue(
  components: ComponentMeta[],
  options: OutputTarget
) {
  return `
import { defineCustomElement } from '@zeus-js/vue';

${components
  .map(
    comp => `
export const ${comp.className} = defineCustomElement({
  name: '${comp.tagName}',
  props: {${comp.properties
    .map(
      p => `
    ${p.name}: ${p.type}`
    )
    .join(',')}
  },
  emits: [${comp.events.map(e => `'${e.eventName}'`).join(', ')}]
});
`
  )
  .join('\n')}
  `
}
