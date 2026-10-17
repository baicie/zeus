import { toAbsoluteImportPath } from './imports'

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateWCEntryOptions {
  root: string
  component: ComponentRecord
}

export function generateWCEntry(options: GenerateWCEntryOptions): string {
  const { root, component } = options
  const source = toAbsoluteImportPath(root, component.source)

  return [
    `import { ${component.exportName} } from ${JSON.stringify(source)};`,
    '',
    `export { ${component.exportName} };`,
    '',
    `export function defineCustomElement(options = {}) {`,
    `  const registry = options.registry ?? (typeof customElements === 'undefined' ? undefined : customElements);`,
    `  if (!registry) return;`,
    `  const existing = registry.get(${JSON.stringify(component.tag)});`,
    `  if (existing === ${component.exportName}) return;`,
    `  if (existing) throw new Error(${JSON.stringify(`[ZEUS_WC_DUPLICATE_TAG] <${component.tag}> is already registered with a different definition.`)});`,
    `  registry.define(${JSON.stringify(component.tag)}, ${component.exportName});`,
    `}`,
    '',
  ].join('\n')
}
