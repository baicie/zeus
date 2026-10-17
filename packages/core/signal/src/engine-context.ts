interface EngineOwnerFrame {
  engine: object
  previous: EngineOwnerFrame | undefined
}

interface EngineContext {
  tracker: object | undefined
  owner: EngineOwnerFrame | undefined
}

// Only execution context crosses package copies. Dependency graphs, scopes,
// subscribers and the engine token remain private to each physical instance.
const key = Symbol.for('@zeus-js/signal/execution-context')
const realm = globalThis as typeof globalThis & {
  [key]?: EngineContext
}
export const engineContext = (realm[key] ??= {
  tracker: undefined,
  owner: undefined,
})
export const engineToken = {}

function mismatch(operation: string): never {
  throw new Error(
    `Cannot ${operation} with a different Zeus signal engine. ` +
      'Deduplicate @zeus-js/signal for this reactive tree.',
  )
}

export function assertEngineOwner(operation: string): void {
  const owner = engineContext.owner?.engine ?? engineContext.tracker
  if (owner && owner !== engineToken) mismatch(operation)
}

export function canTrackEngine(): boolean {
  const tracker = engineContext.tracker
  if (tracker && tracker !== engineToken) mismatch('track a reactive value')
  return tracker === engineToken
}

export function createEngineOwnerFrame(): EngineOwnerFrame {
  return { engine: engineToken, previous: undefined }
}

export function enterEngineOwner(frame: EngineOwnerFrame): boolean {
  frame.previous = engineContext.owner
  engineContext.owner = frame
  return true
}

export function leaveEngineOwner(frame: EngineOwnerFrame): void {
  if (engineContext.owner === frame) engineContext.owner = frame.previous
  else {
    let current = engineContext.owner
    while (current) {
      if (current.previous === frame) {
        current.previous = frame.previous
        break
      }
      current = current.previous
    }
  }
  frame.previous = undefined
}
