import type { OutputReactWrapperOptions } from './types'
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export function generateReactIndex(
  components: ComponentRecord[],
  options: OutputReactWrapperOptions,
): string {
  const lines: string[] = []

  for (const component of components) {
    const virtualId = `zeus:react:${component.tag}`

    lines.push(`export { ${component.name} } from '${virtualId}';`)
  }

  lines.push('')

  return lines.join('\n')
}
