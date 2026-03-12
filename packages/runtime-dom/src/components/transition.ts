/**
 * Transition Component
 *
 * Adds CSS transition effects when elements appear/disappear
 *
 * Usage:
 *   <Transition name="fade" appear onEnter={(el) => el.classList.add('active')}>
 *     <div>Content</div>
 *   </Transition>
 *
 * CSS classes (with name="fade"):
 *   .fade-enter        - Initial state when entering
 *   .fade-enter-active - Active state during enter
 *   .fade-leave        - Initial state when leaving
 *   .fade-leave-active - Active state during leave
 */

import { effect, signal } from '@zeus-js/signal'

export interface TransitionProps {
  appear?: boolean
  enter?: boolean
  leave?: boolean
  name?: string
  children?: any
  onEnter?: (el: Element) => void
  onLeave?: (el: Element, done: () => void) => void
}

interface TransitionState {
  status: 'idle' | 'entering' | 'leaving'
}

export function Transition(props: TransitionProps): any {
  const {
    children,
    name = 'v',
    appear = false,
    enter = true,
    leave = true,
  } = props

  const version = signal(0)

  const container = document.createElement('div')
  container.setAttribute('data-transition', 'true')

  const getClassPrefix = () => name

  const processNodes = (
    child: any,
    isMounting: boolean,
    isEnter: boolean,
  ): Node[] => {
    if (child == null || typeof child === 'boolean') {
      return []
    }

    const nodes: Node[] = []

    const addNodes = (c: any) => {
      if (c == null || typeof c === 'boolean') {
        return
      }

      if (c instanceof Node) {
        const el = c as Element

        if ((isEnter || appear) && enter) {
          const enterClass = `${getClassPrefix()}-enter`
          const enterActiveClass = `${getClassPrefix()}-enter-active`

          el.classList.add(enterClass)

          if (props.onEnter) {
            props.onEnter(el)
          }

          requestAnimationFrame(function () {
            el.classList.add(enterActiveClass)
            el.classList.remove(enterClass)
          })

          const transitionEnd = function () {
            el.classList.remove(enterActiveClass)
            el.removeEventListener('transitionend', transitionEnd)
            el.removeEventListener('animationend', transitionEnd)
          }

          el.addEventListener('transitionend', transitionEnd)
          el.addEventListener('animationend', transitionEnd)
        }

        nodes.push(el)
      } else if (Array.isArray(c)) {
        for (const item of c) {
          addNodes(item)
        }
      }
    }

    addNodes(child)
    return nodes
  }

  if (typeof children === 'function') {
    let prevValue: any = undefined
    let isLeaving = false

    effect(function () {
      const value = children()

      if (prevValue !== undefined && value !== prevValue) {
        if (
          leave &&
          !isLeaving &&
          container.childNodes.length > 0 &&
          (value == null ||
            value === false ||
            (Array.isArray(value) && value.length === 0))
        ) {
          isLeaving = true
          const nodes = Array.from(container.childNodes)
          let pendingTransitions = nodes.length

          for (const node of nodes) {
            if (node instanceof Element) {
              const leaveClass = `${getClassPrefix()}-leave`
              const leaveActiveClass = `${getClassPrefix()}-leave-active`

              node.classList.add(leaveClass)

              requestAnimationFrame(function () {
                node.classList.add(leaveActiveClass)
                node.classList.remove(leaveClass)
              })

              if (props.onLeave) {
                props.onLeave(node, function () {
                  node.classList.remove(leaveActiveClass)
                  if (node.parentNode) {
                    node.parentNode.removeChild(node)
                  }
                  pendingTransitions--
                  if (pendingTransitions <= 0) {
                    isLeaving = false
                    version(version() + 1)
                  }
                })
              } else {
                const transitionEnd = function () {
                  if (node.parentNode) {
                    node.parentNode.removeChild(node)
                  }
                  node.removeEventListener('transitionend', transitionEnd)
                  node.removeEventListener('animationend', transitionEnd)
                  pendingTransitions--
                  if (pendingTransitions <= 0) {
                    isLeaving = false
                    version(version() + 1)
                  }
                }

                node.addEventListener('transitionend', transitionEnd)
                node.addEventListener('animationend', transitionEnd)
              }
            } else {
              pendingTransitions--
              if (pendingTransitions <= 0) {
                isLeaving = false
              }
            }
          }

          prevValue = value
          return
        }
      }

      void version()

      prevValue = value

      if (isLeaving) {
        return
      }

      container.innerHTML = ''
      if (value == null || typeof value === 'boolean') {
        return
      }

      const newNodes: Node[] = []
      if (Array.isArray(value)) {
        for (const item of value) {
          const processed = processNodes(item, true, true)
          newNodes.push(...processed)
        }
      } else {
        const processed = processNodes(value, true, true)
        newNodes.push(...processed)
      }

      newNodes.forEach(node => container.appendChild(node))
    })

    return container
  }

  const staticNodes = processNodes(children, false, false)
  staticNodes.forEach(node => container.appendChild(node))
  return container
}

export type { TransitionState }
