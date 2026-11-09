import type {
  PlaygroundFile,
  PlaygroundProduct,
  PersistedWorkspace,
} from './model'

const DB_NAME = 'zeus-playground'
const DB_VERSION = 1
const STORE = 'workspaces'
// v2 starts from the light/English defaults. v1 stored an implicit `dark`
// for every visitor, so reusing that key would keep returning users on the old
// theme even though they never chose it.
export const SETTINGS_KEY = 'zeus-playground.settings.v2'
const MAX_PROJECT_BYTES = 1_500_000
const MAX_FILES = 32
const TABS = [
  'preview',
  'output',
  'console',
  'problems',
  'inspector',
  'devtools',
] as const
export type PersistedTab = (typeof TABS)[number]

const memoryFallback = new Map<string, PersistedWorkspace>()

export type ThemeName = 'light' | 'dark'

export interface PlaygroundSettings {
  readonly theme: ThemeName
  readonly locale: 'en' | 'zh'
  readonly fontSize: number
  readonly autoRun: boolean
  readonly splitPercent: number
  readonly activeTab: PersistedTab
}

export const DEFAULT_SETTINGS: PlaygroundSettings = {
  theme: 'light',
  locale: 'en',
  fontSize: 14,
  autoRun: true,
  splitPercent: 50,
  activeTab: 'preview',
}

function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 180 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    !path.split('/').includes('..')
  )
}

export function validatePersistedWorkspace(
  value: unknown,
): value is PersistedWorkspace {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PersistedWorkspace>
  if (
    candidate.schemaVersion !== 1 ||
    (candidate.product !== 'native-lab' &&
      candidate.product !== 'webc-studio') ||
    !Array.isArray(candidate.files) ||
    candidate.files.length === 0 ||
    candidate.files.length > MAX_FILES ||
    typeof candidate.activePath !== 'string'
  ) {
    return false
  }
  let bytes = 0
  const paths = new Set<string>()
  for (const file of candidate.files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      typeof file.content !== 'string' ||
      !safePath(file.path) ||
      paths.has(file.path)
    ) {
      return false
    }
    paths.add(file.path)
    bytes += file.path.length + file.content.length
    if (bytes > MAX_PROJECT_BYTES) return false
  }
  return paths.has(candidate.activePath)
}

export function readSettings(): PlaygroundSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const value = JSON.parse(raw) as Partial<PlaygroundSettings>
    return {
      theme: value.theme === 'dark' ? 'dark' : 'light',
      locale: value.locale === 'zh' ? 'zh' : 'en',
      fontSize:
        typeof value.fontSize === 'number' &&
        value.fontSize >= 12 &&
        value.fontSize <= 20
          ? Math.round(value.fontSize)
          : DEFAULT_SETTINGS.fontSize,
      autoRun: typeof value.autoRun === 'boolean' ? value.autoRun : true,
      splitPercent:
        typeof value.splitPercent === 'number' &&
        value.splitPercent >= 30 &&
        value.splitPercent <= 70
          ? Math.round(value.splitPercent)
          : DEFAULT_SETTINGS.splitPercent,
      activeTab:
        typeof value.activeTab === 'string' &&
        (TABS as readonly string[]).includes(value.activeTab)
          ? (value.activeTab as PersistedTab)
          : DEFAULT_SETTINGS.activeTab,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function writeSettings(settings: PlaygroundSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Private browsing and quota failures degrade to memory-only settings.
  }
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'product' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(undefined)
      request.onblocked = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export async function loadWorkspace(
  product: PlaygroundProduct,
): Promise<PersistedWorkspace | undefined> {
  const database = await openDatabase()
  if (!database) return memoryFallback.get(product)
  return new Promise(resolve => {
    try {
      const transaction = database.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(product)
      request.onsuccess = () => {
        const value = request.result as unknown
        database.close()
        if (validatePersistedWorkspace(value)) resolve(value)
        else resolve(memoryFallback.get(product))
      }
      request.onerror = () => {
        database.close()
        resolve(memoryFallback.get(product))
      }
    } catch {
      database.close()
      resolve(memoryFallback.get(product))
    }
  })
}

export async function saveWorkspace(
  workspace: Omit<PersistedWorkspace, 'schemaVersion' | 'savedAt'>,
): Promise<boolean> {
  const value: PersistedWorkspace = {
    ...workspace,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
  }
  if (!validatePersistedWorkspace(value)) return false
  memoryFallback.set(workspace.product, value)
  const database = await openDatabase()
  if (!database) return false
  return new Promise(resolve => {
    try {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(value)
      transaction.oncomplete = () => {
        database.close()
        resolve(true)
      }
      transaction.onerror = () => {
        database.close()
        resolve(false)
      }
      transaction.onabort = () => {
        database.close()
        resolve(false)
      }
    } catch {
      database.close()
      resolve(false)
    }
  })
}

export async function clearWorkspace(
  product: PlaygroundProduct,
): Promise<void> {
  memoryFallback.delete(product)
  const database = await openDatabase()
  if (!database) return
  try {
    const transaction = database.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).delete(product)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => database.close()
    transaction.onabort = () => database.close()
  } catch {
    database.close()
  }
}

export function workspaceBytes(files: readonly PlaygroundFile[]): number {
  return files.reduce(
    (total, file) => total + file.path.length + file.content.length,
    0,
  )
}
