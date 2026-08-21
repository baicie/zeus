import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { analyzeComponents } from '@zeus-js/component-analyzer'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { generateWCDtsFiles } from '../src/generateFiles'
import { generateWCJsxDts } from '../src/generateJsxDts'
import { generateLoaderDts } from '../src/generateLoaderDts'
import { generateReactDts } from '../src/generateReactDts'
import { generateVueDts } from '../src/generateVueDts'
import { generateComponentWCDts } from '../src/generateWcDts'

describe('generated declaration consumer contract', () => {
  it('emits self-contained React and custom element declarations', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-dts-consumer-'))

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })

    await fs.writeFile(
      path.join(root, 'src/types.ts'),
      `
        export interface GridRow {
          id: string
        }

        export interface BaseGridProps {
          ariaLabel?: string
          count?: number
          diagnostics?: GridDiagnostics
        }

        interface GridCommitTiming {
          inputTime?: number
          handlerStartTime: number
        }

        export interface GridDiagnostics {
          onCommit?: (sample: Readonly<GridCommitTiming>) => void
        }

        export type GridProps = BaseGridProps & {
          label?: string
        }
      `,
    )

    await fs.writeFile(
      path.join(root, 'src/components/grid.tsx'),
      `
        import type { GridProps, GridRow } from '../types'
        import { defineElement, event } from '@zeus-js/zeus'

        function setup(_props: GridProps, { expose }: { expose: Function }) {
          expose({
            focus(): void {},
            selectRow(row: Pick<GridRow, 'id'>): void {
              void row
            },
            selectNestedRow(row: Pick<GridRow | null, 'id'>): void {
              void row
            },
            setRows(rows: GridRow[]): void {
              void rows
            },
          })

          return null
        }

        export const ZGrid = defineElement<GridProps>(
          'z-grid',
          {
            props: {
              ariaLabel: String,
            },
            emits: {
              rowChange: event<{ row: GridRow }>(),
            },
          },
          setup,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])
    expect(result.manifest.components[0].props).toHaveProperty('count')
    expect(result.manifest.components[0].props).toHaveProperty('label')
    expect(result.manifest.components[0].props.diagnostics.declaration).toEqual(
      {
        reference: 'GridDiagnostics',
        type: '{ onCommit?: (sample: Readonly<{ inputTime?: number; handlerStartTime: number }>) => void }',
      },
    )

    const reactDts = generateReactDts(result.manifest)
    const loaderDts = generateLoaderDts(result.manifest)
    const vueDts = generateVueDts(result.manifest)
    const wcDts = generateComponentWCDts(result.manifest.components[0])

    for (const declaration of [reactDts, loaderDts, vueDts, wcDts]) {
      expect(declaration).toContain('export type GridDiagnostics =')
      expect(declaration).toContain('diagnostics?: GridDiagnostics')
      expect(declaration).toContain(
        'onCommit?: (sample: Readonly<{ inputTime?: number; handlerStartTime: number }>) => void',
      )
    }

    expect(reactDts).not.toContain('GridRow')
    expect(loaderDts).not.toContain('GridRow')
    expect(wcDts).not.toContain('GridRow')
    expect(reactDts).not.toContain('Pick<unknown')
    expect(loaderDts).not.toContain('Pick<unknown')
    expect(wcDts).not.toContain('Pick<unknown')
    expect(reactDts).toContain('selectNestedRow(row: unknown): void')
    expect(loaderDts).toContain('selectNestedRow(row: unknown): Promise<void>')
    expect(wcDts).toContain('selectNestedRow(row: unknown): void')
    const rootNames = [
      ...(await writeDeclarationFixture(root, 'react', reactDts)),
      ...(await writeDeclarationFixture(root, 'loader', loaderDts)),
      await writeDeclarationOnly(root, 'vue', vueDts),
      ...(await writeDeclarationFixture(root, 'wc', wcDts)),
    ]
    const reactStubPath = path.join(root, 'react.d.ts')

    await fs.writeFile(
      reactStubPath,
      `
        declare module 'react' {
          export type ReactNode = unknown
          export interface CSSProperties {
            [key: string]: string | number | undefined
          }
          export interface RefAttributes<T> {
            ref?: T | null
          }
          export interface ForwardRefExoticComponent<P> {
            (props: P): ReactNode
          }
        }
      `,
    )
    rootNames.push(reactStubPath)

    const vueStubPath = path.join(root, 'vue.d.ts')
    await fs.writeFile(
      vueStubPath,
      `
        declare module 'vue' {
          export interface DefineComponent<
            Props = {},
            RawBindings = {},
            D = {},
            C = {},
            M = {},
            Mixin = {},
            Extends = {},
            E = {},
          > {}
        }
      `,
    )
    rootNames.push(vueStubPath)

    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('preserves zero-parameter callback props', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-dts-callback-'))

    await writeComponentSource(
      root,
      'callback.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface Config {
          onReady?: () => void
        }

        interface CallbackProps {
          config?: Config
        }

        export const ZCallback = defineElement<CallbackProps>(
          'z-callback',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])

    const declaration = generateLoaderDts(result.manifest)
    const rootNames = await writeDeclarationConsumer(
      root,
      'callback',
      declaration,
      `
        import type { ZCallbackElement } from './index'

        declare const callback: ZCallbackElement
        callback.config?.onReady?.()
      `,
    )

    expect(declaration).toContain('onReady?: () => void')
    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('preserves union and intersection precedence', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-type-precedence-'),
    )

    await writeComponentSource(
      root,
      'type-precedence.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface LeftConfig {
          left: string
        }

        interface RightConfig {
          right: number
        }

        interface EnabledConfig {
          enabled: boolean
        }

        type Callback = () => void
        type EitherConfig = LeftConfig | RightConfig

        interface PrecedenceProps {
          callback?: Callback | null
          config?: EitherConfig & EnabledConfig
        }

        export const ZTypePrecedence = defineElement<PrecedenceProps>(
          'z-type-precedence',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    const declaration = generateLoaderDts(result.manifest)
    const rootNames = await writeDeclarationConsumer(
      root,
      'type-precedence',
      declaration,
      `
        import type { ZTypePrecedenceElement } from './index'

        declare const element: ZTypePrecedenceElement
        element.callback = null
        element.callback = () => undefined
        element.config = { left: 'left', enabled: true }
        element.config = { right: 1, enabled: true }
        // @ts-expect-error Every union branch must also satisfy EnabledConfig.
        element.config = { left: 'left' }
      `,
    )

    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('prefers local declarations over portable global type names', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-local-global-shadow-'),
    )

    await writeComponentSource(
      root,
      'local-global-shadow.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        type Date = {
          iso: string
        }

        interface LocalGlobalShadowProps {
          createdAt?: Date
        }

        export const ZLocalGlobalShadow =
          defineElement<LocalGlobalShadowProps>(
            'z-local-global-shadow',
            {},
            () => null,
          )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    const declaration = generateLoaderDts(result.manifest)
    const rootNames = await writeDeclarationConsumer(
      root,
      'local-global-shadow',
      declaration,
      `
        import type { ZLocalGlobalShadowElement } from './index'

        declare const element: ZLocalGlobalShadowElement
        element.createdAt = { iso: '2026-08-21' }
        const iso: string = element.createdAt.iso
        void iso
      `,
    )

    expect(declaration).toContain('export type DatePropType = { iso: string }')
    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('emits valid TypeScript for readonly array props', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-readonly-array-'),
    )

    await writeComponentSource(
      root,
      'readonly-array.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface Config {
          labels: readonly string[]
        }

        interface ReadonlyArrayProps {
          config?: Config
        }

        export const ZReadonlyArray = defineElement<ReadonlyArrayProps>(
          'z-readonly-array',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])

    const declaration = generateLoaderDts(result.manifest)
    const rootNames = await writeDeclarationConsumer(
      root,
      'readonly-array',
      declaration,
      `
        import type { ZReadonlyArrayElement } from './index'

        declare const element: ZReadonlyArrayElement
        const labels: readonly string[] = element.config!.labels
        void labels
      `,
    )

    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('preserves readonly members in nested prop declarations', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-readonly-members-'),
    )

    await writeComponentSource(
      root,
      'readonly-members.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface Config {
          readonly id: string
          nested?: {
            readonly count: number
          }
        }

        interface ReadonlyMemberProps {
          config?: Config
        }

        export const ZReadonlyMember = defineElement<ReadonlyMemberProps>(
          'z-readonly-member',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    const declaration = generateLoaderDts(result.manifest)
    const rootNames = await writeDeclarationConsumer(
      root,
      'readonly-members',
      declaration,
      `
        import type { ZReadonlyMemberElement } from './index'

        declare const element: ZReadonlyMemberElement
        const config = element.config!
        // @ts-expect-error Config.id is readonly.
        config.id = 'next'
        // @ts-expect-error Config.nested.count is readonly.
        config.nested!.count = 2
      `,
    )

    expect(declaration).toContain('readonly id: string')
    expect(declaration).toContain('readonly count: number')
    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('keeps same-named local prop types isolated between components', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-local-type-scope-'),
    )

    await writeComponentSource(
      root,
      'data-grid.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface Config {
          pageSize: number
        }

        interface DataGridProps {
          config?: Config
        }

        export const ZDataGrid = defineElement<DataGridProps>(
          'z-data-grid',
          {},
          () => null,
        )
      `,
    )
    await writeComponentSource(
      root,
      'tree.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface Config {
          selection: 'single' | 'multiple'
        }

        interface TreeProps {
          config?: Config
        }

        export const ZTree = defineElement<TreeProps>(
          'z-tree',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })

    expect(result.diagnostics).toEqual([])

    const declaration = generateReactDts(result.manifest)
    const rootNames = await writeDeclarationConsumer(
      root,
      'local-type-scope',
      declaration,
      `
        import type { ZDataGridProps, ZTreeProps } from './index'

        const dataGrid: ZDataGridProps = { config: { pageSize: 100 } }
        const tree: ZTreeProps = { config: { selection: 'multiple' } }
        const pageSize: number = dataGrid.config!.pageSize
        const selection: 'single' | 'multiple' = tree.config!.selection
        void pageSize
        void selection
      `,
    )
    rootNames.push(await writeReactStub(root, 'local-type-scope'))

    expectDeclarationsToCompile(rootNames)

    const wcRootNames: string[] = []
    for (const file of generateWCDtsFiles(result.manifest, { jsx: false })) {
      const outputPath = path.join(root, file.fileName)
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, file.source)
      wcRootNames.push(outputPath)
    }

    const wcConsumerPath = path.join(root, 'wc-consumer.ts')
    await fs.writeFile(
      wcConsumerPath,
      `
        import type { ZDataGridElement, ZTreeElement } from './wc'

        declare const dataGrid: ZDataGridElement
        declare const tree: ZTreeElement
        const pageSize: number = dataGrid.config!.pageSize
        const selection: 'single' | 'multiple' = tree.config!.selection
        void pageSize
        void selection
      `,
    )
    wcRootNames.push(wcConsumerPath)

    expectDeclarationsToCompile(wcRootNames)
  }, 15000)

  it('keeps shared WC prop aliases private to per-component files', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-shared-wc-type-'),
    )

    for (const [fileName, componentName, tag] of [
      ['one.tsx', 'ZOne', 'z-one'],
      ['two.tsx', 'ZTwo', 'z-two'],
    ] as const) {
      await writeComponentSource(
        root,
        fileName,
        `
          import { defineElement } from '@zeus-js/zeus'

          interface SharedConfig {
            enabled: boolean
          }

          interface ComponentProps {
            config?: SharedConfig
          }

          export const ${componentName} = defineElement<ComponentProps>(
            '${tag}',
            {},
            () => null,
          )
        `,
      )
    }

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    const rootNames: string[] = []

    for (const file of generateWCDtsFiles(result.manifest, { jsx: false })) {
      const outputPath = path.join(root, file.fileName)
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, file.source)
      rootNames.push(outputPath)

      if (file.fileName !== 'wc/index.d.ts') {
        expect(file.source).toContain('type SharedConfig =')
        expect(file.source).not.toContain('export type SharedConfig =')
      }
    }

    const indexSource = await fs.readFile(
      path.join(root, 'wc/index.d.ts'),
      'utf8',
    )
    expect(indexSource).not.toContain('export * from')

    const consumerPath = path.join(root, 'shared-wc-consumer.ts')
    await fs.writeFile(
      consumerPath,
      `
        import type { ZOneElement, ZTwoElement } from './wc'

        declare const one: ZOneElement
        declare const two: ZTwoElement
        const oneEnabled: boolean = one.config!.enabled
        const twoEnabled: boolean = two.config!.enabled
        void oneEnabled
        void twoEnabled
      `,
    )
    rootNames.push(consumerPath)

    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('renames prop aliases that collide with generated declaration symbols', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-symbol-collision-'),
    )

    await writeComponentSource(
      root,
      'collision.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface ZCollisionProps { nested: string }
        interface ZCollisionElement { elementValue: number }
        interface ZCollisionElementProps { elementPropsValue: string }
        interface ZCollisionElementMethods { methodsValue: number }
        interface ZCollisionElementEventTarget { targetValue: boolean }
        interface ZCollisionEventMap { eventValue: boolean }
        interface React { reactValue: string }
        interface DefineComponent { vueValue: string }
        interface HTMLElementTagNameMap { tagValue: string }
        interface JSX { jsxValue: string }
        interface GlobalComponents { globalValue: string }

        interface CollisionComponentProps {
          props?: ZCollisionProps
          element?: ZCollisionElement
          elementProps?: ZCollisionElementProps
          methods?: ZCollisionElementMethods
          eventTarget?: ZCollisionElementEventTarget
          events?: ZCollisionEventMap
          react?: React
          vue?: DefineComponent
          tagMap?: HTMLElementTagNameMap
          jsx?: JSX
          globals?: GlobalComponents
        }

        export const ZCollision = defineElement<CollisionComponentProps>(
          'z-collision',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    const declarations = {
      jsx: generateWCJsxDts(result.manifest),
      loader: generateLoaderDts(result.manifest),
      react: generateReactDts(result.manifest),
      vue: generateVueDts(result.manifest),
      wc: generateComponentWCDts(result.manifest.components[0]),
    }

    for (const declaration of Object.values(declarations)) {
      expect(declaration).toContain('type ZCollisionPropsPropType =')
      expect(declaration).toContain('props?: ZCollisionPropsPropType')
      expect(declaration).not.toContain('export type ZCollisionProps =')
      expect(declaration).toContain('type ZCollisionElementPropsPropType =')
      expect(declaration).toContain('type ZCollisionElementMethodsPropType =')
      expect(declaration).toContain(
        'type ZCollisionElementEventTargetPropType =',
      )
    }
    expect(declarations.react).toContain('export type ReactPropType =')
    expect(declarations.vue).toContain('export type DefineComponentPropType =')

    for (const declaration of Object.values(declarations)) {
      expect(declaration).toContain('type HTMLElementTagNameMapPropType =')
      expect(declaration).toContain('type JSXPropType =')
      expect(declaration).toContain('type GlobalComponentsPropType =')
    }

    const rootNames = await Promise.all(
      Object.entries(declarations).map(([name, declaration]) =>
        writeDeclarationOnly(root, `collision-${name}`, declaration),
      ),
    )
    rootNames.push(await writeReactStub(root, 'collision-react'))
    rootNames.push(await writeVueStub(root, 'collision-vue'))

    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('keeps portable globals unshadowed across merged component declarations', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-portable-global-collision-'),
    )
    const portableTypeUsages = {
      AbortSignal: 'AbortSignal',
      AddEventListenerOptions: 'AddEventListenerOptions',
      Array: 'Array<string>',
      Blob: 'Blob',
      CustomEvent: 'CustomEvent<string>',
      Date: 'Date',
      Element: 'Element',
      Event: 'Event',
      EventListenerOptions: 'EventListenerOptions',
      EventListenerOrEventListenerObject: 'EventListenerOrEventListenerObject',
      File: 'File',
      FocusEvent: 'FocusEvent',
      FormData: 'FormData',
      Function: 'Function',
      HTMLElement: 'HTMLElement',
      InputEvent: 'InputEvent',
      KeyboardEvent: 'KeyboardEvent',
      Map: 'Map<string, number>',
      MouseEvent: 'MouseEvent',
      Node: 'Node',
      Omit: "Omit<{ value: string }, 'value'>",
      Partial: 'Partial<{ value: string }>',
      Pick: "Pick<{ value: string }, 'value'>",
      PointerEvent: 'PointerEvent',
      Promise: 'Promise<void>',
      PromiseLike: 'PromiseLike<void>',
      Readonly: 'Readonly<{ value: string }>',
      ReadonlyArray: 'ReadonlyArray<string>',
      ReadonlyMap: 'ReadonlyMap<string, number>',
      ReadonlySet: 'ReadonlySet<string>',
      Record: 'Record<string, unknown>',
      Required: 'Required<{ value?: string }>',
      Set: 'Set<string>',
      URL: 'URL',
      UIEvent: 'UIEvent',
    } as const
    const portableNames = Object.keys(portableTypeUsages) as Array<
      keyof typeof portableTypeUsages
    >

    await writeComponentSource(
      root,
      'local-aliases.tsx',
      `
        import { defineElement, event } from '@zeus-js/zeus'

        ${portableNames
          .map(name => `type ${name} = { local${name}: string }`)
          .join('\n')}

        interface LocalAliasProps {
          ${portableNames.map(name => `local${name}?: ${name}`).join('\n')}
        }

        export const ZLocalAliases = defineElement<LocalAliasProps>(
          'z-local-aliases',
          {
            emits: {
              change: event<{ value: string }>(),
            },
          },
          () => null,
        )
      `,
    )
    await writeComponentSource(
      root,
      'portable-globals.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface PortableGlobalProps {
          ${portableNames
            .map(name => `global${name}?: ${portableTypeUsages[name]}`)
            .join('\n')}
        }

        export const ZPortableGlobals = defineElement<PortableGlobalProps>(
          'z-portable-globals',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    expect(result.diagnostics).toEqual([])

    const declarations = {
      jsx: generateWCJsxDts(result.manifest),
      loader: generateLoaderDts(result.manifest),
      react: generateReactDts(result.manifest),
      vue: generateVueDts(result.manifest),
      wc: generateComponentWCDts(result.manifest.components[0]),
    }

    for (const declaration of Object.values(declarations)) {
      for (const name of portableNames) {
        expect(declaration).toContain(`type ${name}PropType =`)
      }
    }

    const rootNames = await Promise.all(
      Object.entries(declarations).map(([name, declaration]) =>
        writeDeclarationOnly(root, `portable-${name}`, declaration),
      ),
    )
    rootNames.push(await writeReactStub(root, 'portable-react'))
    rootNames.push(await writeVueStub(root, 'portable-vue'))

    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('fails closed for unsupported nested interface members', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-unsupported-interface-'),
    )

    await writeComponentSource(
      root,
      'unsupported.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        interface MethodConfig {
          onCommit(sample: { duration: number }): void
        }
        interface IndexedConfig {
          [key: string]: number
        }
        interface CallableConfig {
          (value: string): void
        }
        interface ExtendedConfig extends MethodConfig {
          enabled: boolean
        }
        interface UnsupportedProps {
          method?: MethodConfig
          indexed?: IndexedConfig
          callable?: CallableConfig
          extended?: ExtendedConfig
        }

        export const ZUnsupported = defineElement<UnsupportedProps>(
          'z-unsupported',
          {},
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    const component = result.manifest.components[0]

    for (const propName of ['method', 'indexed', 'callable', 'extended']) {
      expect(component.props[propName].declaration).toBeUndefined()
    }

    const declaration = generateLoaderDts(result.manifest)
    expect(declaration).toContain('method?: unknown')
    expect(declaration).toContain('indexed?: unknown')
    expect(declaration).toContain('callable?: unknown')
    expect(declaration).toContain('extended?: unknown')
    expect(declaration).not.toContain('export type MethodConfig = { }')

    const rootNames = await writeDeclarationConsumer(
      root,
      'unsupported-interface',
      declaration,
      `
        import type { ZUnsupportedElement } from './index'
        declare const element: ZUnsupportedElement
        const method: unknown = element.method
        const indexed: unknown = element.indexed
        const callable: unknown = element.callable
        const extended: unknown = element.extended
        void method
        void indexed
        void callable
        void extended
      `,
    )

    expectDeclarationsToCompile(rootNames)
  }, 15000)

  it('emits valid declarations for function-valued event details', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-function-event-detail-'),
    )

    await writeComponentSource(
      root,
      'function-event-detail.tsx',
      `
        import { defineElement, event } from '@zeus-js/zeus'

        export const ZFunctionEventDetail = defineElement(
          'z-function-event-detail',
          {
            emits: {
              commit: event<{ callback: Function }>(),
            },
          },
          () => null,
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    const declaration = generateComponentWCDts(result.manifest.components[0])
    const rootNames = await writeDeclarationOnly(
      root,
      'function-event-detail',
      declaration,
    )

    expect(declaration).toContain('callback: Function')
    expect(declaration).not.toContain('callback: function')
    expectDeclarationsToCompile([rootNames])
  }, 15000)

  it('erases setup-local and nested generic method types', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-dts-setup-local-types-'),
    )

    await writeComponentSource(
      root,
      'setup-local-types.tsx',
      `
        import { defineElement } from '@zeus-js/zeus'

        export const ZSetupLocalTypes = defineElement(
          'z-setup-local-types',
          {},
          (_props, { expose }) => {
            type Event = { localEvent: true }
            type Promise = { localPromise: true }

            expose({
              leak(value: Event): Promise {
                return value as unknown as Promise
              },
            })

            function nested<T>() {
              expose({
                identity(value: T): T {
                  return value
                },
              })
            }
            void nested
            return null
          },
        )
      `,
    )

    const result = await analyzeComponents({
      root,
      include: ['src/components/**/*.tsx'],
    })
    const declaration = generateLoaderDts(result.manifest)
    const rootNames = await writeDeclarationOnly(
      root,
      'setup-local-types',
      declaration,
    )

    expect(declaration).toContain('leak(value: unknown): Promise<unknown>')
    expect(declaration).toContain('identity(value: unknown): Promise<unknown>')
    expect(declaration).not.toContain('leak(value: Event)')
    expectDeclarationsToCompile([rootNames])
  }, 15000)
})

async function writeComponentSource(
  root: string,
  fileName: string,
  source: string,
): Promise<void> {
  const componentsDir = path.join(root, 'src/components')
  await fs.mkdir(componentsDir, { recursive: true })
  await fs.writeFile(path.join(componentsDir, fileName), source)
}

async function writeDeclarationConsumer(
  root: string,
  outputName: string,
  declaration: string,
  consumer: string,
): Promise<string[]> {
  const declarationPath = await writeDeclarationOnly(
    root,
    outputName,
    declaration,
  )
  const consumerPath = path.join(root, outputName, 'consumer.ts')
  await fs.writeFile(consumerPath, consumer)
  return [declarationPath, consumerPath]
}

async function writeReactStub(
  root: string,
  outputName: string,
): Promise<string> {
  const stubPath = path.join(root, outputName, 'react.d.ts')
  await fs.writeFile(
    stubPath,
    `
      declare module 'react' {
        export type ReactNode = unknown
        export interface CSSProperties {
          [key: string]: string | number | undefined
        }
        export interface RefAttributes<T> {
          ref?: T | null
        }
        export interface ForwardRefExoticComponent<P> {
          (props: P): ReactNode
        }
      }
    `,
  )
  return stubPath
}

async function writeVueStub(root: string, outputName: string): Promise<string> {
  const stubPath = path.join(root, outputName, 'vue.d.ts')
  await fs.writeFile(
    stubPath,
    `
      declare module 'vue' {
        export interface DefineComponent<
          Props = {},
          RawBindings = {},
          D = {},
          C = {},
          M = {},
          Mixin = {},
          Extends = {},
          E = {},
        > {}
      }
    `,
  )
  return stubPath
}

async function writeDeclarationOnly(
  root: string,
  outputName: string,
  declaration: string,
): Promise<string> {
  const outputDir = path.join(root, outputName)
  const declarationPath = path.join(outputDir, 'index.d.ts')
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(declarationPath, declaration)
  return declarationPath
}

async function writeDeclarationFixture(
  root: string,
  outputName: string,
  declaration: string,
): Promise<string[]> {
  const outputDir = path.join(root, outputName)
  const declarationPath = path.join(outputDir, 'index.d.ts')
  const consumerPath = path.join(outputDir, 'consumer.ts')
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(declarationPath, declaration)
  await fs.writeFile(
    consumerPath,
    `
      import type { GridDiagnostics, ZGridElement } from './index'

      declare const grid: ZGridElement
      const diagnostics: GridDiagnostics = {
        onCommit(sample) {
          const inputTime: number | undefined = sample.inputTime
          const handlerStartTime: number = sample.handlerStartTime
          void inputTime
          void handlerStartTime
        },
      }
      const host: HTMLElement = grid
      grid.ariaLabel = null
      grid.diagnostics = diagnostics
      grid.selectNestedRow(null)
      grid.selectRow({ id: 'row-1' })
      grid.setRows([])
      void host
      ${
        outputName === 'wc'
          ? `grid.addEventListener('row-change', event => {
        const row: unknown = event.detail.row
        void row
      })
      grid.addEventListener('click', event => {
        const mouseEvent: MouseEvent = event
        void mouseEvent
      })`
          : ''
      }
      ${
        outputName === 'loader'
          ? 'const focused: Promise<void> = grid.focus()\n      const ready: Promise<ZGridElement> = grid.componentOnReady()\n      void focused\n      void ready'
          : ''
      }
    `,
  )

  return [declarationPath, consumerPath]
}

function expectDeclarationsToCompile(rootNames: string[]): void {
  const program = ts.createProgram(rootNames, {
    lib: ['lib.es2016.d.ts', 'lib.dom.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2016,
    types: [],
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)

  expect(formatDiagnostics(diagnostics)).toEqual([])
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map(diagnostic => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    )

    if (!diagnostic.file || diagnostic.start === undefined) {
      return message
    }

    const position = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start,
    )
    return `${path.basename(diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`
  })
}
