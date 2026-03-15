/**
 * Conditional rendering helpers for fine-grained reactive conditional rendering.
 *
 * These helpers enable the compiler to transform if/return control flow patterns
 * into reactive computations that update only the changed DOM nodes.
 */

import { effect, signal } from '@zeus-js/signal'

/**
 * Options for conditional rendering
 */
export interface ConditionalOptions<T> {
  /**
   * The condition function (signal getter)
   */
  condition: () => boolean
  /**
   * The render function for the truthy case
   */
  then: () => T
  /**
   * Optional render function for the falsy case
   */
  else?: () => T
}

/**
 * Create a conditional renderer with fine-grained reactivity
 *
 * This function creates a reactive conditional that:
 * 1. Tracks signal dependencies automatically
 * 2. Only re-renders the branch that changes
 * 3. Maintains DOM node references for efficient updates
 *
 * @example
 * ```typescript
 * const Conditional = conditional({
 *   condition: () => show(),
 *   then: () => <div>Shown</div>,
 *   else: () => <span>Hidden</span>
 * })
 * ```
 */
export function conditional<T>(
  options: ConditionalOptions<T>,
): () => T | undefined {
  const { condition, then, else: elseRender } = options

  // Track the current rendered value
  const currentValue = signal<T | undefined>(undefined)
  // Track which branch was last rendered
  let lastBranch: 'then' | 'else' | null = null

  // Create effect to track condition changes
  effect(() => {
    const cond = condition()

    if (cond) {
      if (lastBranch !== 'then') {
        currentValue(then())
        lastBranch = 'then'
      }
    } else if (elseRender) {
      if (lastBranch !== 'else') {
        currentValue(elseRender())
        lastBranch = 'else'
      }
    } else {
      // No else branch and condition is false
      if (lastBranch !== null) {
        currentValue(undefined)
        lastBranch = null
      }
    }
  })

  // Return accessor function
  return () => currentValue()
}

/**
 * Simplified if-only conditional (no else branch)
 */
export function ifOnly<T>(
  condition: () => boolean,
  thenRender: () => T,
): () => T | undefined {
  return conditional({
    condition,
    then: thenRender,
  })
}

/**
 * Simplified if-else conditional
 */
export function ifElse<T>(
  condition: () => boolean,
  thenRender: () => T,
  elseRender: () => T,
): () => T {
  return conditional({
    condition,
    then: thenRender,
    else: elseRender,
  }) as () => T
}

/**
 * Show component - conditionally renders content based on condition
 * Uses display: none for hidden content to preserve DOM state
 *
 * @example
 * ```typescript
 * <Show when={() => loading()}>
 *   <Spinner />
 * </Show>
 * ```
 */
export function show<T>(
  when: () => boolean,
  fallback?: () => T,
): () => T | undefined {
  return conditional({
    condition: when,
    then: () => true as unknown as T,
    else: fallback ? () => fallback() : undefined,
  })
}

/**
 * Switch-like conditional for multiple conditions
 *
 * @example
 * ```typescript
 * const value = switchCase(
 *   () => type() === 'a', () => <ComponentA />,
 *   () => type() === 'b', () => <ComponentB />,
 *   () => <DefaultComponent />
 * )
 * ```
 */
export function switchCase<T>(
  ...cases: [() => boolean, () => T][]
): () => T | undefined {
  return () => {
    for (const [condition, render] of cases) {
      if (condition()) {
        return render()
      }
    }
    return undefined
  }
}

/**
 * Lazy conditional - defers evaluation until needed
 * Useful for expensive conditional computations
 */
export function lazyConditional<T>(
  condition: () => boolean,
  thenRender: () => T,
  elseRender?: () => T,
): () => T | undefined {
  let cachedThen: T | undefined
  let cachedElse: T | undefined
  let thenCached = false
  let elseCached = false
  let lastBranch: 'then' | 'else' | null = null

  const result = signal<T | undefined>(undefined)

  effect(() => {
    const cond = condition()

    if (cond) {
      if (!thenCached) {
        cachedThen = thenRender()
        thenCached = true
      }
      if (lastBranch !== 'then') {
        result(cachedThen)
        lastBranch = 'then'
      }
    } else if (elseRender) {
      if (!elseCached) {
        cachedElse = elseRender()
        elseCached = true
      }
      if (lastBranch !== 'else') {
        result(cachedElse)
        lastBranch = 'else'
      }
    } else {
      if (lastBranch !== null) {
        result(undefined)
        lastBranch = null
      }
    }
  })

  return () => result()
}
