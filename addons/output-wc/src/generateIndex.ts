import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateWCIndexOptions {
  components: ComponentRecord[]
}

export function generateWCIndex(options: GenerateWCIndexOptions): string {
  const { components } = options

  const lines: string[] = []

  for (const component of components) {
    const id = getVirtualComponentId(component)
    lines.push(`export * from ${JSON.stringify(id)};`)
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
