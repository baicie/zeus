/**
 * HMR (Hot Module Replacement) Runtime for Zeus Framework
 *
 * This module provides component-level HMR support, similar to Vue's approach.
 * Components can be hot-updated without losing state.
 */

import { effect } from '@zeus-js/signal'

// =============================================================================
// Types
// =============================================================================

export interface HMRRecord {
  id: string
  component: () => Node
  instances: Set<HMRElement>
}

export interface HMRElement {
  rootNode: Node
  container: Element
  disposeEffect: (() => void) | null
}

// =============================================================================
// Global HMR Runtime
// =============================================================================

const componentMap = new Map<string, HMRRecord>()

/**
 * Create or update a component record for HMR
 */
export function createComponentRecord(
  id: string,
  component: () => Node,
): boolean {
  if (componentMap.has(id)) {
    const record = componentMap.get(id)!
    record.component = component
    return false
  }
  componentMap.set(id, {
    id,
    component,
    instances: new Set(),
  })
  return true
}

/**
 * Register an element instance for a component
 */
export function registerHMRInstance(id: string, instance: HMRElement): void {
  let record = componentMap.get(id)
  if (!record) {
    createComponentRecord(id, () => document.createElement('div'))
    record = componentMap.get(id)!
  }
  record.instances.add(instance)
}

/**
 * Unregister an element instance
 */
export function unregisterHMRInstance(id: string, instance: HMRElement): void {
  const record = componentMap.get(id)
  if (record) {
    record.instances.delete(instance)
  }
}

/**
 * Rerender - only update the component function without destroying instances
 * Used when only the component's template/logic changed
 */
export function hmrRerender(id: string, newComponent?: () => Node): void {
  const record = componentMap.get(id)
  if (!record) return

  if (newComponent) {
    record.component = newComponent
  }

  // Update all instances
  record.instances.forEach(instance => {
    if (instance.disposeEffect) {
      instance.disposeEffect()
    }
    instance.rootNode = record.component()
    if (instance.rootNode && instance.container) {
      instance.container.innerHTML = ''
      instance.container.appendChild(instance.rootNode)
    }
    // Recreate effect
    instance.disposeEffect = effect(() => {
      instance.rootNode = record.component()
      if (instance.rootNode && instance.container) {
        instance.container.innerHTML = ''
        instance.container.appendChild(instance.rootNode)
      }
    })
  })
}

/**
 * Reload - full component reload, destroying and recreating instances
 * Used when the component's props or structure changed significantly
 */
export function hmrReload(id: string, newComponent: () => Node): void {
  const record = componentMap.get(id)
  if (!record) return

  // Dispose all instances first
  record.instances.forEach(instance => {
    if (instance.disposeEffect) {
      instance.disposeEffect()
    }
    if (instance.rootNode && instance.container) {
      instance.container.removeChild(instance.rootNode)
    }
  })

  // Clear instances and update component
  record.instances.clear()
  record.component = newComponent
}

/**
 * Get component record by ID
 */
export function getComponentRecord(id: string): HMRRecord | undefined {
  return componentMap.get(id)
}

/**
 * Get all component records
 */
export function getAllComponentRecords(): Map<string, HMRRecord> {
  return componentMap
}

// =============================================================================
// Expose HMR Runtime on Global Object
// =============================================================================

declare global {
  interface Window {
    __ZEUS_HMR_RUNTIME__?: {
      createRecord: typeof createComponentRecord
      rerender: typeof hmrRerender
      reload: typeof hmrReload
    }
  }
}

if (typeof window !== 'undefined') {
  window.__ZEUS_HMR_RUNTIME__ = {
    createRecord: createComponentRecord,
    rerender: hmrRerender,
    reload: hmrReload,
  }
}
