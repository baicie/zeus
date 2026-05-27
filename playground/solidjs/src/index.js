/**
 * Playground for testing babel-plugin-jsx-dom-expressions
 *
 * Usage:
 *   pnpm playground:solidjs                      - Transform all test cases in src/cases/
 *   pnpm playground:solidjs src/cases/basic.tsx  - Transform a specific file
 *
 * The plugin is loaded directly from the vendor dom-expressions package:
 *   vendor/dom-expressions/packages/babel-plugin-jsx-dom-expressions
 *
 * This playground serves as a reference implementation and debugging tool
 * for the @zeus-js/compiler plugin development.
 */
const babelCore = require('@babel/core')
const fs = require('fs')
const path = require('path')

// Load the babel plugin from the built version in the vendor dom-expressions package
// playground/solidjs/src/index.js -> vendor/dom-expressions/... requires 3 levels up
const domExpressionsPlugin = require('../../../vendor/dom-expressions/packages/babel-plugin-jsx-dom-expressions/index.js')

const casesDir = path.join(__dirname, 'cases')
const outputDir = path.join(__dirname, 'output')

const PLUGIN_OPTIONS = {
  moduleName: 'r-dom',
  generate: 'dom',
  hydratable: false,
  delegateEvents: true,
  delegatedEvents: [],
  builtIns: ['For', 'Show'],
  wrapConditionals: true,
  omitNestedClosingTags: false,
  omitLastClosingTag: true,
  omitQuotes: true,
  contextToCustomElements: false,
  staticMarker: '@once',
  effectWrapper: 'effect',
  memoWrapper: 'memo',
  validate: true,
  inlineStyles: true,
}

function transformFile(filename) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Transforming: ${path.relative(__dirname, filename)}`)
  console.log('='.repeat(60))

  const sourceCode = fs.readFileSync(filename, 'utf-8')
  console.log('\n--- Original Source ---')
  console.log(sourceCode)

  try {
    const result = babelCore.transformSync(sourceCode, {
      plugins: [[domExpressionsPlugin, PLUGIN_OPTIONS]],
      filename,
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
      sourceType: 'module',
      configFile: false,
      babelrc: false,
    })

    if (result) {
      console.log('\n--- Transformed Output ---')
      console.log(result.code)

      // Save output, preserving directory structure
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      const relativePath = path.relative(casesDir, filename)
      const outputFile = path.join(outputDir, relativePath)
      const outputSubDir = path.dirname(outputFile)
      if (!fs.existsSync(outputSubDir)) {
        fs.mkdirSync(outputSubDir, { recursive: true })
      }
      fs.writeFileSync(outputFile, result.code)
      console.log(`\n[Saved to: ${path.relative(__dirname, outputFile)}]`)
    }
  } catch (error) {
    console.error('\n--- Error ---')
    console.error(error.message)
    if (error.codeFrame) {
      console.error(error.codeFrame)
    }
  }
}

function main() {
  const args = process.argv.slice(2)

  if (args.length > 0) {
    // Transform specific file
    const filePath = path.isAbsolute(args[0])
      ? args[0]
      : path.join(process.cwd(), args[0])
    transformFile(filePath)
  } else {
    // Transform all cases
    if (!fs.existsSync(casesDir)) {
      fs.mkdirSync(casesDir, { recursive: true })
      console.log(`Created cases directory at: ${casesDir}`)
      console.log('Add .tsx files to it and run again.')
      return
    }

    const files = fs
      .readdirSync(casesDir)
      .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))

    if (files.length === 0) {
      console.log(`No .tsx/.ts files found in ${casesDir}`)
      console.log('Add test case files to get started.')
      return
    }

    console.log(`Found ${files.length} test case(s):`)
    files.forEach(f => console.log(`  - ${f}`))
    console.log()

    for (const file of files) {
      transformFile(path.join(casesDir, file))
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`Done. Output saved to: ${path.relative(__dirname, outputDir)}`)
    console.log('='.repeat(60))
  }
}

main()
