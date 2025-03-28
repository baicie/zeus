export namespace JSX {
  export interface Element {
    type: any
    props: any
    key: any
  }

  export interface IntrinsicElements {
    [elemName: string]: any
  }

  export type ElementType = keyof IntrinsicElements | ((props: any) => Element)

  export interface ElementAttributesProperty {
    props: {}
  }

  export interface ElementChildrenAttribute {
    children: {}
  }

  export type ArrayElement = Element[] | Element[][]

  export type Child = Element | string | number | boolean | null | undefined
  export type Children = Child | Child[]
}
