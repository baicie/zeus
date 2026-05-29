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
const tempPkgs = readdirSync('temp/packages')
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

const packageConfigs: RolldownOptions[] = targetPackages.map(pkg => {
  const pkgDir = wsPkgsByShort.get(pkg)?.dir
  const relativeDir = wsPkgsByShort.get(pkg)?.relativeDir
  if (!pkgDir || !relativeDir) {
    throw new Error(`Cannot resolve directory for package: ${pkg}`)
  }

  // tsconfig outDir="temp" + include paths -> d.ts at temp/{packages,addons}/<pkg>/src/index.d.ts
  const [category] = relativeDir.split('/')
  const inputDts = `./temp/${category}/${pkg}/src/index.d.ts`

  return {
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

export default packageConfigs

function patchTypes(pkg: string, pkgDir: string): import('rollup').Plugin {
  return {
    name: 'patch-types',
    renderChunk(code, chunk) {
      const s = new MagicString(code)
      const ast = parse(code, {
        plugins: ['typescript'],
        sourceType: 'module',
      })

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
