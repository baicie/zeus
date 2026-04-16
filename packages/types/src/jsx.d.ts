// JSX type definitions for Zeus

declare global {
  namespace JSX {
    type Child = Node | string | number | boolean | null | undefined | Child[]

    interface ElementChildrenAttribute {
      children: Child
    }

    interface IntrinsicElements {
      [elemName: string]: any
    }

    interface Element {
      // Zeus elements compile to DOM nodes
    }

    interface ElementClass {
      // Component class (if class components were supported)
    }

    interface ElementAttributesProperty {
      // Properties used for attributes
    }

    interface ElementChildrenAttribute {
      children: {}
    }

    interface TextAttributes {
      // Text node attributes
    }

    interface HTMLAttributes<T> {
      // Standard HTML attributes
      class?: string
      id?: string
      style?: string | Record<string, string | null>
      onClick?: (event: MouseEvent) => void
      onInput?: (event: Event) => void
      onChange?: (event: Event) => void
      onSubmit?: (event: Event) => void
      onFocus?: (event: FocusEvent) => void
      onBlur?: (event: FocusEvent) => void
      onKeyDown?: (event: KeyboardEvent) => void
      onKeyUp?: (event: KeyboardEvent) => void
      onMouseEnter?: (event: MouseEvent) => void
      onMouseLeave?: (event: MouseEvent) => void
      [key: string]: any
    }

    interface HTMLAttributes<T> {
      // Extended HTML attributes
      'data-*'?: string
      'aria-*'?: string
    }

    interface SVGAttributes<T> {
      // SVG-specific attributes
      viewBox?: string
      xmlns?: string
      d?: string
      fill?: string
      stroke?: string
      strokeWidth?: number | string
      [key: string]: any
    }

    // Intrinsic elements
    interface IntrinsicIntrinsicElements {
      div: HTMLAttributes<HTMLDivElement>
      span: HTMLAttributes<HTMLSpanElement>
      button: HTMLAttributes<HTMLButtonElement>
      input: HTMLAttributes<HTMLInputElement>
      textarea: HTMLAttributes<HTMLTextAreaElement>
      select: HTMLAttributes<HTMLSelectElement>
      option: HTMLAttributes<HTMLOptionElement>
      a: HTMLAttributes<HTMLAnchorElement>
      img: HTMLAttributes<HTMLImageElement>
      ul: HTMLAttributes<HTMLUListElement>
      ol: HTMLAttributes<HTMLOListElement>
      li: HTMLAttributes<HTMLLIElement>
      p: HTMLAttributes<HTMLParagraphElement>
      h1: HTMLAttributes<HTMLHeadingElement>
      h2: HTMLAttributes<HTMLHeadingElement>
      h3: HTMLAttributes<HTMLHeadingElement>
      h4: HTMLAttributes<HTMLHeadingElement>
      h5: HTMLAttributes<HTMLHeadingElement>
      h6: HTMLAttributes<HTMLHeadingElement>
      header: HTMLAttributes<HTMLElement>
      footer: HTMLAttributes<HTMLElement>
      main: HTMLAttributes<HTMLElement>
      section: HTMLAttributes<HTMLElement>
      article: HTMLAttributes<HTMLElement>
      aside: HTMLAttributes<HTMLElement>
      nav: HTMLAttributes<HTMLElement>
      form: HTMLAttributes<HTMLFormElement>
      label: HTMLAttributes<HTMLLabelElement>
      table: HTMLAttributes<HTMLTableElement>
      tbody: HTMLAttributes<HTMLTableSectionElement>
      thead: HTMLAttributes<HTMLTableSectionElement>
      tr: HTMLAttributes<HTMLTableRowElement>
      td: HTMLAttributes<HTMLTableCellElement>
      th: HTMLAttributes<HTMLTableCellElement>
      iframe: HTMLAttributes<HTMLIFrameElement>
      canvas: HTMLAttributes<HTMLCanvasElement>
      svg: SVGAttributes<SVGSVGElement>
      path: SVGAttributes<SVGPathElement>
      circle: SVGAttributes<SVGCircleElement>
      rect: SVGAttributes<SVGRectElement>
    }
  }
}

export {}
