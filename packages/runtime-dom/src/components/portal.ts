/**
 * Portal Component
 *
 * Renders content into a different DOM node
 *
 * Usage:
 *   <Portal target="#modal-root">
 *     <div class="modal">Modal content</div>
 *   </Portal>
 */

import { effect } from '@zeus-js/signal'

export interface PortalProps {
  target: string | Element | null | undefined
  children?: any
}

export function Portal(props: PortalProps): Node | null {
  const target = props.target

  if (!target) {
    return document.createComment('portal-no-target')
  }

  const children = props.children
  if (children == null) {
    return document.createComment('portal-empty')
  }

  const placeholder = document.createComment('portal-placeholder')

  let targetEl: Element | null = null
  const resolveTarget = function (): Element | null {
    if (typeof target === 'string') {
      return document.querySelector(target)
    }
    if (target instanceof Element) {
      return target
    }
    return null
  }

  const addNodesToTarget = function (child: any): Node[] {
    const childNodes: Node[] = []

    const addNodes = (c: any) => {
      if (!targetEl) {
        return
      }
      if (c == null || typeof c === 'boolean') {
        return
      }
      if (c instanceof Node) {
        targetEl.appendChild(c)
        childNodes.push(c)
      } else if (Array.isArray(c)) {
        for (const item of c) {
          addNodes(item)
        }
      } else {
        const textNode = document.createTextNode(String(c))
        targetEl.appendChild(textNode)
        childNodes.push(textNode)
      }
    }

    addNodes(child)
    return childNodes
  }

  let mounted = false
  let warned = false

  const mount = function () {
    if (mounted) {
      return
    }
    targetEl = resolveTarget()
    if (!targetEl) {
      if (!warned && typeof target === 'string') {
        warned = true
      }
      return
    }

    mounted = true

    if (typeof children === 'function') {
      let currentNodes: Node[] = []

      effect(function () {
        if (!targetEl) {
          return
        }
        const value = children()

        for (const node of currentNodes) {
          if (node.parentNode === targetEl) {
            targetEl.removeChild(node)
          }
        }
        currentNodes = []

        currentNodes = addNodesToTarget(value)
      })

      return
    }

    addNodesToTarget(children)
  }

  mount()

  if (!mounted && typeof target === 'string') {
    requestAnimationFrame(function () {
      mount()
    })

    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver(function () {
        mount()
        if (mounted) {
          observer.disconnect()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }
  }

  return placeholder
}
