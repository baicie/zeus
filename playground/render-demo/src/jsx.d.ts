declare namespace JSX {
  type Element = Node | Node[] | string | number | null | undefined

  interface IntrinsicElements {
    [tagName: string]: {
      [prop: string]: unknown
      children?: unknown
    }
  }
}
