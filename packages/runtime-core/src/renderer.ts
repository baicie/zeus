import {
  createLifecycle,
  hasLifecycleHooks,
  invokeCleanupHook,
  invokeMountHook,
  setCurrentLifecycle,
} from './lifecycle'
import type { ComponentFunction } from './component'
import { queuePostFlushCb } from './scheduler'

interface ComponentInstance {
  lifecycle: ReturnType<typeof createLifecycle>
  node: Node | null
  unmounted: boolean
}

interface MountedComponent {
  node: Node | null
  unmount: () => void
}

const currentInstance: { instance: ComponentInstance | null } = {
  instance: null,
}

export function render(component: ComponentFunction, container: Element): void {
  container.innerHTML = ''
  const instance = createInstance(component)
  if (instance.node) {
    container.appendChild(instance.node)
  }
}

export function createInstance<P>(
  component: ComponentFunction<P>,
): ComponentInstance {
  const instance: ComponentInstance = {
    lifecycle: createLifecycle(),
    node: null,
    unmounted: false,
  }

  setCurrentLifecycle(instance.lifecycle)

  try {
    instance.node = component()
  } finally {
    setCurrentLifecycle(null)
  }

  if (hasLifecycleHooks(instance.lifecycle)) {
    queuePostFlushCb(function () {
      if (!instance.unmounted) {
        invokeMountHook(instance.lifecycle)
      }
    })
  }

  return instance
}

export function unmountInstance(instance: ComponentInstance): void {
  if (instance.unmounted) {
    return
  }

  instance.unmounted = true

  invokeCleanupHook(instance.lifecycle)
}

export function mountComponent(
  component: ComponentFunction,
  anchor: Node,
): MountedComponent {
  const instance = createInstance(component)
  const node = instance.node

  if (node && anchor.parentNode) {
    anchor.parentNode.insertBefore(node, anchor)
  }

  return {
    node,
    unmount: function () {
      unmountInstance(instance)
      if (node && node.parentNode) {
        node.parentNode.removeChild(node)
      }
    },
  }
}

export function getCurrentInstance(): ComponentInstance | null {
  return currentInstance.instance
}

export function setCurrentInstance(instance: ComponentInstance | null): void {
  currentInstance.instance = instance
}
