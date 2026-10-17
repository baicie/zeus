import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const consumerRequire = createRequire(
  process.env.ZEUS_REACT_CONSUMER_PACKAGE ??
    new URL('../../../../examples/react-wrapper/package.json', import.meta.url),
)

describe('React public runtime types', () => {
  it('accepts the real React module and produces a typed JSX/createElement component', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-react-types-'))
    try {
      await fs.mkdir(path.join(root, 'node_modules/@types'), {
        recursive: true,
      })
      await fs.symlink(
        path.dirname(consumerRequire.resolve('@types/react/package.json')),
        path.join(root, 'node_modules/@types/react'),
        'dir',
      )
      await fs.symlink(
        path.dirname(consumerRequire.resolve('react/package.json')),
        path.join(root, 'node_modules/react'),
        'dir',
      )
      const runtimePath =
        process.env.ZEUS_REACT_RUNTIME_TYPES ??
        fileURLToPath(
          new URL('../src/runtime/createComponent.ts', import.meta.url),
        )
      await fs.copyFile(runtimePath, path.join(root, 'runtime.ts'))
      const consumer = path.join(root, 'consumer.tsx')
      await fs.writeFile(
        consumer,
        `
import * as React from 'react'
import { createComponent, type EventName } from './runtime'
class ButtonElement extends HTMLElement { value?: number }
const Button = createComponent({
  react: React,
  tagName: 'z-button',
  elementClass: ButtonElement,
  props: ['value'],
  events: { onValueChange: 'value-change' as EventName<CustomEvent<{ value: number }>> },
})
const ref = React.createRef<ButtonElement>()
React.createElement(Button, { value: 42, ref })
const node = <Button ref={ref} value={42} onValueChange={event => event.detail.value} />
// @ts-expect-error Declared element properties keep their real types.
const invalidValue = <Button value="invalid" />
// @ts-expect-error Custom events keep their declared detail type.
const invalidEvent = <Button onValueChange={event => event.detail.missing} />
void [node, invalidValue, invalidEvent]
`,
      )
      const program = ts.createProgram([consumer], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      })
      const diagnostics = ts.getPreEmitDiagnostics(program)
      expect(
        diagnostics.map(diagnostic =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        ),
      ).toEqual([])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 20000)
})
