import type { HmrContext } from 'vite'
import type { ZeusPluginOptions } from './options'
import { isFileIncluded } from './utils'

/**
 * 处理热更新
 */
export function applyHMR(
  ctx: HmrContext,
  options: Required<ZeusPluginOptions>
) {
  const { file, modules } = ctx

  // 检查文件是否需要处理
  if (!isFileIncluded(file, options.include, options.exclude)) {
    return
  }

  // 查找可能受影响的自定义元素
  if (
    options.webComponentsMode !== 'auto' &&
    file.includes('defineCustomElement')
  ) {
    // 为自定义元素应用特殊的热更新策略
    return customElementHMR(ctx, options)
  }

  // 默认返回受影响的模块
  return modules
}

/**
 * 处理自定义元素的热更新
 */
function customElementHMR(
  ctx: HmrContext,
  options: Required<ZeusPluginOptions>
) {
  const { modules } = ctx

  // 这里实现特殊的自定义元素热更新逻辑
  // 例如，可能需要先卸载然后重新注册自定义元素

  return modules
}
