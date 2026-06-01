import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateVueIndexOptions {
  getFileName: (tag: string) => string
}

export function generateVueIndex(
  components: ComponentRecord[],
  options: GenerateVueIndexOptions,
): string {
  const lines: string[] = []

  for (const component of components) {
    const fileName = options.getFileName(component.tag)
    lines.push(`export * from './${fileName}';`)
  }

  lines.push('')

  return lines.join('\n')
}
