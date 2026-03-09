import {
  createLifecycle,
  hasLifecycleHooks,
  invokeCleanupHook,
  invokeMountHook,
  invokeUnmountHook,
  setCurrentLifecycle,
} from './lifecycle'
import type { ComponentFunction } from './component'
import { queuePostFlushCb } from './scheduler'

interface ComponentInstance {
  lifecycle: ReturnType<typeof createLifecycle>
  node: Node | null
  unmounted: boolean
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
  invokeUnmountHook(instance.lifecycle)
}

export function getCurrentInstance(): ComponentInstance | null {
  return currentInstance.instance
}

export function setCurrentInstance(instance: ComponentInstance | null): void {
  currentInstance.instance = instance
}
