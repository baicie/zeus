import { AlienElement, AlienLightElement } from './base'
import { Component } from '@zeus/runtime'

/**
 * 定义 Web Component 装饰器
 * @param tagName 自定义元素标签名
 * @returns 类装饰器
 */
export function defineElement(tagName: string) {
  return function <T extends { new (...args: any[]): AlienElement }>(
    constructor: T
  ) {
    // 注册自定义元素
    customElements.define(tagName, constructor)

    // 返回原始构造函数
    return constructor
  }
}

/**
 * 定义轻量级 Web Component 装饰器
 * @param tagName 自定义元素标签名
 * @returns 类装饰器
 */
export function defineLightElement(tagName: string) {
  return function <T extends { new (...args: any[]): AlienLightElement }>(
    constructor: T
  ) {
    // 注册自定义元素
    customElements.define(tagName, constructor)

    // 返回原始构造函数
    return constructor
  }
}

/**
 * 定义组件装饰器
 * @param componentClass 组件类
 * @returns 属性装饰器
 */
export function defineComponent(componentClass: typeof Component) {
  return function (target: any, propertyKey: string) {
    // 重写 createComponent 方法
    target.createComponent = function () {
      return new componentClass()
    }
  }
}

/**
 * 定义属性装饰器
 * @param attributeName 属性名
 * @returns 属性装饰器
 */
export function defineAttribute(attributeName: string) {
  return function (target: any, propertyKey: string) {
    // 获取属性值
    const getter = function () {
      return this.getAttribute(attributeName)
    }

    // 设置属性值
    const setter = function (value: string) {
      if (value === null || value === undefined) {
        this.removeAttribute(attributeName)
      } else {
        this.setAttribute(attributeName, String(value))
      }
    }

    // 定义属性
    Object.defineProperty(target, propertyKey, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true,
    })
  }
}

/**
 * 定义布尔属性装饰器
 * @param attributeName 属性名
 * @returns 属性装饰器
 */
export function defineBooleanAttribute(attributeName: string) {
  return function (target: any, propertyKey: string) {
    // 获取属性值
    const getter = function () {
      return this.hasAttribute(attributeName)
    }

    // 设置属性值
    const setter = function (value: boolean) {
      this.toggleAttribute(attributeName, value)
    }

    // 定义属性
    Object.defineProperty(target, propertyKey, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true,
    })
  }
}

/**
 * 定义事件装饰器
 * @param eventName 事件名
 * @returns 方法装饰器
 */
export function defineEvent(eventName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = function (...args: any[]) {
      // 调用原始方法
      const result = originalMethod.apply(this, args)

      // 分发自定义事件
      this.dispatchCustomEvent(eventName, result)

      return result
    }

    return descriptor
  }
}

/**
 * 定义观察属性装饰器
 * @param attributeNames 要观察的属性名数组
 * @returns 类装饰器
 */
export function observeAttributes(attributeNames: string[]) {
  return function <T extends { new (...args: any[]): HTMLElement }>(
    constructor: T
  ) {
    // 设置 observedAttributes
    constructor.observedAttributes = attributeNames

    return constructor
  }
}

/**
 * 定义样式装饰器
 * @param styles CSS 样式字符串
 * @returns 类装饰器
 */
export function defineStyles(styles: string) {
  return function <T extends { new (...args: any[]): AlienElement }>(
    constructor: T
  ) {
    // 保存样式
    constructor.prototype._styles = styles

    // 重写 connectedCallback
    const originalConnectedCallback = constructor.prototype.connectedCallback

    constructor.prototype.connectedCallback = function () {
      // 添加样式到 Shadow DOM
      if (this.shadow && this._styles) {
        const style = document.createElement('style')
        style.textContent = this._styles
        this.shadow.appendChild(style)
      }

      // 调用原始的 connectedCallback
      if (originalConnectedCallback) {
        originalConnectedCallback.call(this)
      }
    }

    return constructor
  }
}

/**
 * 定义模板装饰器
 * @param template HTML 模板字符串
 * @returns 类装饰器
 */
export function defineTemplate(template: string) {
  return function <T extends { new (...args: any[]): AlienElement }>(
    constructor: T
  ) {
    // 保存模板
    constructor.prototype._template = template

    // 重写 connectedCallback
    const originalConnectedCallback = constructor.prototype.connectedCallback

    constructor.prototype.connectedCallback = function () {
      // 添加模板到 Shadow DOM
      if (this.shadow && this._template) {
        this.shadow.innerHTML = this._template
      }

      // 调用原始的 connectedCallback
      if (originalConnectedCallback) {
        originalConnectedCallback.call(this)
      }
    }

    return constructor
  }
}

/**
 * 定义生命周期钩子装饰器
 */
export const lifecycle = {
  /**
   * 元素创建时调用
   */
  created: function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = function () {
      // 在构造函数中调用
      const result = originalMethod.apply(this)
      return result
    }

    return descriptor
  },

  /**
   * 元素连接到 DOM 时调用
   */
  connected: function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value
    const originalConnectedCallback = target.connectedCallback

    target.connectedCallback = function () {
      // 调用原始的 connectedCallback
      if (originalConnectedCallback) {
        originalConnectedCallback.call(this)
      }

      // 调用生命周期方法
      originalMethod.call(this)
    }

    return descriptor
  },

  /**
   * 元素从 DOM 断开时调用
   */
  disconnected: function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value
    const originalDisconnectedCallback = target.disconnectedCallback

    target.disconnectedCallback = function () {
      // 调用生命周期方法
      originalMethod.call(this)

      // 调用原始的 disconnectedCallback
      if (originalDisconnectedCallback) {
        originalDisconnectedCallback.call(this)
      }
    }

    return descriptor
  },

  /**
   * 属性变化时调用
   */
  attributeChanged: function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value
    const originalAttributeChangedCallback = target.attributeChangedCallback

    target.attributeChangedCallback = function (
      name: string,
      oldValue: string,
      newValue: string
    ) {
      // 调用原始的 attributeChangedCallback
      if (originalAttributeChangedCallback) {
        originalAttributeChangedCallback.call(this, name, oldValue, newValue)
      }

      // 调用生命周期方法
      originalMethod.call(this, name, oldValue, newValue)
    }

    return descriptor
  },
}
