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
  ].join('\n')
}
