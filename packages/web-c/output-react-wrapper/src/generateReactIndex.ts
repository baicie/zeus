import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateReactIndexOptions {
  getFileName: (tag: string) => string
}

export function generateReactIndex(
  components: ComponentRecord[],
  options: GenerateReactIndexOptions,
): string {
  const lines: string[] = []

  for (const component of components) {
    const fileName = options.getFileName(component.tag)
    lines.push(`export { ${component.name} } from './${fileName}';`)
  }

  lines.push('')

  return lines.join('\n')
}
