// packages/web-c/output-wc/src/generateLazyEntry.ts
// Generates *.lazy.js for lazy loading mode (real component implementation)

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
    `export function createComponent(hostRef) {`,
    `  let mounted;`,
    `  const mountState = {`,
    `    attributeProps: hostRef.attributeProps,`,
    `    internals: hostRef.internals,`,
    `    reflectingAttrs: hostRef.reflectingAttrs,`,
    `  };`,
    '',
    `  return {`,
    `    connected() {`,
    `      if (mounted) return;`,
    '',
    `      mounted = mountElementDefinition(`,
    `        ${component.exportName},`,
    `        hostRef.host,`,
    `        hostRef.values,`,
    `        mountState,`,
    `      );`,
    `    },`,
    '',
    `    disconnected() {`,
    `      mounted?.dispose();`,
    `      mounted = undefined;`,
    `    },`,
    '',
    `    propertyChanged(name, oldValue, newValue) {`,
    `      mounted?.propertyChanged(name, oldValue, newValue);`,
    `    },`,
    '',
    `    formAssociated(form) {`,
    `      mounted?.formAssociated(form);`,
    `    },`,
    '',
    `    formDisabled(disabled) {`,
    `      mounted?.formDisabled(disabled);`,
    `    },`,
    '',
    `    formReset() {`,
    `      mounted?.formReset();`,
    `    },`,
    '',
    `    formStateRestore(state, mode) {`,
    `      mounted?.formStateRestore(state, mode);`,
    `    },`,
    `  };`,
    `}`,
    '',
    `export default { createComponent };`,
    '',
  ].join('\n')
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
