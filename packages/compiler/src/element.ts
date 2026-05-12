import { VoidElements } from './constant'
import { getTagName, getZeusMetadata } from './unit'

import type {
  BabelJSXElementPath,
  BabelState,
  ElementTransformResult,
} from './types'

export function transformElementDOM(
  path: BabelJSXElementPath,
  state: BabelState,
): ElementTransformResult {
  // 编译时优化 求常量
  //   path
  //     .get('openingElement')
  //     .get('attributes')
  //     .forEach(attr => {})
  const tagName = getTagName(path.node)
  const metadata = getZeusMetadata(state)
  const voidTag = VoidElements.includes(tagName)

  const results: ElementTransformResult = {
    template: `<${tagName}`,
    templateWithClosingTags: `<${tagName}`,
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    isSVG: false,
    hasCustomElement: tagName.indexOf('-') > -1,
    isImportNode: tagName === 'img' || tagName === 'iframe',
    skipTemplate: false,
    tagName,
    renderer: 'dom',
  }

  // 4. 处理属性
  transformAttributes(path, results)
  // 5. 闭合标签
  results.template += '>'
  results.templateWithClosingTags += '>'
  if (!voidTag) {
    // transformChildren(path, results)
    results.template += `</${tagName}>`
    results.templateWithClosingTags += `</${tagName}>`
  }

  return results
}

function transformAttributes(
  path: BabelJSXElementPath,
  result: ElementTransformResult,
) {
  path
    .get('openingElement')
    .get('attributes')
    .forEach(attr => {})
}
