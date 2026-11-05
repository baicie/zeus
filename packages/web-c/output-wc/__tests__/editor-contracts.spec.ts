import { describe, expect, it } from 'vitest'
import htmlLanguageService from 'vscode-html-languageservice'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { generateCustomElementsJson } from '../src/generateCustomElementsJson'
import { generateVSCodeCustomData } from '../src/generateVSCodeCustomData'

import type { ComponentRecord } from '@zeus-js/component-analyzer'

const { getLanguageService, newHTMLDataProvider } = htmlLanguageService

function manifest(variantValues = ['default', 'outline']) {
  const component: ComponentRecord = {
    tag: 'z-host-button',
    name: 'ZHostButton',
    exportName: 'ZHostButton',
    source: 'src/host-button.tsx',
    description: 'Host button.',
    props: {
      variant: {
        type: 'string',
        values: variantValues,
        reflect: true,
      },
      initialCount: {
        type: 'number',
      },
    },
    events: {
      press: {
        detail: {
          nativeEvent: 'MouseEvent',
        },
      },
    },
    methods: {
      reset: {
        name: 'reset',
        parameters: [{ name: 'value', type: 'number' }],
        returns: 'void',
      },
    },
    slots: {
      default: { description: 'Button label.' },
      icon: { description: 'Leading icon.' },
    },
    hostAttributes: [],
    cssParts: ['root'],
    cssVars: {},
  }
  return { schemaVersion: 1 as const, components: [component] }
}

function complete(
  customData: Parameters<typeof newHTMLDataProvider>[1],
  source: string,
): string[] {
  const service = getLanguageService({
    useDefaultDataProvider: true,
    customDataProviders: [newHTMLDataProvider('zeus-test', customData)],
  })
  const document = TextDocument.create(
    'file:///editor-smoke.html',
    'html',
    0,
    source,
  )
  const result = service.doComplete(
    document,
    document.positionAt(source.length),
    service.parseHTMLDocument(document),
  )
  return result.items.map(item => item.label)
}

describe('editor metadata contracts', () => {
  it('drives tags, attributes and literal values through VS Code HTML completions', () => {
    const cem = generateCustomElementsJson({
      manifest: manifest(),
      getModulePath: tag => `./wc/${tag}.js`,
    })
    const customData = JSON.parse(generateVSCodeCustomData(cem))

    expect(complete(customData, '<z-h')).toContain('z-host-button')
    expect(complete(customData, '<z-host-button ')).toEqual(
      expect.arrayContaining(['variant', 'initial-count']),
    )
    expect(complete(customData, '<z-host-button variant="')).toEqual([
      'default',
      'outline',
    ])

    const declaration = JSON.parse(cem).modules[0].declarations[0]
    expect(declaration).toMatchObject({
      events: [{ name: 'press' }],
    })
    expect(
      declaration.members.filter(
        (member: { kind: string }) => member.kind === 'method',
      ),
    ).toMatchObject([{ name: 'reset' }])
    expect(declaration.slots).toMatchObject([{ name: '' }, { name: 'icon' }])
  })

  it('updates generated completions when the manifest changes', () => {
    const before = JSON.parse(
      generateVSCodeCustomData(
        generateCustomElementsJson({
          manifest: manifest(),
          getModulePath: tag => `./wc/${tag}.js`,
        }),
      ),
    )
    const after = JSON.parse(
      generateVSCodeCustomData(
        generateCustomElementsJson({
          manifest: manifest(['default', 'outline', 'ghost']),
          getModulePath: tag => `./wc/${tag}.js`,
        }),
      ),
    )

    expect(complete(before, '<z-host-button variant="')).toEqual([
      'default',
      'outline',
    ])
    expect(complete(after, '<z-host-button variant="')).toEqual([
      'default',
      'outline',
      'ghost',
    ])
  })
})
