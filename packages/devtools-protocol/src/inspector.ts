// DevTools protocol for Zeus

export interface DevToolsConnection {
  connect(): void
  disconnect(): void
  send(message: DevToolsMessage): void
  onMessage(handler: (message: DevToolsMessage) => void): void
}

export interface DevToolsMessage {
  type: string
  payload?: any
  timestamp: number
}

// Inspector protocol
export interface InspectorTarget {
  id: string
  name: string
  type: 'component' | 'signal' | 'effect' | 'owner'
}

export interface InspectorNode {
  id: string
  type: 'component' | 'signal' | 'effect' | 'owner' | 'element'
  name: string
  parent?: string
  children?: string[]
  data?: Record<string, any>
}

export interface InspectorSnapshot {
  nodes: InspectorNode[]
  timestamp: number
}

export interface InspectorHighlight {
  selector: string
  bounds?: DOMRect
}

export function createInspector(): Inspector {
  return new Inspector()
}

export class Inspector {
  private targets: Map<string, InspectorTarget> = new Map()
  private nodes: Map<string, InspectorNode> = new Map()
  private connected: boolean = false

  connect(): void {
    this.connected = true
  }

  disconnect(): void {
    this.connected = false
  }

  registerTarget(target: InspectorTarget): string {
    this.targets.set(target.id, target)
    return target.id
  }

  unregisterTarget(id: string): void {
    this.targets.delete(id)
  }

  getTarget(id: string): InspectorTarget | undefined {
    return this.targets.get(id)
  }

  getAllTargets(): InspectorTarget[] {
    return Array.from(this.targets.values())
  }

  addNode(node: InspectorNode): void {
    this.nodes.set(node.id, node)
  }

  removeNode(id: string): void {
    this.nodes.delete(id)
  }

  getNode(id: string): InspectorNode | undefined {
    return this.nodes.get(id)
  }

  getSnapshot(): InspectorSnapshot {
    return {
      nodes: Array.from(this.nodes.values()),
      timestamp: Date.now(),
    }
  }

  highlight(selector: string): void {
    // Placeholder for highlight implementation
  }

  clearHighlight(): void {
    // Placeholder for clear highlight implementation
  }
}
