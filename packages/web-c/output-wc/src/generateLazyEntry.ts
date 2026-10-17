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
  const source = `${sourceImport ?? toRelativeImport(component.source, outPath)}?zeus-lazy-component=${component.exportName}`

  return [
    `import { createCustomElementMountLifecycle, getElementDefinition, mountElementDefinition } from "@zeus-js/runtime-dom";`,
    `import { resolveHostProperties } from "@zeus-js/web-c-runtime";`,
    `import { ${component.exportName} } from ${JSON.stringify(source)};`,
    '',
    `export function createComponent(hostRef) {`,
    `  resolveHostProperties(hostRef, getElementDefinition(${component.exportName}).propDefs);`,
    `  const mountState = {`,
    `    attributeProps: hostRef.attributeProps,`,
    `    internals: hostRef.internals,`,
    `    reflectingAttrs: hostRef.reflectingAttrs,`,
    `    exposedMethods: hostRef.exposedMethods,`,
    `  };`,
    `  const lifecycle = createCustomElementMountLifecycle(() =>`,
    `    mountElementDefinition(`,
    `      ${component.exportName},`,
    `      hostRef.host,`,
    `      hostRef.values,`,
    `      mountState,`,
    `    ),`,
    `  );`,
    '',
    `  return {`,
    `    connected() {`,
    `      lifecycle.connect();`,
    `    },`,
    '',
    `    disconnected() {`,
    `      lifecycle.disconnect();`,
    `    },`,
    '',
    `    propertyChanged(change) {`,
    `      lifecycle.current()?.propertyChanged(change);`,
    `    },`,
    '',
    `    formAssociated(form) {`,
    `      lifecycle.current()?.formAssociated(form);`,
    `    },`,
    '',
    `    formDisabled(disabled) {`,
    `      lifecycle.current()?.formDisabled(disabled);`,
    `    },`,
    '',
    `    formReset() {`,
    `      lifecycle.current()?.formReset();`,
    `    },`,
    '',
    `    formStateRestore(state, mode) {`,
    `      lifecycle.current()?.formStateRestore(state, mode);`,
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
