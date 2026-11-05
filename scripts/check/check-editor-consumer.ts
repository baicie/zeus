import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { generateVSCodeCustomData } from '@zeus-js/output-wc'
import htmlLanguageService from 'vscode-html-languageservice'
import { TextDocument } from 'vscode-languageserver-textdocument'

const { getLanguageService, newHTMLDataProvider } = htmlLanguageService
const root = path.resolve(import.meta.dirname, '../..')
const generated = path.join(root, 'examples/web-component/dist')
const output = path.join(root, 'temp/pr23-editor-consumer')
const workspace = await fs.mkdtemp(
  path.join(os.tmpdir(), 'zeus-editor-consumer-'),
)

try {
  const cemSource = await fs.readFile(
    path.join(generated, 'custom-elements.json'),
    'utf8',
  )
  const customDataSource = await fs.readFile(
    path.join(generated, 'vscode.html-custom-data.json'),
    'utf8',
  )
  const jsxTypes = await fs.readFile(
    path.join(generated, 'wc/types/jsx.d.ts'),
    'utf8',
  )
  const indexTypes = await fs.readFile(
    path.join(generated, 'wc/index.d.ts'),
    'utf8',
  )
  const expected = generateVSCodeCustomData(cemSource)

  assert.equal(
    customDataSource,
    expected,
    'vscode.html-custom-data.json must be generated from the current CEM.',
  )

  await fs.mkdir(path.join(workspace, '.vscode'), { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(workspace, 'custom-elements.json'), cemSource),
    fs.writeFile(
      path.join(workspace, 'vscode.html-custom-data.json'),
      customDataSource,
    ),
    fs.writeFile(
      path.join(workspace, 'consumer.html'),
      '<z-host-button size="md" variant="outline">Save</z-host-button>\n',
    ),
    fs.writeFile(
      path.join(workspace, '.vscode/settings.json'),
      `${JSON.stringify(
        {
          'html.customData': ['./vscode.html-custom-data.json'],
        },
        null,
        2,
      )}\n`,
    ),
  ])

  const cem = JSON.parse(cemSource) as {
    modules: Array<{
      declarations?: Array<{
        customElement?: boolean
        tagName?: string
        events?: Array<{ name?: string }>
        slots?: Array<{ name?: string }>
      }>
    }>
  }
  const declaration = cem.modules
    .flatMap(module => module.declarations ?? [])
    .find(item => item.tagName === 'z-host-button')

  assert(declaration, 'CEM must contain <z-host-button>.')
  assert.deepEqual(
    declaration.events?.map(event => event.name),
    ['press'],
  )
  assert.deepEqual(
    declaration.slots?.map(slot => slot.name),
    [''],
  )
  assert.match(indexTypes, /ZHostButtonEventMap/)
  assert.match(jsxTypes, /onPress/)
  assert.match(jsxTypes, /variant\?: "default" \| "outline"/)
  assert.match(jsxTypes, /"z-host-button": ZHostButtonProps/)

  const customData = JSON.parse(customDataSource)
  const service = getLanguageService({
    useDefaultDataProvider: true,
    customDataProviders: [newHTMLDataProvider('zeus-consumer', customData)],
  })
  const complete = (source: string): string[] => {
    const document = TextDocument.create(
      'file:///consumer.html',
      'html',
      0,
      source,
    )
    return service
      .doComplete(
        document,
        document.positionAt(source.length),
        service.parseHTMLDocument(document),
      )
      .items.map(item => item.label)
  }

  const completions = {
    tags: complete('<z-h'),
    attributes: complete('<z-host-button '),
    values: complete('<z-host-button variant="'),
  }
  assert(completions.tags.includes('z-host-button'))
  assert(completions.attributes.includes('size'))
  assert(completions.attributes.includes('variant'))
  assert.deepEqual(completions.values, ['default', 'outline'])

  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        generatedFrom: 'examples/web-component/dist/custom-elements.json',
        customData: 'examples/web-component/dist/vscode.html-custom-data.json',
        workspaceSettings: '.vscode/settings.json',
        completions: {
          tags: completions.tags.filter(label => label === 'z-host-button'),
          attributes: completions.attributes.filter(label =>
            ['size', 'variant'].includes(label),
          ),
          values: completions.values,
        },
        cem: {
          events: declaration.events?.map(event => event.name),
          slots: declaration.slots?.map(slot => slot.name),
        },
        types: {
          event: /onPress/.test(jsxTypes),
          elementEventMap: /ZHostButtonEventMap/.test(indexTypes),
          jsxTag: /"z-host-button": ZHostButtonProps/.test(jsxTypes),
        },
        passed: true,
      },
      null,
      2,
    )}\n`,
  )

  console.log('VSCode HTML Custom Data and CEM editor consumer smoke passed.')
} finally {
  await fs.rm(workspace, { recursive: true, force: true })
}
