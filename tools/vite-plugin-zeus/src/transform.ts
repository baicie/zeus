import { transformSync } from '@babel/core'
import { createDOMCompiler } from '@zeus-js/compiler-dom'
import { relative } from 'node:path'
import type { ResolvedConfig } from 'vite'
import type { ZeusPluginOptions } from './options'
import { extend, isFileIncluded } from './utils'

/**
 * 创建代码转换函数
 */
export async function createTransform(
  code: string,
  id: string,
  options: Required<ZeusPluginOptions>,
  config: ResolvedConfig
) {
  // 检查文件是否需要处理
  if (!isFileIncluded(id, options.include, options.exclude)) {
    return null
  }

  try {
    // 创建 DOM 编译器
    const compiler = createDOMCompiler(
      extend({}, options.compiler, {
        webComponentsMode: options.webComponentsMode,
        isCustomElement: (tag: string) => {
          if (!options.customElementsPrefix) return false
          return tag.startsWith(options.customElementsPrefix)
        },
      })
    )

    // 转换代码
    const result = transformSync(code, {
      filename: id,
      presets: [],
      plugins: [
        [
          compiler,
          {
            optimizeSlots: options.optimizeSlots,
          },
        ],
      ],
      sourceMaps: true,
      sourceFileName: relative(config.root, id),
    })

    if (!result || !result.code) return null

    return {
      code: result.code,
      map: result.map,
    }
  } catch (e) {
    // 打印更友好的错误信息
    console.error(`\n[vite-plugin-zeus] Error transforming ${id}:`)
    console.error(e)

    // 重新抛出错误，让 Vite 处理
    throw e
  }
}
