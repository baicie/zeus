import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { generateReactWrapper } from '../src/generateReactWrapper'

const consumerRequire = createRequire(
  process.env.ZEUS_REACT_CONSUMER_PACKAGE ??
    new URL('../../../../examples/react-wrapper/package.json', import.meta.url),
)

describe('generated React consumers', () => {
  it.each(['runtime', 'minimal', 'event-bridge'] as const)(
    '%s uses a server-safe per-component registration entry',
    async wrapperMode => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), 'zeus-react-consumer-'),
      )
      try {
        const registration = path.join(root, 'registration.mjs')
        await fs.writeFile(
          registration,
          `let registrations = 0;
export const getRegistrations = () => registrations;
export function defineCustomElement() {
  registrations += 1;
  customElements.define('z-generated-button', class extends HTMLElement {
    static get observedAttributes() { return ['value']; }
    attributeChangedCallback(_name, _oldValue, value) {
      if (value === '[object Object]') throw new Error('Complex props must not be serialized before upgrade');
    }
    get value() { return this._value; }
    set value(value) { this._value = value; }
  });
}
`,
        )
        const wrapper = path.join(root, 'wrapper.mjs')
        const generated = generateReactWrapper({
          component: {
            tag: 'z-generated-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/button.tsx',
            props: {
              value: { type: 'object' },
              formatter: { type: 'function' },
              labelText: { type: 'string', attr: 'heading' },
              internal: { type: 'string', attr: false },
              open: { type: 'boolean' },
            },
            events: { valueChange: {} },
            slots: { prefix: {}, default: {} },
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
          mode: wrapperMode,
          namedSlots: 'props',
          wcModuleId: pathToFileURL(registration).href,
        })
          .replace(
            "'react'",
            JSON.stringify(
              pathToFileURL(consumerRequire.resolve('react')).href,
            ),
          )
          .replace(
            "'@zeus-js/output-react-wrapper/runtime'",
            JSON.stringify(
              new URL('../src/runtime/index.ts', import.meta.url).href,
            ),
          )
        await fs.writeFile(wrapper, generated)

        for (const mode of ['server', 'browser']) {
          const result = spawnSync(
            process.execPath,
            [
              '--import',
              'tsx',
              fileURLToPath(
                new URL(
                  './fixtures/generated-wrapper-consumer.mjs',
                  import.meta.url,
                ),
              ),
              mode,
              wrapperMode,
              wrapper,
              registration,
              consumerRequire.resolve('react'),
              consumerRequire.resolve('react-dom/server'),
              consumerRequire.resolve('react-dom/client'),
            ],
            { encoding: 'utf8', timeout: 15000 },
          )
          expect(result.error).toBeUndefined()
          expect(result.stderr).toBe('')
          expect(result.status, result.stdout).toBe(0)
          expect(result.stdout).toContain(`${mode}: ${wrapperMode} ok`)
        }
      } finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    },
    30000,
  )
})
