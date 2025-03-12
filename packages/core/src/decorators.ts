export interface ComponentOptions {
  tag: string
  shadow?: boolean
}

export function Component(options: ComponentOptions) {
  return function (target: Function): Function {
    customElements.define(options.tag, target as any)
    return target
  }
}

export function Prop(options: { attribute?: string } = {}) {
  return function (target: any, propertyKey: string): void {
    const props = Reflect.getMetadata('design:props', target.constructor) || []
    props.push({
      name: propertyKey,
      attribute: options.attribute || propertyKey,
      type: Reflect.getMetadata('design:type', target, propertyKey),
    })
    Reflect.defineMetadata('design:props', props, target.constructor)

    let value: any
    Object.defineProperty(target, propertyKey, {
      get() {
        return value
      },
      set(newValue) {
        value = newValue
        this.render && this.render()
      },
    })
  }
}

export function Event(eventName?: string) {
  return function (target: any, propertyKey: string): void {
    const events =
      Reflect.getMetadata('design:events', target.constructor) || []
    events.push({
      name: propertyKey,
      eventName: eventName || propertyKey,
    })
    Reflect.defineMetadata('design:events', events, target.constructor)
  }
}

export function Method() {
  return function (target: any, propertyKey: string): void {
    const methods =
      Reflect.getMetadata('design:methods', target.constructor) || []
    methods.push({
      name: propertyKey,
      type: Reflect.getMetadata('design:type', target, propertyKey),
    })
    Reflect.defineMetadata('design:methods', methods, target.constructor)
  }
}
