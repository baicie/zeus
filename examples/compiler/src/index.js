/**
 * Playground for testing @zeus-js/compiler Babel plugin
 *
 * Usage:
 *   pnpm playground          - Transform all test cases in src/cases/
 *   pnpm playground <file>   - Transform a specific file (relative to cwd or absolute path)
 *
 * Examples:
 *   pnpm playground                           - Transform all cases
 *   pnpm playground src/cases/basic.tsx      - Transform specific file
 *
 * Output is saved to src/output/
 */
const babelCore = require('@babel/core')
const fs = require('fs')
const path = require('path')

const compiler = require('@zeus-js/compiler').default

const outputDir = path.join(__dirname, 'output')

async function transformFile(filename) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Transforming: ${filename}`)
  console.log('='.repeat(60))

  const sourceCode = fs.readFileSync(filename, 'utf-8')
  console.log('\n--- Original Source ---')
  console.log(sourceCode)

  try {
    const result = babelCore.transformSync(sourceCode, {
      plugins: [compiler],
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
      const outputFile = path.join(
        outputDir,
        path.relative(path.join(__dirname, 'cases'), filename),
      )
      const formattedCode = await formatOutput(result.code, outputFile)

      console.log(formattedCode)

      // Save output
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      const outputSubDir = path.dirname(outputFile)
      if (!fs.existsSync(outputSubDir)) {
        fs.mkdirSync(outputSubDir, { recursive: true })
      }
      fs.writeFileSync(outputFile, formattedCode)
      console.log(`\n[Saved to: ${outputFile}]`)
    }
  } catch (error) {
    console.error('\n--- Error ---')
    console.error(error)
  }
}

async function formatOutput(code, filepath) {
  const prettier = await import('prettier')
  const config = (await prettier.resolveConfig(filepath)) ?? {}

  return prettier.format(code, {
    ...config,
    filepath,
    parser: 'babel-ts',
  })
}

// Entry point
async function main() {
  const args = process.argv.slice(2)
  const casesDir = path.join(__dirname, 'cases')

  if (args.length > 0) {
    const filePath = path.isAbsolute(args[0])
      ? args[0]
      : path.join(__dirname, args[0])
    await transformFile(filePath)
  } else {
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

    for (const file of files) {
      await transformFile(path.join(casesDir, file))
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
