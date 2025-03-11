declare namespace JSX {
  interface Element {
    type: string | Function
    props: any
    children: any[]
  }

  interface IntrinsicElements {
    [elemName: string]: any
  }

  interface ElementChildrenAttribute {
    children: {}
  }

  interface ElementAttributesProperty {
    props: {}
  }
}

export {}
