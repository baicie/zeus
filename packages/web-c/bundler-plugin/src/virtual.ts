import path from 'node:path'

const RESOLVED_VIRTUAL_PREFIX = '\0'

export class VirtualModuleRegistry {
  private readonly modules = new Map<string, string>()
  private readonly virtualDirs = new Map<string, string>()
  private readonly virtualFileNames = new Map<string, string>()
  private readonly idsByFileName = new Map<string, string>()

  set(id: string, code: string, fileName?: string): void {
    const normalized = normalizeVirtualId(id)
    this.modules.set(normalized, code)
    if (fileName) {
      const dir = path.posix.dirname(fileName)
      this.virtualDirs.set(normalized, dir)
      const normalizedFileName = normalizePath(fileName)
      this.virtualFileNames.set(normalized, normalizedFileName)
      this.idsByFileName.set(normalizedFileName, normalized)
    }
  }

  has(id: string): boolean {
    return this.modules.has(normalizeVirtualId(id))
  }

  get(id: string): string | undefined {
    return this.modules.get(normalizeVirtualId(id))
  }

  clear(): void {
    this.modules.clear()
    this.virtualDirs.clear()
    this.virtualFileNames.clear()
    this.idsByFileName.clear()
  }

  resolve(id: string, importer?: string): string | null {
    const normalized = normalizeVirtualId(id)

    if (this.modules.has(normalized)) {
      return RESOLVED_VIRTUAL_PREFIX + normalized
    }

    if (importer && (id.startsWith('.') || id.startsWith('..'))) {
      const importerNormalized = normalizeVirtualId(importer)
      const importerDir = this.virtualDirs.get(importerNormalized)

      if (importerDir) {
        const resolved = normalizePath(path.posix.join(importerDir, id))
        const resolvedVirtualId = this.idsByFileName.get(resolved)
        if (resolvedVirtualId) {
          return RESOLVED_VIRTUAL_PREFIX + resolvedVirtualId
        }

        const importingPrefix = this.getIdPrefix(importerNormalized)

        if (importingPrefix !== null) {
          const baseName = path.posix.basename(resolved, '.js')

          // Try exact match first
          for (const [key] of this.modules.entries()) {
            if (key === importingPrefix + baseName) {
              return RESOLVED_VIRTUAL_PREFIX + key
            }
          }

          // Try stripping common prefixes (z-, wc-) when looking up virtual IDs
          for (const stripPrefix of ['z-', 'wc-', 'wc/', '']) {
            const candidate = stripPrefix
              ? importingPrefix + stripPrefix + baseName
              : importingPrefix + baseName
            if (this.modules.has(candidate)) {
              return RESOLVED_VIRTUAL_PREFIX + candidate
            }
          }

          // Try without any prefix stripping - use the fileName as-is
          // (useful when filename already matches tag format, like z-button.js)
          const fullName = baseName
          for (const [key] of this.modules.entries()) {
            if (key.endsWith(':' + fullName)) {
              return RESOLVED_VIRTUAL_PREFIX + key
            }
          }
        }
      }
    }

    return null
  }

  private getIdPrefix(virtualId: string): string | null {
    const lastColon = virtualId.lastIndexOf(':')
    if (lastColon <= 0) return null
    return virtualId.slice(0, lastColon + 1)
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

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}
