#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { extname, join } from 'node:path'
import { compiler } from '@zeus-js/compiler-core'

const SRC_DIR = './tsx'
const DIST_DIR = './dist'

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true })
}

function compileFile(filePath, outputPath) {
  try {
    const source = readFileSync(filePath, 'utf-8')
    const ext = extname(filePath).toLowerCase()
    const sourceType = ext === '.tsx' ? 'tsx' : 'jsx'

    console.log(`📄 编译 / Compiling: ${filePath}`)

    const result = compiler(source, {
      sourceType,
      experimental: true,
      target: 'es5',
      minify: false,
    })

    if (result.success) {
      writeFileSync(outputPath, result.code, 'utf-8')
      console.log(`✅ 成功 / Compiled: ${outputPath}\n`)
      return true
    } else {
      console.error(`❌ 失败 / Failed: ${filePath}`)
      console.error(`错误 / Errors:`, result.errors)
      return false
    }
  } catch (error) {
    console.error(`💥 错误 / Error: ${filePath}`)
    console.error(error)
    return false
  }
}

function main() {
  console.log('🚀 开始编译 / Starting Compilation\n')

  let successCount = 0
  let failCount = 0

  try {
    const files = readdirSync(SRC_DIR)
      .filter(file => file.endsWith('.tsx') || file.endsWith('.jsx'))
      .map(file => ({
        input: join(SRC_DIR, file),
        output: join(DIST_DIR, file.replace(/\.(tsx|jsx)$/, '.js')),
      }))

    if (files.length === 0) {
      console.log('⚠️ 没有找到 TSX 文件 / No TSX files found')
      return
    }

    console.log(
      `📂 找到 ${files.length} 个文件 / Found ${files.length} files:\n`,
    )

    for (const { input, output } of files) {
      if (compileFile(input, output)) {
        successCount++
      } else {
        failCount++
      }
    }

    console.log('📊 编译结果 / Compilation Results:')
    console.log(`   ✅ 成功 / Success: ${successCount}`)
    console.log(`   ❌ 失败 / Failed: ${failCount}`)

    if (failCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('💥 编译错误 / Compilation error:')
    console.error(error)
    process.exit(1)
  }
}

main()
