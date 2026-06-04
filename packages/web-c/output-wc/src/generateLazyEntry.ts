// packages/web-c/output-wc/src/generateLazyEntry.ts
// Generates *.entry.ts for lazy loading mode (real component implementation)

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
  const shadow = component.meta?.shadow ?? true

  return [
    `import { ${component.exportName} } from ${JSON.stringify(source)};`,
    '',
    `class ${component.name}Component {`,
    `  constructor(hostRef) {`,
    `    this.hostRef = hostRef;`,
    `  }`,
    '',
    `  connected() {`,
    `    // Runtime calls render after connected().`,
    `  }`,
    '',
    `  disconnected() {`,
    `    // TODO: cleanup effects, timers, listeners`,
    `  }`,
    '',
    `  propertyChanged(name, oldValue, newValue) {`,
    `    this.render();`,
    `  }`,
    '',
    `  attributeChanged(name, oldValue, newValue) {`,
    `    this.render();`,
    `  }`,
    '',
    `  render() {`,
    `    const host = this.hostRef.host;`,
    `    const root = ${shadow ? 'host.shadowRoot ?? host.attachShadow({ mode: "open" })' : 'host'};`,
    `    const node = ${component.exportName}(host);`,
    `    if (typeof node === "string") {`,
    `      root.innerHTML = node;`,
    `      return;`,
    `    }`,
    `    if (Array.isArray(node)) {`,
    `      root.replaceChildren(...node);`,
    `      return;`,
    `    }`,
    `    if (node) {`,
    `      root.replaceChildren(node);`,
    `      return;`,
    `    }`,
    `    root.replaceChildren();`,
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
