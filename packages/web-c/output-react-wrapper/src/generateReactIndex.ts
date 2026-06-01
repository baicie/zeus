import type { OutputReactWrapperOptions } from './types'
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export function generateReactIndex(
  components: ComponentRecord[],
  options: OutputReactWrapperOptions,
): string {
  const lines: string[] = []

  for (const component of components) {
    const fileName = getJsFileName(component.tag, options)
    lines.push(`export { ${component.name} } from './${fileName}';`)
  }

  lines.push('')

  return lines.join('\n')
}

function getJsFileName(
  tag: string,
  options: OutputReactWrapperOptions,
): string {
  if (options.fileName) {
    return options.fileName(tag).replace(/\.[mc]?js$/, '') + '.js'
  }
  const name = tag.replace(/^z-/, '')
  return `${name}.js`
}
