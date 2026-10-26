import assert from 'node:assert/strict'

export interface GoldenEventSnapshot {
  name: string
  reactName: string
  detail?: Record<string, string>
  detailOptional?: string[]
  [key: string]: unknown
}

export interface GoldenComponentSnapshot {
  tag: string
  exportName: string
  shadow: boolean
  props: Array<Record<string, unknown> & { name: string }>
  events: Record<string, GoldenEventSnapshot>
  methods: Record<string, unknown>
  models: unknown[]
  slots: string[]
}

export interface GoldenGroupSnapshot {
  package: string
  components: GoldenComponentSnapshot[]
}

interface ManifestComponent {
  tag: string
  exportName: string
  meta?: { shadow?: boolean }
  props?: Record<
    string,
    {
      type?: string
      required?: boolean
      attr?: string | false
      reflect?: boolean
      default?: unknown
      defaultStrategy?: string
      values?: unknown[]
      declaration?: { type?: string }
    }
  >
  events?: Record<string, GoldenEventSnapshot>
  methods?: Record<string, unknown>
  models?: unknown[]
  slots?: Record<string, unknown>
}

/** The public API projection frozen in golden-components.json, not build metadata. */
export function snapshotGoldenComponents(
  content: string,
): GoldenComponentSnapshot[] {
  const manifest = JSON.parse(content) as { components: ManifestComponent[] }
  return manifest.components.map(component => ({
    tag: component.tag,
    exportName: component.exportName,
    shadow: component.meta?.shadow ?? false,
    props: Object.entries(component.props ?? {}).map(([name, prop]) => ({
      name,
      type: prop.type ?? 'unknown',
      ...(prop.required === true ? { required: true } : {}),
      attribute:
        prop.attr ??
        (['string', 'number', 'boolean'].includes(prop.type ?? '')
          ? name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
          : false),
      reflect: prop.reflect ?? false,
      ...(Object.prototype.hasOwnProperty.call(prop, 'default')
        ? { default: prop.default }
        : {}),
      ...(prop.defaultStrategy === 'factory'
        ? { defaultStrategy: 'factory' }
        : {}),
      ...(prop.values ? { values: prop.values } : {}),
      ...(prop.declaration?.type ? { declaration: prop.declaration.type } : {}),
    })),
    events: component.events ?? {},
    methods: component.methods ?? {},
    models: component.models ?? [],
    slots: Object.keys(component.slots ?? {}),
  }))
}

function canonicalSnapshot(components: GoldenComponentSnapshot[]): unknown {
  return components
    .map(component => ({
      ...component,
      props: [...component.props].sort((a, b) => a.name.localeCompare(b.name)),
      slots: [...component.slots].sort(),
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag))
}

export function verifyGoldenComponentSnapshot(
  content: string,
  group: GoldenGroupSnapshot,
): void {
  try {
    assert.deepEqual(
      canonicalSnapshot(snapshotGoldenComponents(content)),
      canonicalSnapshot(group.components),
    )
  } catch (error) {
    throw new Error(
      `${group.package} Component Manifest API differs from the frozen component snapshot: ${String(error)}`,
    )
  }
}

export function supportsGoldenDialogDefaults(
  groups: GoldenGroupSnapshot[],
): boolean {
  const dialog = findDialog(groups)
  const open = dialog.props.find(prop => prop.name === 'open')
  return open?.defaultStrategy === 'factory'
}

export function supportsGoldenDialogOptionalEvent(
  groups: GoldenGroupSnapshot[],
): boolean {
  return (
    findDialog(groups).events.openChange?.detailOptional?.includes(
      'nativeEvent',
    ) === true
  )
}

function findDialog(groups: GoldenGroupSnapshot[]): GoldenComponentSnapshot {
  const dialog = groups
    .flatMap(group => group.components)
    .find(component => component.tag === 'zw-dialog')
  assert(dialog, 'Golden contract must contain zw-dialog')
  return dialog
}

export function goldenTypeFixture(
  consumer: string,
  groups: GoldenGroupSnapshot[],
): { source: string; publicEntries: string[] } {
  const publicEntries: string[] = []
  const lines = [
    '// Compiled with strict TypeScript against the isolated registry installation.',
    'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false',
    'type Expect<T extends true> = T',
    'type DetailOf<T> = T extends (event: infer E) => unknown ? E extends CustomEvent<infer D> ? D : never : never',
    ...(consumer === 'native'
      ? ["import type { JSX } from '@zeus-js/zeus/jsx'"]
      : []),
  ]
  for (const group of groups) {
    const component = group.components[0]
    assert(component, `${group.package} has no primary component`)
    const name = component.exportName
    const entry = `${group.package}/${consumer === 'native' ? 'wc' : consumer.startsWith('react') ? 'react' : 'vue'}`
    publicEntries.push(entry)
    if (consumer === 'native') {
      lines.push(
        `import type { ${name}Element, ${name}EventMap } from ${JSON.stringify(entry)}`,
      )
      lines.push(
        `type ${name}Props = JSX.IntrinsicElements[${JSON.stringify(component.tag)}]`,
      )
      lines.push(`declare const native${name}: ${name}Element`)
    } else if (consumer.startsWith('react')) {
      lines.push(`import type { ${name}Props } from ${JSON.stringify(entry)}`)
    } else {
      lines.push(
        `import { ${name} as Vue${name} } from ${JSON.stringify(entry)}`,
      )
      lines.push(
        `type ${name}Props = InstanceType<typeof Vue${name}>['$props']`,
      )
    }
    for (const [key, event] of Object.entries(component.events)) {
      const handler =
        consumer === 'vue3'
          ? `on${event.name[0].toUpperCase()}${event.name.slice(1)}`
          : event.reactName
      const detailName = `${name}${key}Detail`
      const expected = event.detail
        ? `{ ${Object.entries(event.detail)
            .map(
              ([field, type]) =>
                `${JSON.stringify(field)}${event.detailOptional?.includes(field) ? '?' : ''}: ${detailType(type)}`,
            )
            .join('; ')} }`
        : 'unknown'
      lines.push(
        `type ${detailName} = DetailOf<NonNullable<${name}Props[${JSON.stringify(handler)}]>>`,
      )
      lines.push(
        `type Check${detailName} = Expect<Equal<${detailName}, ${expected}>>`,
      )
      if (consumer === 'native') {
        lines.push(
          `type CheckNative${detailName} = Expect<Equal<${name}EventMap[${JSON.stringify(event.name)}], CustomEvent<${expected}>>>`,
        )
      }
    }
  }
  const dialog = findDialog(groups)
  assert(
    dialog.events.openChange?.detail?.open === 'boolean',
    'Golden Dialog must declare detail.open as boolean',
  )
  const optional = supportsGoldenDialogOptionalEvent(groups)
  const invalidEventHandler =
    consumer === 'vue3' ? 'onOpen-chagne' : 'onOpenChagne'
  lines.push(
    '// @ts-expect-error event listener names must match the public component declaration',
    `const invalidDialogEvent: DialogProps = { ${JSON.stringify(invalidEventHandler)}: () => {} }`,
    'const button: ButtonProps = { disabled: false, loading: true }',
    '// @ts-expect-error disabled must remain boolean',
    'const invalidButton: ButtonProps = { disabled: "yes" }',
    'const input: InputProps = { formatter: value => value.trim() }',
    '// @ts-expect-error formatter must return a string',
    'const invalidInput: InputProps = { formatter: () => 42 }',
    'const grid: DataGridProps = { rows: [{ id: "row-1" }], columns: [{ id: "name", field: "name" }], selectedKeys: ["row-1"] }',
    '// @ts-expect-error rows must remain an array',
    'const invalidGrid: DataGridProps = { rows: "row-1" }',
    'declare const dialogDetail: DialogopenChangeDetail',
    'const nativeEvent: Event | undefined = dialogDetail.nativeEvent',
    ...(optional
      ? []
      : ['// @ts-expect-error the frozen legacy detail requires nativeEvent']),
    'const omittedNativeEvent: DialogopenChangeDetail = { open: true }',
    'const providedNativeEvent: DialogopenChangeDetail = { open: false, nativeEvent: new Event("close") }',
    '// @ts-expect-error open remains required even when nativeEvent is optional',
    'const missingOpen: DialogopenChangeDetail = { nativeEvent: new Event("open") }',
    '// @ts-expect-error open must remain boolean',
    'const invalidOpen: DialogopenChangeDetail = { open: "yes", nativeEvent: new Event("open") }',
    ...(optional
      ? [
          '// @ts-expect-error an optional nativeEvent cannot be read as a required Event',
        ]
      : []),
    'const requiredNativeEvent: Event = dialogDetail.nativeEvent',
  )
  if (consumer === 'native')
    lines.push(
      'nativeButton.disabled = true',
      'nativeInput.value = "Ada"',
      'nativeDataGrid.rows = [{ id: "row-1" }]',
      'const shown: Promise<void> = nativeDialog.show()',
      'const closed: Promise<void> = nativeDialog.close()',
      '// @ts-expect-error misspelled custom events are not declared in the public EventMap',
      "type InvalidDialogEvent = DialogEventMap['open-chagne']",
      "nativeDialog.addEventListener('open-change', event => {",
      '  const open: boolean = event.detail.open',
      '  // @ts-expect-error typed public listeners retain the boolean open detail',
      '  const invalidOpen: string = event.detail.open',
      '})',
      '// @ts-expect-error the public WC open property must remain boolean',
      'nativeDialog.open = "yes"',
    )
  return {
    source: `${lines.join('\n')}\n`,
    publicEntries,
  }
}

function detailType(type: string): string {
  if (type === 'array') return 'unknown[]'
  if (type === 'object') return 'Record<string, unknown>'
  if (type === 'function') return 'Function'
  return type || 'unknown'
}
