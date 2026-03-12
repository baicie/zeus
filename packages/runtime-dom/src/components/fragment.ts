/**
 * Fragment Component
 *
 * Renders multiple children without a wrapper element
 *
 * Usage:
 *   <Fragment>
 *     <div>Item 1</div>
 *     <div>Item 2</div>
 *   </Fragment>
 *
 * Or shorthand:
 *   <>
 *     <div>Item 1</div>
 *     <div>Item 2</div>
 *   </>
 */

export interface FragmentProps {
  children?: any
}

export function Fragment(props: FragmentProps): Node[] {
  if (props.children == null) {
    return []
  }
  if (Array.isArray(props.children)) {
    return props.children.filter(
      (child: any) => child != null && typeof child !== 'boolean',
    )
  }
  return [props.children]
}
