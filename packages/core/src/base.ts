export class ZeusElement extends HTMLElement {
  protected _root: ShadowRoot | HTMLElement
  protected _refs: Map<string, Element> = new Map()

  constructor(shadow = false) {
    super()
    this._root = shadow ? this.attachShadow({ mode: 'open' }) : this
  }

  // 通用的 ref 处理
  protected _setRef(name: string, el: Element): void {
    this._refs.set(name, el)
  }

  // 通用的事件分发
  protected _emit(name: string, detail?: any): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      })
    )
  }

  // 通用的属性观察
  static get observedAttributes(): string[] {
    return []
  }
}
