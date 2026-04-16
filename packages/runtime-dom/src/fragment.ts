export interface Region {
  start: Comment
  end: Comment
}

export function createRegion(): Region {
  return {
    start: document.createComment(''),
    end: document.createComment(''),
  }
}

export function clearRegion(region: Region): void {
  let node = region.start.nextSibling
  while (node && node !== region.end) {
    const next = node.nextSibling
    node.parentNode?.removeChild(node)
    node = next
  }
}

export function insertBeforeEnd(region: Region, node: Node): void {
  region.end.parentNode!.insertBefore(node, region.end)
}

export function getRegionEndMarker(region: Region): Comment {
  return region.end
}

export function wrapWithRegion(node: Node): Region {
  const region = createRegion()
  const parent = node.parentNode!
  parent.insertBefore(region.start, node)
  parent.insertBefore(region.end, node.nextSibling)
  return region
}
