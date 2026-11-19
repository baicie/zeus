import { analyzeFile } from '@zeus-js/component-analyzer/browser'
import { generateComponentWCDts } from '@zeus-js/component-dts/browser'

import type { ProjectSnapshot } from './project'
import type {
  ComponentManifest,
  ComponentRecord,
} from '@zeus-js/component-analyzer'

export interface PlaygroundWebCBuild {
  readonly entryPath: string
  readonly metadata: PlaygroundWebCMetadata
  readonly files: readonly {
    readonly path: string
    readonly content: string
  }[]
}

/**
 * Emits the files a WebC Studio export needs and that its inspector renders:
 * the module manifest, Custom Elements Manifest view and per-tag declarations.
 */
export function buildWebCArtifacts(
  snapshot: ProjectSnapshot,
): PlaygroundWebCBuild {
  const metadata = analyzeWebCProject(snapshot)
  const files = [
    {
      path: 'webc/zeus.components.json',
      content: `${JSON.stringify(metadata.manifest, null, 2)}\n`,
    },
    {
      path: 'webc/custom-elements.json',
      content: `${metadata.customElements}\n`,
    },
    ...Object.entries(metadata.declarations).map(([tag, declaration]) => ({
      path: `webc/${tag}.d.ts`,
      content: declaration,
    })),
  ]
  return {
    entryPath: snapshot.entryPath,
    metadata,
    files,
  }
}

export interface PlaygroundWebCMetadata {
  readonly manifest: ComponentManifest
  readonly customElements: string
  readonly declarations: Readonly<Record<string, string>>
  readonly inspector: readonly PlaygroundComponentInspector[]
  readonly diagnostics: readonly {
    readonly code: string
    readonly message: string
    readonly filename: string
    readonly severity: 'error' | 'warning'
  }[]
}

export interface PlaygroundComponentInspector {
  readonly tag: string
  readonly shadow: boolean
  readonly formAssociated: boolean
  readonly props: readonly {
    readonly name: string
    readonly type: string
    readonly attribute: string | false
    readonly required: boolean
    readonly default: unknown
  }[]
  readonly events: readonly {
    readonly name: string
    readonly detail: Readonly<Record<string, string>>
    readonly bubbles: boolean
    readonly composed: boolean
  }[]
  readonly slots: readonly string[]
  readonly reactUsage: string
  readonly vueUsage: string
}

/**
 * Analyzes every source module in a WebC project with the same analyzer used
 * by the production output plugins. The returned manifest is the single
 * metadata source for the inspector, CEM and DTS surfaces.
 */
export function analyzeWebCProject(
  snapshot: ProjectSnapshot,
): PlaygroundWebCMetadata {
  if (snapshot.frameworkTarget !== 'webc') {
    throw new TypeError('WebC metadata requires a "webc" project snapshot.')
  }
  const components: ComponentRecord[] = []
  const diagnostics: PlaygroundWebCMetadata['diagnostics'][number][] = []
  const declarations: Record<string, string> = {}

  for (const file of snapshot.files) {
    if (file.language !== 'ts' && file.language !== 'tsx') continue
    const result = analyzeFile({ file: file.path, code: file.content })
    for (const diagnostic of result.diagnostics) {
      diagnostics.push({
        code:
          diagnostic.level === 'error'
            ? 'ZEUS_PLAYGROUND_ELEMENT_INVALID'
            : 'ZEUS_PLAYGROUND_ELEMENT_WARNING',
        message: diagnostic.message,
        filename: diagnostic.file,
        severity: diagnostic.level,
      })
    }
    for (const component of result.components) {
      components.push(component)
      declarations[component.tag] = generateComponentWCDts(component)
    }
  }

  const seen = new Set<string>()
  for (const component of components) {
    if (seen.has(component.tag)) {
      diagnostics.push({
        code: 'ZEUS_PLAYGROUND_ELEMENT_DUPLICATE',
        message: `Custom element <${component.tag}> is defined more than once.`,
        filename: component.source,
        severity: 'error',
      })
    }
    seen.add(component.tag)
  }

  const manifest: ComponentManifest = {
    schemaVersion: 1,
    components,
  }

  return {
    manifest,
    customElements: JSON.stringify(
      manifest.components.map(component => ({
        tag: component.tag,
        name: component.name,
        props: component.props,
        events: component.events,
        slots: component.slots,
        methods: component.methods ?? [],
        shadow: component.meta?.shadow ?? true,
      })),
      null,
      2,
    ),
    declarations,
    inspector: components.map(component => inspectorFor(component)),
    diagnostics,
  }
}

function inspectorFor(
  component: ComponentRecord,
): PlaygroundComponentInspector {
  const attributes = Object.entries(component.props).map(([name, prop]) => ({
    name,
    type: prop.declaration?.type ?? prop.type,
    attribute:
      prop.attr === false
        ? (false as const)
        : (prop.attr ??
          name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)),
    required: prop.required === true,
    default: prop.default,
  }))
  const events = Object.entries(component.events).map(([key, event]) => ({
    name: event.name ?? key,
    detail: event.detail ?? {},
    bubbles: event.bubbles !== false,
    composed: event.composed === true,
  }))
  const slots = Object.entries(component.slots).map(([name]) => name)
  const subject = component.tag
  return {
    tag: subject,
    shadow: component.meta?.shadow !== false,
    formAssociated: component.meta?.formAssociated === true,
    props: attributes,
    events,
    slots,
    reactUsage: `import { ${component.name} } from './react/index.js'\n\n<${component.name} ${attributes
      .filter(prop => prop.attribute !== false)
      .map(prop => `${prop.name}={/* ${prop.type} */}`)
      .join(' ')} />`,
    vueUsage: `<script setup>\nimport { ${component.name} } from './vue/index.js'\n</script>\n\n<template>\n  <${component.name}${attributes
      .filter(prop => prop.attribute !== false)
      .map(prop => ` :${prop.name}="value"`)
      .join('')} />\n</template>`,
  }
}
