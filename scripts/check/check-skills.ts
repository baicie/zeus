/**
 * Skills live in one place, and every tool reads them from there.
 *
 * Two facts about how skills are discovered, both of which this repository got
 * wrong once already:
 *
 * 1. `.agents/skills/` is the canonical location. The `npx skills` CLI installs
 *    there and symlinks out to the agents that want their own path; Cursor,
 *    Codex, Gemini CLI and GitHub Copilot all read it directly. A skill in any
 *    vendor directory (`.claude/`, `.cursor/`) is invisible to the others.
 * 2. Claude Code does **not** read `.agents/skills/`. It reads `.claude/skills/`.
 *    So the skills must also be reachable there — as symlinks, one per skill,
 *    which is exactly what `npx skills` creates.
 *
 * Commit b1594e45 removed `.agents/` and put the skills at the root `skills/`
 * on the argument that a vendor directory hides a skill. The root directory is
 * worse: no agent reads it (OpenClaw is the single tool that does), so every
 * skill in this repository stopped being loaded by Claude Code entirely. The
 * check below exists so that cannot happen silently again.
 *
 * What is verified:
 *
 * - `skills-lock.json` names exactly the directories in `.agents/skills/`. A
 *   lock entry with no directory cannot be restored; a directory with no lock
 *   entry has no recorded source to update from.
 * - Every lock entry carries a `computedHash` and the source it came from.
 * - Every skill directory has a `SKILL.md` with `name` and `description`
 *   frontmatter, because a skill without them loads as nothing.
 * - Every skill has a `.claude/skills/<name>` symlink resolving to it, so
 *   Claude Code sees it. A stale or absolutely-pathed link is reported.
 *
 * The lock hashes are NOT recomputed here. That algorithm belongs to the
 * `skills` CLI and it has changed between major versions; re-implementing it
 * in this file would drift, and a drifted copy reports false failures on a
 * correct tree. `npx skills check` owns that comparison. What this check owns
 * is structure: is everything present, named, and reachable.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export interface Finding {
  readonly rule: string
  readonly detail: string
}

export const SKILLS_DIR = '.agents/skills'
export const CLAUDE_SKILLS_DIR = '.claude/skills'
export const LOCK_FILE = 'skills-lock.json'

export interface SkillLockEntry {
  readonly source?: string
  readonly computedHash?: string
}

/** The shape of `skills-lock.json` this check depends on. */
export function readLockSkills(
  text: string,
): { ok: true; skills: Record<string, SkillLockEntry> } | { ok: false } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false }
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { skills?: unknown }).skills !== 'object' ||
    (parsed as { skills?: unknown }).skills === null
  ) {
    return { ok: false }
  }
  return {
    ok: true,
    skills: (parsed as { skills: Record<string, SkillLockEntry> }).skills,
  }
}

/** Frontmatter fields a skill cannot load without. */
export function parseSkillFrontmatter(text: string): {
  name?: string
  description?: string
} {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return {}
  const block = match[1]!
  const field = (key: string): string | undefined => {
    // A plain `key: value` line. YAML block scalars (`>` / `|`) are accepted
    // for `description` because upstream skills use them, and the value of a
    // block scalar is the indented text below it.
    const line = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(block)
    if (!line) return undefined
    const inline = line[1]!.trim()
    if (
      inline === '>' ||
      inline === '|' ||
      inline === '>-' ||
      inline === '|-'
    ) {
      const rest = block.slice(line.index + line[0].length)
      const indented = rest
        .split(/\r?\n/)
        .filter(l => l.trim() === '' || /^\s+\S/.test(l))
        .map(l => l.trim())
        .join(' ')
        .trim()
      return indented === '' ? undefined : indented
    }
    return inline.replace(/^(['"])(.*)\1$/, '$2')
  }
  return { name: field('name'), description: field('description') }
}

/**
 * Compare the lock to the directories on disk, in both directions.
 *
 * `folders` and `lockNames` are passed in rather than read here so the negative
 * cases can be exercised without touching the real tree.
 */
export function checkSkillsAndLock(
  folders: readonly string[],
  lockNames: readonly string[],
): Finding[] {
  const findings: Finding[] = []
  const onDisk = new Set(folders)
  const inLock = new Set(lockNames)

  for (const name of lockNames) {
    if (onDisk.has(name)) continue
    findings.push({
      rule: 'skill-lock-without-directory',
      detail:
        `${LOCK_FILE} lists "${name}" but ${SKILLS_DIR}/${name}/ does not exist. ` +
        `An entry that cannot be restored is worse than no entry: it tells the ` +
        `next reader the skill is installed. Drop it or restore the directory.`,
    })
  }
  for (const name of folders) {
    if (inLock.has(name)) continue
    findings.push({
      rule: 'skill-without-lock-entry',
      detail:
        `${SKILLS_DIR}/${name}/ has no entry in ${LOCK_FILE}. Without one there ` +
        `is no recorded source to update from or to detect local edits against. ` +
        `Reinstall it with \`npx skills add\`, or delete it.`,
    })
  }
  return findings
}

/** Every lock entry must say where it came from and what it hashed to. */
export function checkLockEntries(
  skills: Record<string, SkillLockEntry>,
): Finding[] {
  const findings: Finding[] = []
  for (const [name, entry] of Object.entries(skills)) {
    if (!entry.source) {
      findings.push({
        rule: 'skill-lock-entry-without-source',
        detail: `${LOCK_FILE} entry "${name}" has no "source", so it cannot be restored or updated.`,
      })
    }
    if (!entry.computedHash) {
      findings.push({
        rule: 'skill-lock-entry-without-hash',
        detail:
          `${LOCK_FILE} entry "${name}" has no "computedHash", so local edits to it ` +
          `cannot be detected. Entries that predate lock version 2 read as empty ` +
          `until the skill is fetched once.`,
      })
    }
  }
  return findings
}

/**
 * A skill must be loadable, not merely present.
 *
 * `name` is what `/name` invokes and what the two discovery paths agree on;
 * `description` is the entire basis on which an agent decides to load the skill
 * at all. A directory missing either is a file that costs attention and
 * delivers nothing.
 */
export function checkSkillDocuments(
  readSkill: (folder: string) => string | null,
  folders: readonly string[],
): Finding[] {
  const findings: Finding[] = []
  for (const folder of folders) {
    const text = readSkill(folder)
    if (text === null) {
      findings.push({
        rule: 'skill-missing-skill-md',
        detail: `${SKILLS_DIR}/${folder}/ has no SKILL.md, so nothing loads it.`,
      })
      continue
    }
    const { name, description } = parseSkillFrontmatter(text)
    if (name === undefined) {
      findings.push({
        rule: 'skill-missing-name',
        detail: `${SKILLS_DIR}/${folder}/SKILL.md has no frontmatter "name".`,
      })
    } else if (name !== folder) {
      // The CLI treats the frontmatter name as the skill's identity, and the
      // folder name as its install target. When they disagree, one tool lists
      // the skill under a name the other does not have.
      findings.push({
        rule: 'skill-name-mismatch',
        detail:
          `${SKILLS_DIR}/${folder}/SKILL.md declares name "${name}", which does not ` +
          `match its directory. Rename the directory or the frontmatter, not just one.`,
      })
    }
    if (description === undefined) {
      findings.push({
        rule: 'skill-missing-description',
        detail:
          `${SKILLS_DIR}/${folder}/SKILL.md has no frontmatter "description". ` +
          `Without it an agent has no reason to load the skill.`,
      })
    }
  }
  return findings
}

/**
 * Claude Code reads `.claude/skills/`, not `.agents/skills/`.
 *
 * The link target is checked rather than assumed: a symlink pointing outside
 * `.agents/skills/`, or one that has gone dangling because the skill was
 * renamed, loads nothing while looking present in `ls`.
 */
export function checkClaudeLinks(
  readLink: (
    name: string,
  ) => { target: string; resolvedExists: boolean } | null,
  linkNames: readonly string[],
  folders: readonly string[],
): Finding[] {
  const findings: Finding[] = []
  const expected = new Set(folders)
  const linked = new Set(linkNames)

  for (const folder of folders) {
    if (!linked.has(folder)) {
      findings.push({
        rule: 'skill-not-linked-for-claude',
        detail:
          `${SKILLS_DIR}/${folder}/ is not linked from ${CLAUDE_SKILLS_DIR}/${folder}. ` +
          `Claude Code does not read ${SKILLS_DIR}/; without the link the skill ` +
          `exists and is never loaded.`,
      })
    }
  }
  for (const name of linkNames) {
    if (expected.has(name)) continue
    findings.push({
      rule: 'claude-link-without-skill',
      detail:
        `${CLAUDE_SKILLS_DIR}/${name} links to a skill that is not in ${SKILLS_DIR}/. ` +
        `It is a dead entry in the skill list.`,
    })
  }

  for (const name of linkNames) {
    if (!expected.has(name)) continue
    const link = readLink(name)
    if (link === null) continue
    // A link created on Windows records backslashes even when the tree is read
    // on POSIX, and `path.sep` is only the reading platform's separator, so
    // split on both rather than on `path.sep`.
    const normalized = link.target.replace(/\\/g, '/')
    if (!normalized.includes(`${SKILLS_DIR}/`)) {
      findings.push({
        rule: 'claude-link-targets-outside-skills',
        detail:
          `${CLAUDE_SKILLS_DIR}/${name} points at "${link.target}", which is not ` +
          `under ${SKILLS_DIR}/. The canonical copy must be the one under .agents/.`,
      })
    }
    if (!link.resolvedExists) {
      findings.push({
        rule: 'claude-link-dangling',
        detail: `${CLAUDE_SKILLS_DIR}/${name} points at "${link.target}", which does not resolve.`,
      })
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Paths that are filesystem noise rather than skill entries.
 *
 * `.DS_Store` is the one that actually shows up: Finder writes it into any
 * directory a developer browses, and it is gitignored. Reporting it as a
 * skill with no canonical directory would make this check fail on a correct
 * tree purely because someone opened the folder in Finder.
 */
const IGNORED_ENTRY = /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i

function listDirectories(relative: string): string[] {
  const absolute = path.join(root, relative)
  if (!fs.existsSync(absolute)) return []
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

/**
 * Every entry under `.claude/skills/`, symlink or not.
 *
 * A real directory counts: it is a second copy of a skill, which is the state
 * this layout exists to prevent. Filtering to symlinks here would make it
 * invisible to the check and let the duplicate pass.
 *
 * Files are kept for the same reason — a `.md` copied in place of a link is
 * still an entry that does not resolve to the canonical directory — but
 * filesystem noise is dropped so a Finder visit cannot fail the gate.
 */
function listClaudeEntries(relative: string): string[] {
  const absolute = path.join(root, relative)
  if (!fs.existsSync(absolute)) return []
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .map(entry => entry.name)
    .filter(name => !IGNORED_ENTRY.test(name))
    .sort()
}

function readSkillDocument(folder: string): string | null {
  const file = path.join(root, SKILLS_DIR, folder, 'SKILL.md')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null
}

const ROOT_SKILLS_README = `${SKILLS_DIR}/README.md`

export function runAllChecks(): Finding[] {
  const findings: Finding[] = []

  const folders = listDirectories(SKILLS_DIR)
  if (folders.length === 0) {
    findings.push({
      rule: 'skills-directory-missing',
      detail:
        `${SKILLS_DIR}/ holds no skills. If the skills moved, every agent's ` +
        `discovery path moved with them and the links under ${CLAUDE_SKILLS_DIR}/ ` +
        `are now pointing at nothing.`,
    })
    return findings
  }

  // The README is documentation, not a skill: it is excluded from the
  // directory list because `listDirectories` already skips files.
  if (!fs.existsSync(path.join(root, ROOT_SKILLS_README))) {
    findings.push({
      rule: 'skills-readme-missing',
      detail: `${ROOT_SKILLS_README} is missing; it records why the skills live here and what was removed.`,
    })
  }

  const lockPath = path.join(root, LOCK_FILE)
  const lockText = fs.existsSync(lockPath)
    ? fs.readFileSync(lockPath, 'utf-8')
    : null
  if (lockText === null) {
    findings.push({
      rule: 'skills-lock-missing',
      detail: `${LOCK_FILE} is missing. The installed skills have no recorded source or hash.`,
    })
  } else {
    const lock = readLockSkills(lockText)
    if (!lock.ok) {
      findings.push({
        rule: 'skills-lock-unreadable',
        detail: `${LOCK_FILE} is not valid JSON with a "skills" object.`,
      })
    } else {
      const names = Object.keys(lock.skills)
      findings.push(...checkSkillsAndLock(folders, names))
      findings.push(...checkLockEntries(lock.skills))
    }
  }

  findings.push(...checkSkillDocuments(readSkillDocument, folders))

  findings.push(
    ...checkClaudeLinks(
      name => {
        const absolute = path.join(root, CLAUDE_SKILLS_DIR, name)
        if (!fs.existsSync(absolute) && !isDanglingLink(absolute)) return null
        if (!fs.lstatSync(absolute).isSymbolicLink()) {
          // A real directory where a link belongs: report it as a target
          // outside the canonical tree, which it is — it is a second copy.
          return { target: '(real directory)', resolvedExists: true }
        }
        return {
          target: fs.readlinkSync(absolute),
          resolvedExists: fs.existsSync(absolute),
        }
      },
      listClaudeEntries(CLAUDE_SKILLS_DIR),
      folders,
    ),
  )

  return findings
}

function isDanglingLink(absolute: string): boolean {
  try {
    return fs.lstatSync(absolute).isSymbolicLink()
  } catch {
    return false
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const findings = runAllChecks()
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`[${finding.rule}] ${finding.detail}`)
    }
    console.error(`\ncheck-skills failed: ${findings.length} finding(s)`)
    process.exit(1)
  }
  console.log('check-skills passed.')
}
