import type { ComponentMeta, OutputTarget } from '../index'

export function generateReact(
  components: ComponentMeta[],
  options: OutputTarget
) {
  return `
import { createComponent } from '@zeus.js/react';

${components
  .map(
    comp => `
export const ${comp.className} = createComponent<${comp.className}Props>({
  tagName: '${comp.tagName}',
  events: {${comp.events
    .map(
      e => `
    ${e.name}: '${e.eventName}'`
    )
    .join(',')}
  },
  element: HTMLElement
});
`
  )
  .join('\n')}
  `
}
