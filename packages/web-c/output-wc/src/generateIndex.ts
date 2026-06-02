import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateWCIndexOptions {
  components: ComponentRecord[]
  getFileName: (tag: string) => string
}

export function generateWCIndex(options: GenerateWCIndexOptions): string {
  const { components, getFileName } = options

  const lines: string[] = []

  for (const component of components) {
    const fileName = getFileName(component.tag)
    lines.push(`export * from ${JSON.stringify('./' + fileName)};`)
  }

  lines.push('')

  return lines.join('\n')
}

export function getVirtualComponentId(component: ComponentRecord): string {
  return `zeus:wc:${component.tag}`
}

export function getVirtualIndexId(): string {
  return 'zeus:wc:index'
}
