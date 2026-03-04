#!/usr/bin/env tsx

import { compiler } from '@zeus-js/compiler-core'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { extname, join } from 'node:path'

// 源目录和输出目录 / Source and output directories
const SRC_DIR = './tsx'
const DIST_DIR = './dist'

// 确保输出目录存在 / Ensure output directory exists
if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true })
}

/**
 * 编译单个 TSX 文件 / Compile single TSX file
 */
function compileFile(filePath: string, outputPath: string) {
  try {
    // 读取源文件 / Read source file
    const source = readFileSync(filePath, 'utf-8')

    // 获取文件扩展名来确定源类型 / Get file extension to determine source type
    const ext = extname(filePath).toLowerCase()
    const sourceType = ext === '.tsx' ? 'tsx' : 'jsx'

    console.log(`📄 编译文件 / Compiling: ${filePath}`)

    // 调用编译器 / Call compiler
    const result = compiler(source, {
      sourceType,
      experimental: true,
      target: 'es5',
      minify: false,
    })

    if (result.success) {
      // 写入编译结果 / Write compiled result
      writeFileSync(outputPath, result.code, 'utf-8')
      console.log(`✅ 编译成功 / Compiled successfully: ${outputPath}`)
    } else {
      console.error(`❌ 编译失败 / Compilation failed: ${filePath}`)
      console.error(`错误 / Errors:`, result.errors)
    }
  } catch (error) {
    console.error(`💥 编译时发生错误 / Error during compilation: ${filePath}`)
    console.error(error)
  }
}

/**
 * 主编译函数 / Main compile function
 */
function main() {
  console.log('🚀 开始编译 TSX 文件 / Starting TSX compilation\n')

  try {
    // 获取所有 TSX 文件 / Get all TSX files
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

    // 编译每个文件 / Compile each file
    for (const { input, output } of files) {
      compileFile(input, output)
    }

    console.log('\n🎉 编译完成! / Compilation completed!')
    console.log(`📁 输出目录 / Output directory: ${DIST_DIR}`)
  } catch (error) {
    console.error('💥 编译过程发生错误 / Error during compilation process:')
    console.error(error)
    process.exit(1)
  }
}

// 运行主函数 / Run main function
main()
