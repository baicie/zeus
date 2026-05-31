import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

import { parse } from '@babel/parser'
import { rolldownDts } from '@baicie/plugin-dts/rolldown'
import MagicString from 'magic-string'

import { findWorkspacePackages } from '../shared/utils'

import type { Plugin, RolldownOptions } from 'rolldown'

if (!existsSync('temp/packages')) {
  console.warn(
    'no temp dts files found. run `tsc -p tsconfig.build.json --noCheck` first.',
  )
  process.exit(1)
}

// Discover which packages were built, matching temp output to workspace packages
const tempRoots = ['temp/packages', 'temp/addons']
const tempPkgs = tempRoots.flatMap(root =>
  existsSync(root) ? readdirSync(root) : [],
)
const wsPkgs = findWorkspacePackages()
const wsPkgsByShort = new Map(wsPkgs.map(p => [p.shortName, p]))

const targetPackages = (
  process.env.TARGETS ? process.env.TARGETS.split(',') : tempPkgs
)
  .filter(pkg => !pkg.includes('compiler-'))
  .filter(pkg => {
    // Skip if we can't find a matching workspace package
    return wsPkgsByShort.has(pkg)
  })

const bundledPackages = targetPackages.filter(pkg => pkg !== 'vite-plugin')
const dtsChecks: RolldownOptions['checks'] = {
  pluginTimings: false,
}

const packageConfigs: RolldownOptions[] = bundledPackages.map(pkg => {
  const pkgDir = wsPkgsByShort.get(pkg)?.dir
  const relativeDir = wsPkgsByShort.get(pkg)?.relativeDir
  if (!pkgDir || !relativeDir) {
    throw new Error(`Cannot resolve directory for package: ${pkg}`)
  }

  const [category] = relativeDir.split('/')
  const inputDts = `./temp/${category}/${pkg}/src/index.d.ts`

  return {
    checks: dtsChecks,
    input: inputDts,
    output: {
      file: `${pkgDir}/dist/${pkg}.d.ts`,
      format: 'es',
    },
    plugins: [
      rolldownDts(),
      patchTypes(pkg, pkgDir),
      ...(pkg === 'zeus' ? [copyMts(pkg, pkgDir)] : []),
    ],
    onwarn(warning, warn) {
      if (
        warning.code === 'UNRESOLVED_IMPORT' &&
        !warning.exporter?.startsWith('.')
      ) {
        return
      }
      warn(warning)
    },
  } as RolldownOptions
})

// Generate .d.ts for additional entry points (e.g. bundler-plugin/vite, bundler-plugin/manifest)
const additionalEntryDtsConfigs: RolldownOptions[] = []
for (const pkg of bundledPackages) {
  const pkgDir = wsPkgsByShort.get(pkg)?.dir
  const relativeDir = wsPkgsByShort.get(pkg)?.relativeDir
  if (!pkgDir || !relativeDir) continue

  const pkgJson = wsPkgsByShort.get(pkg)?.packageJson as
    | Record<string, unknown>
    | undefined
  const buildOptions = pkgJson?.buildOptions as
    | { additionalEntries?: Array<{ entry: string; output: string }> }
    | undefined
  if (!buildOptions?.additionalEntries) continue

  const [category] = relativeDir.split('/')
  for (const extra of buildOptions.additionalEntries) {
    const srcDts = `./temp/${category}/${pkg}/src/${extra.entry.replace(/\.ts$/, '.d.ts')}`
    if (!existsSync(srcDts)) continue

    const outputDts = extra.output.replace(/\.js$/, '.d.ts')
    additionalEntryDtsConfigs.push({
      checks: dtsChecks,
      external: ['vite'],
      input: srcDts,
      output: {
        file: `${pkgDir}/${outputDts}`,
        format: 'es',
      },
      plugins: [rolldownDts()],
    })
  }
}
packageConfigs.push(...additionalEntryDtsConfigs)

// Handle vite-plugin dts by directly copying the source declaration
// (see comment above for why bundling is skipped)
if (targetPackages.includes('vite-plugin')) {
  const vitePluginDts = readFileSync(
    'temp/addons/vite-plugin/src/index.d.ts',
    'utf-8',
  )
  writeFileSync('addons/vite-plugin/dist/vite-plugin.d.ts', vitePluginDts)
  console.log('[dts] vite-plugin.d.ts written directly from source')
}

export default packageConfigs

function patchTypes(pkg: string, pkgDir: string): import('rollup').Plugin {
  return {
    name: 'patch-types',
    renderChunk(code, chunk) {
      const s = new MagicString(code)
      const ast = parse(code, {
        errorRecovery: true,
        plugins: ['typescript'],
        sourceType: 'module',
      })

      removeDuplicateImportSpecifiers(ast.program.body, s)

      function processDeclaration(
        node:
          | import('@babel/types').VariableDeclarator
          | import('@babel/types').TSTypeAliasDeclaration
          | import('@babel/types').TSInterfaceDeclaration
          | import('@babel/types').TSDeclareFunction
          | import('@babel/types').TSInterfaceDeclaration
          | import('@babel/types').TSEnumDeclaration
          | import('@babel/types').ClassDeclaration,
        parentDecl?: import('@babel/types').VariableDeclaration,
      ) {
        if (!node.id) {
          return
        }
        assert(node.id.type === 'Identifier')
        const name = node.id.name
        if (name.startsWith('_')) {
          return
        }
        shouldRemoveExport.add(name)
        if (isExported.has(name)) {
          const start = (parentDecl || node).start
          assert(typeof start === 'number')
          s.prependLeft(start, `export `)
        }
      }

      const isExported = new Set()
      const shouldRemoveExport = new Set()

      for (const node of ast.program.body) {
        if (node.type === 'ExportNamedDeclaration' && !node.source) {
          for (let i = 0; i < node.specifiers.length; i++) {
            const spec = node.specifiers[i]
            if (spec.type === 'ExportSpecifier') {
              isExported.add(spec.local.name)
            }
          }
        }
      }

      for (const node of ast.program.body) {
        if (node.type === 'VariableDeclaration') {
          processDeclaration(node.declarations[0], node)
          if (node.declarations.length > 1) {
            assert(typeof node.start === 'number')
            assert(typeof node.end === 'number')
            throw new Error(
              `unhandled declare const with more than one declarators:\n${code.slice(
                node.start,
                node.end,
              )}`,
            )
          }
        } else if (
          node.type === 'TSTypeAliasDeclaration' ||
          node.type === 'TSInterfaceDeclaration' ||
          node.type === 'TSDeclareFunction' ||
          node.type === 'TSEnumDeclaration' ||
          node.type === 'ClassDeclaration'
        ) {
          processDeclaration(node)
        }
      }

      for (const node of ast.program.body) {
        if (node.type === 'ExportNamedDeclaration' && !node.source) {
          let removed = 0
          for (let i = 0; i < node.specifiers.length; i++) {
            const spec = node.specifiers[i]
            if (
              spec.type === 'ExportSpecifier' &&
              shouldRemoveExport.has(spec.local.name)
            ) {
              assert(spec.exported.type === 'Identifier')
              const exported = spec.exported.name
              if (exported !== spec.local.name) {
                continue
              }
              const next = node.specifiers[i + 1]
              if (next) {
                assert(typeof spec.start === 'number')
                assert(typeof next.start === 'number')
                s.remove(spec.start, next.start)
              } else {
                const prev = node.specifiers[i - 1]
                assert(typeof spec.start === 'number')
                assert(typeof spec.end === 'number')
                s.remove(
                  prev
                    ? (assert(typeof prev.end === 'number'), prev.end)
                    : spec.start,
                  spec.end,
                )
              }
              removed++
            }
          }
          if (removed === node.specifiers.length) {
            assert(typeof node.start === 'number')
            assert(typeof node.end === 'number')
            s.remove(node.start, node.end)
          }
        }
      }
      code = s.toString()

      const additionalTypeDir = `${pkgDir}/types`
      if (existsSync(additionalTypeDir)) {
        code +=
          '\n' +
          readdirSync(additionalTypeDir)
            .map(file => readFileSync(`${additionalTypeDir}/${file}`, 'utf-8'))
            .join('\n')
      }
      return code
    },
  }
}

function removeDuplicateImportSpecifiers(
  nodes: Array<
    import('@babel/types').Statement | import('@babel/types').ModuleDeclaration
  >,
  s: MagicString,
) {
  const importedLocals = new Set<string>()

  for (const node of nodes) {
    if (node.type !== 'ImportDeclaration') {
      continue
    }

    let removed = 0
    for (let i = 0; i < node.specifiers.length; i++) {
      const spec = node.specifiers[i]
      if (spec.type !== 'ImportSpecifier') {
        continue
      }

      const localName = spec.local.name

      if (!importedLocals.has(localName)) {
        importedLocals.add(localName)
        continue
      }

      const next = node.specifiers[i + 1]
      if (next) {
        assert(typeof spec.start === 'number')
        assert(typeof next.start === 'number')
        s.remove(spec.start, next.start)
      } else {
        const prev = node.specifiers[i - 1]
        assert(typeof spec.start === 'number')
        assert(typeof spec.end === 'number')
        s.remove(
          prev ? (assert(typeof prev.end === 'number'), prev.end) : spec.start,
          spec.end,
        )
      }
      removed++
    }

    if (removed === node.specifiers.length) {
      assert(typeof node.start === 'number')
      assert(typeof node.end === 'number')
      s.remove(node.start, node.end)
    }
  }
}

function copyMts(pkg: string, pkgDir: string): Plugin {
  return {
    name: 'copy-zeus-mts',
    writeBundle(_, bundle) {
      const dtsEntry = bundle[`${pkg}.d.ts`]
      if (dtsEntry && 'code' in dtsEntry) {
        writeFileSync(`${pkgDir}/dist/zeus.d.mts`, dtsEntry.code)
      }
    },
  }
}
