import type { OutputVueWrapperOptions } from './types'
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export function generateVueIndex(
  components: ComponentRecord[],
  options: OutputVueWrapperOptions,
): string {
  const lines: string[] = []

  for (const component of components) {
    const virtualId = `zeus:vue:${component.tag}`

    lines.push(`export { ${component.name} } from '${virtualId}';`)
  }

  lines.push('')

  return lines.join('\n')
}
