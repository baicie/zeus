import assert from 'node:assert/strict'
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'

import { parse } from '@babel/parser'
import { dts } from '@baicie/plugin-dts'
import MagicString from 'magic-string'

import { findWorkspacePackages } from '../shared/utils.ts'

import type { Plugin, RollupOptions } from 'rollup'

if (!existsSync('temp/packages')) {
  console.warn(
    'no temp dts files found. run `tsc -p tsconfig.build.json --noCheck` first.',
  )
  process.exit(1)
}

const wsPkgs = findWorkspacePackages()
const wsPkgsByShort = new Map<string, (typeof wsPkgs)[number]>()
for (const pkg of wsPkgs) {
  if (!wsPkgsByShort.has(pkg.shortName)) {
    wsPkgsByShort.set(pkg.shortName, pkg)
  }
}

const targetPackages = (
  process.env.TARGETS
    ? process.env.TARGETS.split(',')
    : wsPkgs
        .filter(pkg => pkg.packageJson.buildOptions)
        .filter(pkg => existsSync(`temp/${pkg.relativeDir}/src/index.d.ts`))
        .map(pkg => pkg.shortName)
)
  .filter(pkg => !pkg.includes('compiler-'))
  .filter(pkg => wsPkgsByShort.has(pkg))

const packageConfigs: RollupOptions[] = targetPackages.map(pkg => {
  const pkgDir = wsPkgsByShort.get(pkg)?.dir
  const relativeDir = wsPkgsByShort.get(pkg)?.relativeDir
  if (!pkgDir || !relativeDir) {
    throw new Error(`Cannot resolve directory for package: ${pkg}`)
  }
  return {
    input: `./temp/${relativeDir}/src/index.d.ts`,
    output: {
      file: `${pkgDir}/dist/${pkg}.d.ts`,
      format: 'es',
    },
    plugins: [
      dts(),
      patchTypes(pkg, pkgDir),
      ...(pkg === 'zeus' ? [copyMts(pkgDir)] : []),
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
  }
})

export default packageConfigs

function generateAdditionalEntryDts(
  wsPkgsByShort: Map<string, (typeof wsPkgs)[number]>,
): void {
  for (const pkg of targetPackages) {
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

    for (const extra of buildOptions.additionalEntries) {
      const srcDts = `./temp/${relativeDir}/src/${extra.entry.replace(/\.ts$/, '.d.ts')}`
      if (!existsSync(srcDts)) continue

      const outputFile = extra.output.replace(/\.js$/, '.d.ts')
      const outputPath = `${pkgDir}/${outputFile}`
      const extraCode = readFileSync(srcDts, 'utf-8')
      const extraPatched = patchTypesCode(extraCode)

      const extraDir = outputPath.substring(0, outputPath.lastIndexOf('/'))
      if (!existsSync(extraDir)) {
        mkdirSync(extraDir, { recursive: true })
      }

      writeFileSync(outputPath, extraPatched)
      console.log(`[dts] ${outputFile} written`)
    }
  }
}

generateAdditionalEntryDts(wsPkgsByShort)

function patchTypes(pkg: string, pkgDir: string): Plugin {
  return {
    name: 'patch-types',

    renderChunk(code) {
      let patchedCode = patchTypesCode(code)

      const additionalTypeDir = `${pkgDir}/types`

      if (existsSync(additionalTypeDir)) {
        patchedCode +=
          '\n' +
          readdirSync(additionalTypeDir)
            .map(file => readFileSync(`${additionalTypeDir}/${file}`, 'utf-8'))
            .join('\n')
      }

      return {
        code: patchedCode,
        map: null,
      }
    },
  }
}

function patchTypesCode(code: string): string {
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
      | import('@babel/types').TSEnumDeclaration
      | import('@babel/types').ClassDeclaration,
    parentDecl?: import('@babel/types').VariableDeclaration,
  ) {
    if (!node.id) return

    assert(node.id.type === 'Identifier')

    const name = node.id.name

    if (name.startsWith('_')) return

    shouldRemoveExport.add(name)

    if (isExported.has(name)) {
      const start = (parentDecl || node).start
      assert(typeof start === 'number')
      s.prependLeft(start, `export `)
    }
  }

  const isExported = new Set<string>()
  const shouldRemoveExport = new Set<string>()

  for (const node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration' && !node.source) {
      for (const spec of node.specifiers) {
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

  return s.toString()
}

function copyMts(pkgDir: string): Plugin {
  return {
    name: 'copy-zeus-mts',
    writeBundle(_, bundle) {
      const dtsEntry = bundle['zeus.d.ts']
      if (dtsEntry && 'code' in dtsEntry) {
        writeFileSync(`${pkgDir}/dist/zeus.d.mts`, dtsEntry.code)
      }
    },
  }
}
