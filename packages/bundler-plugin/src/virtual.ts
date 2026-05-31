const RESOLVED_VIRTUAL_PREFIX = '\0'

export class VirtualModuleRegistry {
  private readonly modules = new Map<string, string>()

  set(id: string, code: string): void {
    this.modules.set(normalizeVirtualId(id), code)
  }

  has(id: string): boolean {
    return this.modules.has(normalizeVirtualId(id))
  }

  get(id: string): string | undefined {
    return this.modules.get(normalizeVirtualId(id))
  }

  clear(): void {
    this.modules.clear()
  }

  resolve(id: string): string | null {
    const normalized = normalizeVirtualId(id)

    if (!this.modules.has(normalized)) {
      return null
    }

    return RESOLVED_VIRTUAL_PREFIX + normalized
  }

  load(id: string): string | null {
    if (!id.startsWith(RESOLVED_VIRTUAL_PREFIX)) {
      return null
    }

    const normalized = id.slice(RESOLVED_VIRTUAL_PREFIX.length)

    return this.modules.get(normalized) ?? null
  }
}

export function normalizeVirtualId(id: string): string {
  return id.startsWith('\0') ? id.slice(1) : id
}
