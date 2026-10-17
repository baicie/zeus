import { describe, expect, it } from 'vitest'

import { generateVSCodeCustomData } from '../src/generateVSCodeCustomData'

describe('generateVSCodeCustomData', () => {
  it('converts CEM tags, documented attributes, and literal choices', () => {
    const result = generateVSCodeCustomData(
      JSON.stringify({
        schemaVersion: '1.0.0',
        modules: [
          {
            declarations: [
              {
                kind: 'class',
                tagName: 'z-button',
                customElement: true,
                description:
                  'A button component. See [API](https://example.test/button).',
                attributes: [
                  {
                    name: 'variant',
                    description: 'Visual button style.',
                    type: { text: '"solid" | "outline"' },
                  },
                  { name: 'disabled', type: { text: 'boolean' } },
                ],
              },
              { kind: 'function', name: 'registerButton' },
            ],
          },
        ],
      }),
    )

    expect(JSON.parse(result)).toEqual({
      version: 1.1,
      tags: [
        {
          name: 'z-button',
          description:
            'A button component. See [API](https://example.test/button).',
          attributes: [
            {
              name: 'variant',
              description: 'Visual button style.',
              values: [{ name: 'solid' }, { name: 'outline' }],
            },
            { name: 'disabled' },
          ],
        },
      ],
    })
  })

  it('rejects unsupported or duplicate CEM definitions', () => {
    expect(() => generateVSCodeCustomData('{')).toThrow('not valid JSON')
    expect(() =>
      generateVSCodeCustomData(
        JSON.stringify({ schemaVersion: '0.9.0', modules: [] }),
      ),
    ).toThrow('schemaVersion 1.0.0')

    const duplicate = JSON.stringify({
      schemaVersion: '1.0.0',
      modules: [
        {
          declarations: [
            { kind: 'class', tagName: 'z-button', customElement: true },
          ],
        },
        {
          declarations: [
            { kind: 'class', tagName: 'z-button', customElement: true },
          ],
        },
      ],
    })
    expect(() => generateVSCodeCustomData(duplicate)).toThrow('more than once')
  })
})
