// packages/web-c/output-wc/src/generateLazyEntry.ts
// Generates *.entry.js for lazy loading mode (real component implementation)

import { normalizePath } from './imports'

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateLazyEntryOptions {
  component: ComponentRecord
  outPath: string
  sourceImport?: string
}

export function generateLazyEntry(options: GenerateLazyEntryOptions): string {
  const { component, outPath, sourceImport } = options
  const source = sourceImport ?? toRelativeImport(component.source, outPath)

  return [
    `import { mountElementDefinition } from "@zeus-js/runtime-dom";`,
    `import { ${component.exportName} } from ${JSON.stringify(source)};`,
    '',
    `class ${component.name}Component {`,
    `  constructor(hostRef) {`,
    `    this.hostRef = hostRef;`,
    `    this.mounted = undefined;`,
    `    this.mountState = {};`,
    `  }`,
    '',
    `  connected() {`,
    `    if (this.mounted) {`,
    `      return;`,
    `    }`,
    `    this.mounted = mountElementDefinition(`,
    `      ${component.exportName},`,
    `      this.hostRef.host,`,
    `      this.hostRef.values,`,
    `      this.mountState,`,
    `    );`,
    `  }`,
    '',
    `  disconnected() {`,
    `    this.mounted?.dispose();`,
    `    this.mounted = undefined;`,
    `  }`,
    '',
    `  propertyChanged(name, oldValue, newValue) {`,
    `    this.mounted?.propertyChanged(name, oldValue, newValue);`,
    `  }`,
    '',
    `  attributeChanged(name, oldValue, newValue) {`,
    `    // Prop-backed attributes are synced by the lazy runtime before this hook.`,
    `  }`,
    '',
    `  render() {`,
    `    // mountElementDefinition owns rendering so component setup still runs once.`,
    `  }`,
    `}`,
    '',
    `export function createComponent(hostRef) {`,
    `  return new ${component.name}Component(hostRef);`,
    `}`,
    '',
    `const moduleExports = {`,
    `  createComponent,`,
    `};`,
    '',
    `export default moduleExports;`,
    '',
  ]
    .filter(line => line.trim() !== '')
    .join('\n')
}

function toRelativeImport(source: string, outPath: string): string {
  const sourceParts = normalizePath(source).split('/')
  const outParts = normalizePath(outPath).split('/')

  let common = 0
  for (let i = 0; i < Math.min(sourceParts.length, outParts.length); i++) {
    if (sourceParts[i] === outParts[i]) {
      common++
    } else {
      break
    }
  }

  const ups = outParts.slice(common).map(() => '..')
  const rel = [...ups, ...sourceParts.slice(common)]
  return rel.join('/')
}
