// Minimal render function for direct DOM components (no VNode)
// The compiler generates direct DOM operations; this is only for programmatic use.
export function render(component: () => Node, container: Element): void {
  container.innerHTML = ''
  const node = component()
  container.appendChild(node)
}
