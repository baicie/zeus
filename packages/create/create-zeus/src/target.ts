import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path'

export interface ScaffoldTarget {
  root: string
  exists: boolean
  nonEmpty: boolean
}

/** Read-only checks shared by the prompt and the final write boundary. */
export function inspectScaffoldTarget(
  input: string,
  protectedPaths: readonly string[] = [],
): ScaffoldTarget {
  const requestedRoot = resolve(input)
  if (requestedRoot === parse(requestedRoot).root) {
    throw new Error(
      `Refusing unsafe target "${requestedRoot}": filesystem root.`,
    )
  }

  // Reject links at every existing path segment, including dangling links.
  // Checking only the final segment would still follow a linked parent.
  let current = requestedRoot
  while (true) {
    const entry = statIfExists(current)
    if (entry?.isSymbolicLink()) {
      // macOS exposes these system directories through fixed aliases. Only
      // ancestor aliases are accepted; targeting the link itself is forbidden.
      const systemAlias =
        process.platform === 'darwin' &&
        current !== requestedRoot &&
        ['/var', '/tmp', '/etc'].includes(current) &&
        realpathSync(current) === `/private${current}`
      if (!systemAlias) {
        throw new Error(
          `Refusing unsafe target "${requestedRoot}": symbolic link at "${current}".`,
        )
      }
    }
    if (current === dirname(current)) break
    current = dirname(current)
  }

  const root = resolveCanonicalTarget(requestedRoot)
  if (root.split(sep).includes('.git')) {
    throw new Error(`Refusing unsafe target "${root}": Git metadata path.`)
  }
  for (const directory of [process.cwd(), homedir(), ...protectedPaths]) {
    const lexical = resolve(directory)
    const canonical = realpathSync(lexical)
    if (isSameOrAncestor(root, lexical) || isSameOrAncestor(root, canonical)) {
      throw new Error(
        `Refusing unsafe target "${root}": protected directory or ancestor.`,
      )
    }
  }
  for (const directory of protectedPaths) {
    if (isSameOrAncestor(realpathSync(directory), root)) {
      throw new Error(
        `Refusing unsafe target "${root}": inside the template installation.`,
      )
    }
  }

  const entry = statIfExists(root)
  if (!entry) return { root, exists: false, nonEmpty: false }
  if (!entry.isDirectory()) {
    throw new Error(
      `Refusing target "${root}": an existing path is not a directory.`,
    )
  }
  if (statIfExists(join(root, '.git'))) {
    throw new Error(`Refusing unsafe target "${root}": Git repository root.`)
  }

  return { root, exists: true, nonEmpty: readdirSync(root).length > 0 }
}

function resolveCanonicalTarget(root: string): string {
  let parent = root
  while (!statIfExists(parent)) parent = dirname(parent)
  return resolve(realpathSync(parent), relative(parent, root))
}

function statIfExists(
  filename: string,
): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(filename)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function isSameOrAncestor(candidate: string, directory: string): boolean {
  const suffix = relative(candidate, directory)
  return (
    suffix === '' ||
    (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`))
  )
}
