// packages/web-c/output-wc/src/generateLazyManifest.ts
// Generates components.manifest.js for lazy loading mode

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateLazyManifestOptions {
  components: ComponentRecord[]
  getEntryFileName: (tag: string) => string
  tagPrefix?: string
}

export function generateLazyManifest(
  options: GenerateLazyManifestOptions,
): string {
  const { components, getEntryFileName } = options

  const componentEntries = components.map(component => {
    const entryFile = getEntryFileName(component.tag)
    const props = generatePropsArray(component)

    return `  {
    tagName: ${JSON.stringify(component.tag)},
    shadow: ${component.meta?.shadow ?? false},
    load: () => import('./${entryFile}'),
    props: ${props},
  }`
  })

  return `export const components = [
${componentEntries.join(',\n')}
];
`
}

function generatePropsArray(component: ComponentRecord): string {
  const entries = Object.entries(component.props)

  if (entries.length === 0) {
    return '[]'
  }

  const lines = entries.map(([name, prop]) => {
    const parts: string[] = [`name: ${JSON.stringify(name)}`]

    if (prop.attr === false) {
      parts.push('attrName: false')
    } else {
      const attrName = prop.attr ?? toKebabCase(name)
      if (attrName !== toKebabCase(name)) {
        parts.push(`attrName: ${JSON.stringify(attrName)}`)
      }
    }

    parts.push(`type: ${JSON.stringify(prop.type)}`)

    if (prop.reflect) {
      parts.push('reflect: true')
    }

    if (prop.default !== undefined) {
      parts.push(`default: ${JSON.stringify(prop.default)}`)
    }

    return `      { ${parts.join(', ')} }`
  })

  return `[\n${lines.join(',\n')}\n    ]`
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
