export const PROJECT_SNAPSHOT_VERSION = 2 as const

export type ProjectLanguage = 'css' | 'json' | 'ts' | 'tsx'
export type ProjectFrameworkTarget = 'native' | 'webc'

export interface ProjectFile {
  readonly path: string
  readonly content: string
  readonly language: ProjectLanguage
}

export interface ProjectDependency {
  readonly name: string
  readonly version: string
}

export interface ProjectOptions {
  readonly delegateEvents: boolean
  readonly sourceMap: boolean
  readonly sandboxTimeoutMs: number
}

export interface ProjectSnapshot {
  readonly schemaVersion: typeof PROJECT_SNAPSHOT_VERSION
  readonly entryPath: string
  readonly files: readonly ProjectFile[]
  readonly frameworkTarget: ProjectFrameworkTarget
  readonly compilerVersion: string
  readonly dependencies: readonly ProjectDependency[]
  readonly options: ProjectOptions
}

export interface ProjectLimits {
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxProjectBytes: number
  readonly maxDependencies: number
  readonly maxSandboxTimeoutMs: number
}

export interface ProjectIssue {
  readonly code: string
  readonly message: string
  readonly path?: string
}

export const DEFAULT_PROJECT_LIMITS: ProjectLimits = {
  maxFiles: 32,
  maxFileBytes: 128 * 1024,
  maxProjectBytes: 512 * 1024,
  maxDependencies: 32,
  maxSandboxTimeoutMs: 10_000,
}

export class PlaygroundProjectError extends Error {
  readonly issues: readonly ProjectIssue[]

  constructor(issues: readonly ProjectIssue[]) {
    super(issues.map(issue => issue.message).join('\n'))
    this.name = 'PlaygroundProjectError'
    this.issues = issues
  }
}

const encoder = new TextEncoder()
const LANGUAGES: readonly ProjectLanguage[] = ['css', 'json', 'ts', 'tsx']

export function parseProjectSnapshot(
  input: unknown,
  overrides: Partial<ProjectLimits> = {},
): ProjectSnapshot {
  const limits = normalizeLimits({ ...DEFAULT_PROJECT_LIMITS, ...overrides })
  const issues: ProjectIssue[] = []
  if (!isRecord(input)) {
    throw new PlaygroundProjectError([
      {
        code: 'ZEUS_PLAYGROUND_PROJECT_SHAPE',
        message: 'Project snapshot must be an object.',
      },
    ])
  }
  if (input.schemaVersion !== PROJECT_SNAPSHOT_VERSION) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_VERSION',
      message: `Project snapshot schemaVersion must be ${PROJECT_SNAPSHOT_VERSION}.`,
    })
  }
  if (typeof input.entryPath !== 'string') {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_ENTRY',
      message: 'Project entryPath must be a string.',
    })
  }
  if (!Array.isArray(input.files)) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_FILES',
      message: 'Project files must be an array.',
    })
    throw new PlaygroundProjectError(issues)
  }
  if (input.files.length > limits.maxFiles) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_FILE_COUNT',
      message: `Project has ${input.files.length} files; the limit is ${limits.maxFiles}.`,
    })
  }

  const files: ProjectFile[] = []
  const names = new Set<string>()
  let totalBytes = 0
  for (const [index, value] of input.files.entries()) {
    if (!isRecord(value)) {
      issues.push(issueForFile(index, 'File entry must be an object.'))
      continue
    }
    const filePath = validatePath(value.path, index, issues)
    if (!filePath) continue
    if (names.has(filePath)) {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_DUPLICATE',
        message: `Project path "${filePath}" is declared more than once.`,
        path: filePath,
      })
      continue
    }
    names.add(filePath)
    if (typeof value.content !== 'string') {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_CONTENT',
        message: `Project file "${filePath}" content must be a string.`,
        path: filePath,
      })
      continue
    }
    const inferred = inferLanguage(filePath)
    if (!inferred) {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_LANGUAGE',
        message: `Project file "${filePath}" must use .ts, .tsx, .css, or .json.`,
        path: filePath,
      })
      continue
    }
    if (value.language !== undefined && value.language !== inferred) {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_LANGUAGE',
        message: `Project file "${filePath}" language must be ${inferred}.`,
        path: filePath,
      })
      continue
    }
    const bytes = encoder.encode(value.content).byteLength
    if (bytes > limits.maxFileBytes) {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_FILE_SIZE',
        message: `Project file "${filePath}" exceeds ${limits.maxFileBytes} bytes.`,
        path: filePath,
      })
    }
    totalBytes += bytes
    files.push(
      Object.freeze({
        path: filePath,
        content: value.content,
        language: inferred,
      }),
    )
  }

  if (totalBytes > limits.maxProjectBytes) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_SIZE',
      message: `Project content exceeds ${limits.maxProjectBytes} bytes.`,
    })
  }
  const entryPath =
    typeof input.entryPath === 'string' ? input.entryPath : undefined
  if (entryPath) {
    const normalizedEntry = validatePath(entryPath, -1, issues)
    if (!normalizedEntry) {
      // validatePath already supplied the structured issue.
    }
  }
  if (entryPath && !files.some(file => file.path === entryPath)) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_ENTRY_MISSING',
      message: `Project entry "${entryPath}" is not present in files.`,
      path: entryPath,
    })
  }
  const frameworkTarget = parseFrameworkTarget(input.frameworkTarget, issues)
  const compilerVersion = parseCompilerVersion(input.compilerVersion, issues)
  const dependencies = parseDependencies(input.dependencies, limits, issues)
  const options = parseOptions(input.options, limits, issues)
  if (issues.length > 0 || !entryPath) {
    throw new PlaygroundProjectError(issues)
  }
  return Object.freeze({
    schemaVersion: PROJECT_SNAPSHOT_VERSION,
    entryPath,
    files: Object.freeze(files),
    frameworkTarget,
    compilerVersion,
    dependencies,
    options,
  })
}

export function projectEntry(snapshot: ProjectSnapshot): ProjectFile {
  const entry = snapshot.files.find(file => file.path === snapshot.entryPath)
  if (!entry) {
    throw new PlaygroundProjectError([
      {
        code: 'ZEUS_PLAYGROUND_PROJECT_ENTRY_MISSING',
        message: `Project entry "${snapshot.entryPath}" is not present in files.`,
        path: snapshot.entryPath,
      },
    ])
  }
  return entry
}

function normalizeLimits(limits: ProjectLimits): ProjectLimits {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`Playground project limit ${name} must be positive`)
    }
  }
  return limits
}

function parseFrameworkTarget(
  value: unknown,
  issues: ProjectIssue[],
): ProjectFrameworkTarget {
  if (value === undefined) return 'native'
  if (value === 'native' || value === 'webc') return value
  issues.push({
    code: 'ZEUS_PLAYGROUND_PROJECT_FRAMEWORK',
    message: 'Project frameworkTarget must be "native" or "webc".',
  })
  return 'native'
}

function parseCompilerVersion(value: unknown, issues: ProjectIssue[]): string {
  if (value === undefined) return 'unknown'
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !/\s/.test(value)
  ) {
    return value
  }
  issues.push({
    code: 'ZEUS_PLAYGROUND_PROJECT_COMPILER_VERSION',
    message: 'Project compilerVersion must be a non-empty token.',
  })
  return 'unknown'
}

function parseDependencies(
  value: unknown,
  limits: ProjectLimits,
  issues: ProjectIssue[],
): readonly ProjectDependency[] {
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value)) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_DEPENDENCIES',
      message: 'Project dependencies must be an array.',
    })
    return Object.freeze([])
  }
  if (value.length > limits.maxDependencies) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_DEPENDENCY_COUNT',
      message: `Project has ${value.length} dependencies; the limit is ${limits.maxDependencies}.`,
    })
  }

  const dependencies: ProjectDependency[] = []
  const names = new Set<string>()
  for (const [index, dependency] of value.entries()) {
    if (!isRecord(dependency)) {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_DEPENDENCY',
        message: `dependencies[${index}] must be an object.`,
      })
      continue
    }
    const name = dependency.name
    const version = dependency.version
    if (
      typeof name !== 'string' ||
      !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)
    ) {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_DEPENDENCY_NAME',
        message: `dependencies[${index}].name must be an npm package name.`,
      })
      continue
    }
    if (names.has(name)) {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_DEPENDENCY_DUPLICATE',
        message: `Project dependency "${name}" is declared more than once.`,
      })
      continue
    }
    if (
      typeof version !== 'string' ||
      version.length === 0 ||
      version.length > 128
    ) {
      issues.push({
        code: 'ZEUS_PLAYGROUND_PROJECT_DEPENDENCY_VERSION',
        message: `Project dependency "${name}" must have a version.`,
      })
      continue
    }
    names.add(name)
    dependencies.push(Object.freeze({ name, version }))
  }
  return Object.freeze(dependencies)
}

function parseOptions(
  value: unknown,
  limits: ProjectLimits,
  issues: ProjectIssue[],
): ProjectOptions {
  if (value === undefined) {
    return Object.freeze({
      delegateEvents: true,
      sourceMap: true,
      sandboxTimeoutMs: 3_000,
    })
  }
  if (!isRecord(value)) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_OPTIONS',
      message: 'Project options must be an object.',
    })
    return Object.freeze({
      delegateEvents: true,
      sourceMap: true,
      sandboxTimeoutMs: 3_000,
    })
  }

  const delegateEvents = value.delegateEvents ?? true
  const sourceMap = value.sourceMap ?? true
  const rawSandboxTimeoutMs = value.sandboxTimeoutMs ?? 3_000
  const sandboxTimeoutMs =
    typeof rawSandboxTimeoutMs === 'number' ? rawSandboxTimeoutMs : 3_000
  if (typeof delegateEvents !== 'boolean') {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_OPTIONS',
      message: 'Project options.delegateEvents must be boolean.',
    })
  }
  if (typeof sourceMap !== 'boolean') {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_OPTIONS',
      message: 'Project options.sourceMap must be boolean.',
    })
  }
  if (
    !Number.isSafeInteger(sandboxTimeoutMs) ||
    sandboxTimeoutMs < 250 ||
    sandboxTimeoutMs > limits.maxSandboxTimeoutMs
  ) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_OPTIONS',
      message: `Project options.sandboxTimeoutMs must be an integer from 250 to ${limits.maxSandboxTimeoutMs}.`,
    })
  }

  return Object.freeze({
    delegateEvents: delegateEvents === true,
    sourceMap: sourceMap === true,
    sandboxTimeoutMs: sandboxTimeoutMs,
  })
}

function validatePath(
  value: unknown,
  index: number,
  issues: ProjectIssue[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(issueForFile(index, 'File path must be a non-empty string.'))
    return undefined
  }
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    /^[A-Za-z]:/.test(value)
  ) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_PATH',
      message: `Project path "${value}" must be a relative POSIX path.`,
      path: value,
    })
    return undefined
  }
  const segments = value.split('/')
  if (
    segments.some(
      segment => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_PATH',
      message: `Project path "${value}" contains an unsafe segment.`,
      path: value,
    })
    return undefined
  }
  if (segments.includes('node_modules')) {
    issues.push({
      code: 'ZEUS_PLAYGROUND_PROJECT_PATH',
      message: `Project path "${value}" cannot enter node_modules.`,
      path: value,
    })
    return undefined
  }
  return value
}

function inferLanguage(filePath: string): ProjectLanguage | undefined {
  for (const language of LANGUAGES) {
    if (filePath.endsWith(`.${language}`)) return language
  }
  return undefined
}

function issueForFile(index: number, message: string): ProjectIssue {
  return {
    code: 'ZEUS_PLAYGROUND_PROJECT_FILE',
    message: `files[${index}]: ${message}`,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
