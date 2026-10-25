import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

import {
  goldenTypeFixture,
  snapshotGoldenComponents,
  supportsGoldenDialogDefaults,
  supportsGoldenDialogOptionalEvent,
  verifyGoldenComponentSnapshot,
  type GoldenGroupSnapshot,
} from '../golden-component-fixtures'

const contract = JSON.parse(
  fs.readFileSync(
    path.resolve('tests/contracts/golden-components.json'),
    'utf8',
  ),
) as { groups: GoldenGroupSnapshot[] }

function manifest() {
  return {
    schemaVersion: 1,
    components: [
      {
        tag: 'zw-dialog',
        exportName: 'Dialog',
        meta: { shadow: false },
        props: {
          open: {
            type: 'boolean',
            reflect: true,
            defaultStrategy: 'factory',
            declaration: { type: 'boolean' },
          },
          defaultOpen: {
            type: 'boolean',
            default: false,
            attr: 'default-open',
          },
        },
        events: {
          openChange: {
            key: 'openChange',
            name: 'open-change',
            reactName: 'onOpenChange',
            detail: { open: 'boolean', nativeEvent: 'Event' },
            detailOptional: ['nativeEvent'],
            bubbles: true,
            composed: true,
            cancelable: false,
          },
        },
        methods: {
          show: { name: 'show', returns: 'void', parameters: [], async: false },
        },
        slots: { default: { name: 'default' } },
        models: [],
      },
    ],
  }
}

function legacyContract(groups = contract.groups): GoldenGroupSnapshot[] {
  return groups.map(group =>
    group.package === '@zeus-web/dialog'
      ? {
          ...group,
          components: group.components.map(component =>
            component.tag === 'zw-dialog'
              ? {
                  ...component,
                  props: component.props.map(prop =>
                    prop.name === 'open'
                      ? { ...prop, default: false, defaultStrategy: 'static' }
                      : prop,
                  ),
                  events: {
                    ...component.events,
                    openChange: {
                      ...component.events.openChange,
                      detailOptional: [],
                    },
                  },
                }
              : component,
          ),
        }
      : group,
  )
}

function supportedContract(): GoldenGroupSnapshot[] {
  return contract.groups.map(group =>
    group.package === '@zeus-web/dialog'
      ? {
          ...group,
          components: group.components.map(component =>
            component.tag === 'zw-dialog'
              ? {
                  ...component,
                  props: component.props.map(prop =>
                    prop.name === 'open'
                      ? {
                          ...prop,
                          default: undefined,
                          defaultStrategy: 'factory',
                        }
                      : prop,
                  ),
                  events: {
                    ...component.events,
                    openChange: {
                      ...component.events.openChange,
                      detailOptional: ['nativeEvent'],
                    },
                  },
                }
              : component,
          ),
        }
      : group,
  )
}

describe('Golden published component API snapshot', () => {
  it('compares the complete public projection, independently of its content hash', () => {
    const content = JSON.stringify(manifest())
    const components = snapshotGoldenComponents(content)
    expect(components[0].props).toContainEqual({
      name: 'open',
      type: 'boolean',
      attribute: 'open',
      reflect: true,
      defaultStrategy: 'factory',
      declaration: 'boolean',
    })
    expect(() =>
      verifyGoldenComponentSnapshot(content, {
        package: '@zeus-web/dialog',
        components,
      }),
    ).not.toThrow()
    components[0].events.openChange.detailOptional = []
    expect(() =>
      verifyGoldenComponentSnapshot(content, {
        package: '@zeus-web/dialog',
        components,
      }),
    ).toThrow('differs from the frozen component snapshot')
  })

  it.each(['property', 'component', 'method'] as const)(
    'rejects an added %s omitted from the frozen snapshot',
    kind => {
      const original = manifest()
      const components = snapshotGoldenComponents(JSON.stringify(original))
      const changed = manifest()
      if (kind === 'property')
        Object.assign(changed.components[0].props, {
          modal: { type: 'boolean', default: true },
        })
      if (kind === 'method')
        Object.assign(changed.components[0].methods, {
          close: {
            name: 'close',
            parameters: [],
            returns: 'void',
            async: false,
          },
        })
      if (kind === 'component')
        changed.components.push({
          ...changed.components[0],
          tag: 'zw-dialog-overlay',
          exportName: 'DialogOverlay',
        })
      expect(() =>
        verifyGoldenComponentSnapshot(JSON.stringify(changed), {
          package: '@zeus-web/dialog',
          components,
        }),
      ).toThrow('Component Manifest API differs')
    },
  )

  it('rejects a property becoming required without updating the frozen snapshot', () => {
    const original = manifest()
    Object.assign(original.components[0].props.open, { required: false })
    const components = snapshotGoldenComponents(JSON.stringify(original))
    expect(components).toEqual(
      snapshotGoldenComponents(JSON.stringify(manifest())),
    )
    Object.assign(original.components[0].props.open, { required: true })
    const content = JSON.stringify(original)

    expect(() =>
      verifyGoldenComponentSnapshot(content, {
        package: '@zeus-web/dialog',
        components,
      }),
    ).toThrow('Component Manifest API differs')
    expect(snapshotGoldenComponents(content)[0].props).toContainEqual({
      name: 'open',
      type: 'boolean',
      required: true,
      attribute: 'open',
      reflect: true,
      defaultStrategy: 'factory',
      declaration: 'boolean',
    })
  })

  it('does not confuse object/property order with API drift', () => {
    const content = JSON.stringify(manifest())
    const components = snapshotGoldenComponents(content)
    components[0].props.reverse()
    expect(() =>
      verifyGoldenComponentSnapshot(content, {
        package: '@zeus-web/dialog',
        components,
      }),
    ).not.toThrow()
  })
})

describe('Golden isolated TypeScript consumers', () => {
  it('keeps legacy limits tied to the frozen contract', () => {
    const legacy = legacyContract(supportedContract())
    expect(supportsGoldenDialogDefaults(legacy)).toBe(false)
    expect(supportsGoldenDialogOptionalEvent(legacy)).toBe(false)
    const source = goldenTypeFixture('react18', legacy).source
    expect(source).toContain('the frozen legacy detail requires nativeEvent')
    expect(source).toContain('"nativeEvent": Event')
    expect(source).not.toContain(
      'optional nativeEvent cannot be read as a required Event',
    )
  })

  it('requires supported optional details while retaining the required open field', () => {
    const groups = supportedContract()
    expect(supportsGoldenDialogDefaults(groups)).toBe(true)
    expect(supportsGoldenDialogOptionalEvent(groups)).toBe(true)
    const source = goldenTypeFixture('react19', groups).source
    expect(source).toContain('"open": boolean; "nativeEvent"?: Event')
    expect(source).toContain(
      'const omittedNativeEvent: DialogopenChangeDetail = { open: true }',
    )
    expect(source).not.toContain(
      'the frozen legacy detail requires nativeEvent',
    )
    expect(source).toContain(
      'open remains required even when nativeEvent is optional',
    )
    expect(source).toContain(
      'optional nativeEvent cannot be read as a required Event',
    )
  })

  it.each(['native', 'react18', 'react19', 'vue3'])(
    'emits syntactically valid positive/negative fixtures for %s',
    consumer => {
      const fixture = goldenTypeFixture(consumer, supportedContract())
      const source = ts.createSourceFile(
        'consumer-types.ts',
        fixture.source,
        ts.ScriptTarget.Latest,
        true,
      )
      expect(
        (source as ts.SourceFile & { parseDiagnostics: unknown[] })
          .parseDiagnostics,
      ).toEqual([])
      expect(fixture.publicEntries).toHaveLength(4)
      expect(fixture.source).toContain(
        '@ts-expect-error rows must remain an array',
      )
      expect(fixture.source).toContain('CheckDialogopenChangeDetail')
      expect(fixture.source).toContain(
        'event listener names must match the public component declaration',
      )
      expect(fixture.source).toContain(
        consumer === 'vue3' ? '\"onOpen-chagne\"' : '\"onOpenChagne\"',
      )
      if (consumer === 'native') {
        expect(fixture.publicEntries).toContain('@zeus-web/dialog/wc')
        expect(fixture.source).toContain('JSX.IntrinsicElements["zw-dialog"]')
        expect(fixture.source).toContain("DialogEventMap['open-chagne']")
        expect(fixture.source).toContain('CheckNativeDialogopenChangeDetail')
        expect(fixture.source).not.toContain('../node_modules/')
        expect(fixture.source).toContain(
          'const shown: Promise<void> = nativeDialog.show()',
        )
      } else {
        expect(fixture.source).not.toContain('../node_modules/')
      }
      if (consumer === 'vue3')
        expect(fixture.source).toContain('DialogProps["onOpen-change"]')
    },
  )
})
