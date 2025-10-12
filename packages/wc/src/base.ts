import { Component } from '@zeus/runtime'
import { JSXNode } from '@zeus/compiler'
import { render, ReactiveRenderer } from '@zeus/runtime'

/**
 * Web Components 基类
 * 支持响应式渲染和 Shadow DOM
 */
export abstract class AlienElement extends HTMLElement {
  protected component: Component | null = null
  protected shadow: ShadowRoot
  protected renderer: ReactiveRenderer | null = null
  protected effects: (() => void)[] = []

  constructor() {
    super()

    // 创建 Shadow DOM
    this.shadow = this.attachShadow({ mode: 'open' })

    // 初始化组件
    this.component = this.createComponent()
  }

  /**
   * 元素连接到 DOM 时调用
   */
  connectedCallback(): void {
    if (this.component) {
      this.component.mount(this.shadow)
    }

    // 开始响应式渲染
    this.startReactiveRendering()
  }

  /**
   * 元素从 DOM 断开时调用
   */
  disconnectedCallback(): void {
    // 停止响应式渲染
    this.stopReactiveRendering()

    if (this.component) {
      this.component.destroy()
      this.component = null
    }
  }

  /**
   * 属性变化时调用
   */
  attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    // 通知组件属性变化
    if (
      this.component &&
      typeof this.component.onAttributeChanged === 'function'
    ) {
      this.component.onAttributeChanged(name, oldValue, newValue)
    }
  }

  /**
   * 开始响应式渲染
   */
  protected startReactiveRendering(): void {
    if (this.renderer) {
      this.renderer.stop()
    }

    this.renderer = new ReactiveRenderer(this.shadow, () => {
      return this.render()
    })

    this.renderer.start()
  }

  /**
   * 停止响应式渲染
   */
  protected stopReactiveRendering(): void {
    if (this.renderer) {
      this.renderer.stop()
      this.renderer = null
    }
  }

  /**
   * 创建组件实例
   * 子类需要实现此方法
   */
  protected abstract createComponent(): Component

  /**
   * 渲染方法
   * 子类可以重写此方法来自定义渲染逻辑
   */
  protected render(): JSXNode {
    if (this.component) {
      return this.component.render()
    }
    return null
  }

  /**
   * 获取属性值
   * @param name 属性名
   * @returns 属性值
   */
  protected getAttribute(name: string): string | null {
    return this.getAttribute(name)
  }

  /**
   * 设置属性值
   * @param name 属性名
   * @param value 属性值
   */
  protected setAttribute(name: string, value: string): void {
    this.setAttribute(name, value)
  }

  /**
   * 移除属性
   * @param name 属性名
   */
  protected removeAttribute(name: string): void {
    this.removeAttribute(name)
  }

  /**
   * 获取布尔属性
   * @param name 属性名
   * @returns 是否设置
   */
  protected hasAttribute(name: string): boolean {
    return this.hasAttribute(name)
  }

  /**
   * 设置布尔属性
   * @param name 属性名
   * @param value 是否设置
   */
  protected toggleAttribute(name: string, value?: boolean): void {
    this.toggleAttribute(name, value)
  }

  /**
   * 分发自定义事件
   * @param name 事件名
   * @param detail 事件详情
   * @param options 事件选项
   */
  protected dispatchCustomEvent(
    name: string,
    detail?: any,
    options?: CustomEventInit
  ): void {
    const event = new CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail,
      ...options,
    })
    this.dispatchEvent(event)
  }

  /**
   * 获取 Shadow DOM 根元素
   */
  protected get shadowRoot(): ShadowRoot {
    return this.shadow
  }
}

/**
 * 轻量级 Web Components 基类
 * 不使用 Shadow DOM，直接渲染到 Light DOM
 */
export abstract class AlienLightElement extends HTMLElement {
  protected component: Component | null = null
  protected renderer: ReactiveRenderer | null = null
  protected effects: (() => void)[] = []

  constructor() {
    super()

    // 初始化组件
    this.component = this.createComponent()
  }

  /**
   * 元素连接到 DOM 时调用
   */
  connectedCallback(): void {
    if (this.component) {
      this.component.mount(this)
    }

    // 开始响应式渲染
    this.startReactiveRendering()
  }

  /**
   * 元素从 DOM 断开时调用
   */
  disconnectedCallback(): void {
    // 停止响应式渲染
    this.stopReactiveRendering()

    if (this.component) {
      this.component.destroy()
      this.component = null
    }
  }

  /**
   * 属性变化时调用
   */
  attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    // 通知组件属性变化
    if (
      this.component &&
      typeof this.component.onAttributeChanged === 'function'
    ) {
      this.component.onAttributeChanged(name, oldValue, newValue)
    }
  }

  /**
   * 开始响应式渲染
   */
  protected startReactiveRendering(): void {
    if (this.renderer) {
      this.renderer.stop()
    }

    this.renderer = new ReactiveRenderer(this, () => {
      return this.render()
    })

    this.renderer.start()
  }

  /**
   * 停止响应式渲染
   */
  protected stopReactiveRendering(): void {
    if (this.renderer) {
      this.renderer.stop()
      this.renderer = null
    }
  }

  /**
   * 创建组件实例
   * 子类需要实现此方法
   */
  protected abstract createComponent(): Component

  /**
   * 渲染方法
   * 子类可以重写此方法来自定义渲染逻辑
   */
  protected render(): JSXNode {
    if (this.component) {
      return this.component.render()
    }
    return null
  }

  /**
   * 分发自定义事件
   * @param name 事件名
   * @param detail 事件详情
   * @param options 事件选项
   */
  protected dispatchCustomEvent(
    name: string,
    detail?: any,
    options?: CustomEventInit
  ): void {
    const event = new CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail,
      ...options,
    })
    this.dispatchEvent(event)
  }
}
