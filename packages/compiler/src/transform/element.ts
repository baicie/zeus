import { transformAttributes } from './attributes'
import { transformChildren } from './children'
import { VoidElements } from '../utils'
import { getTagName } from '../utils'

import type {
  BabelJSXElementPath,
  BabelState,
  ElementTransformResults,
} from '../types'

export function transformElement(path: BabelJSXElementPath, state: BabelState) {
  // const node = path.node
  // const tagName = getTagName(node)

  // <Component ...></Component>
  // if (isComponent(tagName)) return transformComponent(path)

  return transformElementDOM(path, state)
}

export function transformElementDOM(
  path: BabelJSXElementPath,
  state: BabelState,
): ElementTransformResults {
  const tagName = getTagName(path.node)
  const voidTag = VoidElements.includes(tagName)

  const results: ElementTransformResults = {
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
    id: path.scope.generateUidIdentifier('el$'),
    kind: 'element',
  }

  // 4. 处理属性
  transformAttributes(path, results)

  // 5. 闭合标签
  results.template += '>'
  results.templateWithClosingTags += '>'
  if (!voidTag) {
    transformChildren(path, state, results)
    results.template += `</${tagName}>`
    results.templateWithClosingTags += `</${tagName}>`
  }

  return results
}
