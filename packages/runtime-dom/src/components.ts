/**
 * Built-in Components for Zeus Framework
 *
 * Provides: Fragment, Portal, ErrorBoundary, Suspense, Transition
 */

import { effect, signal } from '@zeus-js/signal'

// =============================================================================
// Fragment - A component that renders its children without a wrapper element
// =============================================================================

/**
 * Fragment - Renders multiple children without a wrapper element
 *
 * Usage:
 *   <Fragment>
 *     <div>Item 1</div>
 *     <div>Item 2</div>
 *   </Fragment>
 *
 * Or shorthand:
 *   <>
 *     <div>Item 1</div>
 *     <div>Item 2</div>
 *   </>
 */
export function Fragment(props: { children?: any }): Node[] {
  if (props.children == null) {
    return []
  }
  if (Array.isArray(props.children)) {
    // Filter out null/undefined/boolean values
    return props.children.filter(
      (child: any) => child != null && typeof child !== 'boolean',
    )
  }
  return [props.children]
}

// =============================================================================
// Portal - Renders children into a different DOM node
// =============================================================================

/**
 * Portal - Renders content into a different DOM node
 *
 * Usage:
 *   <Portal target="#modal-root">
 *     <div class="modal">Modal content</div>
 *   </Portal>
 */
export interface PortalProps {
  target: string | Element | null | undefined
  children?: any
}

export function Portal(props: PortalProps): Node | null {
  const target = props.target

  if (!target) {
    return document.createComment('portal-no-target')
  }

  // Render children
  const children = props.children
  if (children == null) {
    return document.createComment('portal-empty')
  }

  // Target element can be rendered later (common when <Portal/> appears before the target in JSX).
  // So we keep a placeholder in the normal tree and mount into the target when it becomes available.
  const placeholder = document.createComment('portal-placeholder')

  // Get / refresh target element
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

  // Helper to add nodes to target (uses latest targetEl)
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

    // If children is a function (reactive), set up effect
    if (typeof children === 'function') {
      let currentNodes: Node[] = []

      effect(function () {
        if (!targetEl) {
          return
        }
        const value = children()

        // Remove old nodes
        for (const node of currentNodes) {
          if (node.parentNode === targetEl) {
            targetEl.removeChild(node)
          }
        }
        currentNodes = []

        // Add new nodes
        currentNodes = addNodesToTarget(value)
      })

      return
    }

    // Static children - render immediately to target
    addNodesToTarget(children)
  }

  // Try mount immediately
  mount()

  // If not mounted yet, retry on next frame and observe DOM changes
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

// =============================================================================
// ErrorBoundary - Catches errors in child components
// =============================================================================

export interface ErrorBoundaryProps {
  children?: any
  fallback?: (error: Error, reset: () => void) => any
  onError?: (error: Error, errorInfo: { componentStack: string }) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * ErrorBoundary - Catches JavaScript errors in child components
 *
 * Usage:
 *   <ErrorBoundary fallback={(error, reset) => <div>Error: {error.message}</div>}>
 *     <ChildComponent />
 *   </ErrorBoundary>
 */
export function ErrorBoundary(props: ErrorBoundaryProps): any {
  // Use a signal to track state changes and trigger re-renders
  const version = signal(0)

  let state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  // Create a container element to hold rendered content
  const container = document.createElement('div')
  container.setAttribute('data-error-boundary', 'true')

  const reset = function () {
    state = { hasError: false, error: null }
    // Increment version to trigger re-render
    // The effect will automatically re-run because it depends on version()
    const newVersion = version() + 1
    version(newVersion)
  }

  // Helper to resolve child to nodes
  const resolveChild = function (child: any): Node[] {
    if (child == null || typeof child === 'boolean') {
      return []
    }
    if (child instanceof Node) {
      return [child]
    }
    if (Array.isArray(child)) {
      return child.reduce<Node[]>((acc, c) => acc.concat(resolveChild(c)), [])
    }
    if (typeof child === 'string' || typeof child === 'number') {
      return [document.createTextNode(String(child))]
    }
    return []
  }

  // Wrap children rendering to catch errors
  try {
    const children = props.children
    if (children == null) {
      return null
    }

    if (typeof children === 'function') {
      effect(function () {
        // Access version to make effect reactive to reset
        // Must assign to variable to create dependency

        // Clear container first
        container.innerHTML = ''

        try {
          const value = children()

          // Clear previous error state - allow children to render again
          if (state.hasError) {
            state = { hasError: false, error: null }
          }

          // Handle the result - append to container
          if (value == null || typeof value === 'boolean') {
            return
          }

          const nodes = resolveChild(value)
          for (const node of nodes) {
            container.appendChild(node)
          }
        } catch (e) {
          // Catch errors during rendering
          const error = e instanceof Error ? e : new Error(String(e))
          state = { hasError: true, error }

          if (props.onError) {
            props.onError(error, { componentStack: '' })
          }

          // Show fallback if provided
          if (props.fallback) {
            const fallbackResult = props.fallback(error, reset)
            if (fallbackResult != null) {
              const fallbackNodes = resolveChild(fallbackResult)
              for (const node of fallbackNodes) {
                container.appendChild(node)
              }
            }
          }
        }
      })

      return container
    }

    // Static children
    return children
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e))
    state = { hasError: true, error }

    if (props.onError) {
      props.onError(error, { componentStack: '' })
    }

    if (props.fallback) {
      return props.fallback(error, reset)
    }

    return null
  }
}

// =============================================================================
// Suspense - Shows fallback while child components are loading
// =============================================================================

export interface SuspenseProps {
  children?: any
  fallback?: any
}

/**
 * Suspense - Shows fallback content while content is loading
 *
 * Usage:
 *   <Suspense fallback={<div>Loading...</div>}>
 *     <AsyncComponent />
 *   </Suspense>
 *
 * Note: This is a basic implementation. For full Suspense support,
 * you would need to integrate with a resource/suspense mechanism.
 */
export function Suspense(props: SuspenseProps): any {
  const { children, fallback } = props

  // Create a container for Suspense content
  const container = document.createElement('div')
  container.setAttribute('data-suspense', 'true')

  // Resolve child to Node(s)
  const resolveChild = function (child: any): Node[] {
    if (child == null || typeof child === 'boolean') {
      return []
    }

    if (child instanceof Node) {
      return [child]
    }

    if (Array.isArray(child)) {
      return child.reduce<Node[]>((acc, c) => acc.concat(resolveChild(c)), [])
    }

    if (typeof child === 'string' || typeof child === 'number') {
      return [document.createTextNode(String(child))]
    }

    return []
  }

  // If children is a function (reactive)
  if (typeof children === 'function') {
    // Track promise state
    let currentPromise: Promise<any> | null = null

    // Create a function to handle the promise
    const handlePromise = function (promise: Promise<any>) {
      // Show fallback first
      container.innerHTML = ''
      if (fallback != null) {
        const fallbackNodes = resolveChild(fallback)
        fallbackNodes.forEach(node => container.appendChild(node))
      }

      // Listen for promise resolution
      promise
        .then(function (resolvedValue: any) {
          container.innerHTML = ''
          // The resolved value might be a function (lazy component)
          const renderFn =
            typeof resolvedValue === 'function'
              ? resolvedValue
              : function () {
                  return resolvedValue
                }
          const nodes = resolveChild(renderFn())
          nodes.forEach(node => container.appendChild(node))
        })
        .catch(function (error) {
          console.error('[Suspense] Error loading:', error)
        })
    }

    effect(function () {
      const value = children()

      // Check if it's a Promise (show fallback while loading)
      if (
        value &&
        typeof value === 'object' &&
        typeof value.then === 'function'
      ) {
        // It's a promise - show fallback and listen for resolution
        if (currentPromise !== value) {
          currentPromise = value
          handlePromise(value)
        }
        return
      }

      // Not a promise - resolve immediately
      currentPromise = null
      container.innerHTML = ''
      const resolvedNodes = resolveChild(value)
      resolvedNodes.forEach(node => container.appendChild(node))
    })

    return container
  }

  // Static children
  const staticNodes = resolveChild(children)
  staticNodes.forEach(node => container.appendChild(node))
  return container
}

// =============================================================================
// Transition - Adds transition effects when elements appear/disappear
// =============================================================================

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

/**
 * Transition - Adds CSS transition effects when elements appear/disappear
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
export function Transition(props: TransitionProps): any {
  const {
    children,
    name = 'v',
    appear = false,
    enter = true,
    leave = true,
  } = props

  // Use a signal to force effect re-run after leave animation completes
  const version = signal(0)

  // Create a container for Transition content
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

        // Apply enter transition when element is first added (isEnter)
        // or when component is first mounted with appear={true}
        if ((isEnter || appear) && enter) {
          const enterClass = `${getClassPrefix()}-enter`
          const enterActiveClass = `${getClassPrefix()}-enter-active`

          // Start with enter class (initial state)
          el.classList.add(enterClass)

          if (props.onEnter) {
            props.onEnter(el)
          }

          // Schedule adding active class and removing initial class
          requestAnimationFrame(function () {
            el.classList.add(enterActiveClass)
            el.classList.remove(enterClass)
          })

          // Remove classes after transition
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

  // If children is a function (reactive)
  if (typeof children === 'function') {
    let prevValue: any = undefined
    let isLeaving = false

    effect(function () {
      const value = children()

      // Check for changes to trigger transitions
      if (prevValue !== undefined && value !== prevValue) {
        // Value changed - handle leave transition
        if (
          leave &&
          !isLeaving &&
          container.childNodes.length > 0 &&
          (value == null ||
            value === false ||
            (Array.isArray(value) && value.length === 0))
        ) {
          // Items are being removed - use leave transition
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
                    // Force effect to re-run to update container
                    version(version() + 1)
                  }
                })
              } else {
                // Default transition handling if no onLeave provided
                const transitionEnd = function () {
                  if (node.parentNode) {
                    node.parentNode.removeChild(node)
                  }
                  node.removeEventListener('transitionend', transitionEnd)
                  node.removeEventListener('animationend', transitionEnd)
                  pendingTransitions--
                  if (pendingTransitions <= 0) {
                    isLeaving = false
                    // Force effect to re-run to update container
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

          // Return early - don't update container while leaving
          prevValue = value
          return
        }
      }

      // Access version to make effect reactive to leave animation completion
      void version()

      prevValue = value

      // Skip if currently leaving - let leave animation finish first
      if (isLeaving) {
        return
      }

      // Clear container and add new nodes
      container.innerHTML = ''
      if (value == null || typeof value === 'boolean') {
        return
      }

      // Handle enter transition for new nodes
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

  // Static children - process immediately
  const staticNodes = processNodes(children, false, false)
  staticNodes.forEach(node => container.appendChild(node))
  return container
}

// =============================================================================
// Export type definitions
// =============================================================================

export type { ErrorBoundaryState, TransitionState }
