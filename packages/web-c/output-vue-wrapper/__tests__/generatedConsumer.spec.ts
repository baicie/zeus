import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { generateVueWrapper } from '../src/generateVueWrapper'

const consumerRequire = createRequire(import.meta.url)

describe('generated Vue consumers', () => {
  it.each(['runtime', 'minimal', 'event-bridge'] as const)(
    '%s uses a server-safe per-component registration entry',
    async wrapperMode => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), 'zeus-vue-consumer-'),
      )
      try {
        const registration = path.join(root, 'registration.mjs')
        await fs.writeFile(
          registration,
          `let registrations = 0;
export const getRegistrations = () => registrations;
export function defineCustomElement() {
  registrations += 1;
  customElements.define('z-generated-input', class extends HTMLElement {
    get value() { return this._value; }
    set value(value) { this._value = value; }
    get config() { return this._config; }
    set config(value) { this._config = value; }
  });
}
`,
        )
        const wrapper = path.join(root, 'wrapper.mjs')
        const generated = generateVueWrapper({
          component: {
            tag: 'z-generated-input',
            name: 'ZInput',
            exportName: 'ZInput',
            source: 'src/input.tsx',
            props: { value: { type: 'string' }, config: { type: 'object' } },
            events: { valueChange: {} },
            slots: { prefix: {}, default: {} },
            models:
              wrapperMode === 'minimal'
                ? []
                : [
                    {
                      prop: 'value',
                      event: 'value-change',
                      eventPath: 'detail.value',
                    },
                  ],
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
          mode: wrapperMode,
          wcModuleId: pathToFileURL(registration).href,
        })
          .replace(
            "'vue'",
            JSON.stringify(
              pathToFileURL(
                path.join(
                  path.dirname(consumerRequire.resolve('vue/package.json')),
                  'index.mjs',
                ),
              ).href,
            ),
          )
          .replace(
            "'@zeus-js/output-vue-wrapper/runtime'",
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
              path.join(
                path.dirname(consumerRequire.resolve('vue/package.json')),
                'index.mjs',
              ),
              consumerRequire.resolve('vue/server-renderer'),
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
