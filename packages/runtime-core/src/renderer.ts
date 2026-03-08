export function render(component: () => Node, container: Element): void {
  container.innerHTML = ''
  const node = component()
  container.appendChild(node)
}
