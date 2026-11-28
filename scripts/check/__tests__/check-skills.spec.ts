/**
 * Every rule in `check-skills` gets a positive case (the real tree passes) and
 * a negative case (an injected violation is reported by name).
 *
 * The failure this guard exists for already happened once: commit b1594e45
 * deleted `.agents/skills/`, moved the skills to a root-level `skills/`, and
 * nothing noticed that Claude Code had stopped loading every one of them. The
 * negative cases are the point — a check that only ever sees a clean tree
 * would have passed that commit too.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  CLAUDE_SKILLS_DIR,
  checkClaudeLinks,
  checkLockEntries,
  checkSkillDocuments,
  checkSkillsAndLock,
  parseSkillFrontmatter,
  readLockSkills,
  runAllChecks,
} from '../check-skills.ts'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

describe('the real tree satisfies the skills contract', () => {
  it('reports no findings', () => {
    expect(runAllChecks()).toEqual([])
  })
})

describe('the lock and the directory must agree, in both directions', () => {
  it('accepts a matching pair', () => {
    expect(checkSkillsAndLock(['tdd', 'vite'], ['tdd', 'vite'])).toEqual([])
  })

  it('reports a lock entry with no directory', () => {
    const findings = checkSkillsAndLock(['tdd'], ['tdd', 'triage'])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('skill-lock-without-directory')
    expect(findings[0]!.detail).toContain('triage')
  })

  it('reports a directory with no lock entry', () => {
    const findings = checkSkillsAndLock(['tdd', 'scratch'], ['tdd'])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('skill-without-lock-entry')
    expect(findings[0]!.detail).toContain('scratch')
  })
})

describe('a lock entry must be restorable', () => {
  it('accepts entries with a source and a hash', () => {
    expect(
      checkLockEntries({
        tdd: { source: 'mattpocock/skills', computedHash: 'abc' },
      }),
    ).toEqual([])
  })

  it('reports an entry with no source', () => {
    const findings = checkLockEntries({ tdd: { computedHash: 'abc' } })
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('skill-lock-entry-without-source')
  })

  it('reports an entry with no hash', () => {
    const findings = checkLockEntries({ tdd: { source: 'mattpocock/skills' } })
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('skill-lock-entry-without-hash')
  })
})

describe('an unreadable lock is reported rather than ignored', () => {
  it('rejects malformed JSON', () => {
    expect(readLockSkills('{ not json').ok).toBe(false)
  })

  it('rejects JSON without a skills object', () => {
    expect(readLockSkills('{"version":2}').ok).toBe(false)
  })

  it('accepts the documented shape', () => {
    const parsed = readLockSkills('{"version":2,"skills":{"tdd":{}}}')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(Object.keys(parsed.skills)).toEqual(['tdd'])
  })
})

describe('a skill must be loadable', () => {
  const doc = (name: string, description: string) =>
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# body\n`

  it('accepts a complete document', () => {
    expect(
      checkSkillDocuments(() => doc('tdd', 'Red-green-refactor.'), ['tdd']),
    ).toEqual([])
  })

  it('reports a missing SKILL.md', () => {
    const findings = checkSkillDocuments(() => null, ['tdd'])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('skill-missing-skill-md')
  })

  it('reports a document whose frontmatter name disagrees with its folder', () => {
    const findings = checkSkillDocuments(
      () => doc('test-driven-development', 'Red-green-refactor.'),
      ['tdd'],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('skill-name-mismatch')
    expect(findings[0]!.detail).toContain('test-driven-development')
  })

  it('reports a missing description even when the name is right', () => {
    const findings = checkSkillDocuments(
      () => '---\nname: tdd\n---\n\n# body\n',
      ['tdd'],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('skill-missing-description')
  })

  it('reads a folded description block, which upstream skills use', () => {
    const folded = [
      '---',
      'name: caveman',
      'description: >',
      '  Ultra-compressed communication mode. Cuts token usage by dropping',
      '  filler while keeping full technical accuracy.',
      '---',
      '',
      '# Caveman',
    ].join('\n')
    expect(checkSkillDocuments(() => folded, ['caveman'])).toEqual([])
  })
})

describe('frontmatter parsing accepts the shapes real skills use', () => {
  it('strips surrounding quotes', () => {
    const text = `---\nname: 'git-commit'\ndescription: "Commit."\n---\n`
    expect(parseSkillFrontmatter(text)).toEqual({
      name: 'git-commit',
      description: 'Commit.',
    })
  })

  it('returns nothing for a document with no frontmatter', () => {
    expect(parseSkillFrontmatter('# Title\n')).toEqual({})
  })
})

describe('Claude Code must be able to reach every skill', () => {
  const link = (target: string, resolvedExists = true) => ({
    target,
    resolvedExists,
  })

  it('accepts a complete set of links into the canonical directory', () => {
    const findings = checkClaudeLinks(
      () => link('../../.agents/skills/tdd'),
      ['tdd'],
      ['tdd'],
    )
    expect(findings).toEqual([])
  })

  it('reports a skill that is not linked', () => {
    const findings = checkClaudeLinks(() => null, [], ['tdd'])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('skill-not-linked-for-claude')
    expect(findings[0]!.detail).toContain('does not read')
  })

  it('reports a link whose skill is gone', () => {
    const findings = checkClaudeLinks(
      () => link('../../.agents/skills/triage'),
      ['triage'],
      [],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('claude-link-without-skill')
  })

  it('reports a dangling link', () => {
    const findings = checkClaudeLinks(
      () => link('../../.agents/skills/tdd', false),
      ['tdd'],
      ['tdd'],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('claude-link-dangling')
  })

  it('reports a link that leaves the canonical directory', () => {
    const findings = checkClaudeLinks(
      () => link('/somewhere/else/tdd'),
      ['tdd'],
      ['tdd'],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('claude-link-targets-outside-skills')
  })

  it('reports a real directory where a link belongs', () => {
    const findings = checkClaudeLinks(
      () => link('(real directory)'),
      ['tdd'],
      ['tdd'],
    )
    // Exactly one finding: the duplicate copy is reported as a target outside
    // the canonical tree, and NOT also as "not linked". A real directory must
    // reach this function at all — filtering the listing to symlinks would
    // hide it and let a second copy of every skill sit there unnoticed.
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('claude-link-targets-outside-skills')
  })

  it('normalizes Windows separators before judging the target', () => {
    const findings = checkClaudeLinks(
      () => link('..\\..\\.agents\\skills\\tdd'),
      ['tdd'],
      ['tdd'],
    )
    expect(findings).toEqual([])
  })
})

/*
 * Finder writes `.DS_Store` into any directory a developer browses, and it is
 * gitignored. The real tree must pass with one present: a check that fails
 * because someone opened the folder is a check people learn to ignore.
 */
describe('filesystem noise under .claude/skills is not a skill entry', () => {
  it('passes on the real tree with a .DS_Store present', () => {
    const file = path.join(root, CLAUDE_SKILLS_DIR, '.DS_Store')
    const existed = fs.existsSync(file)
    if (!existed) fs.writeFileSync(file, '')
    try {
      expect(runAllChecks()).toEqual([])
    } finally {
      if (!existed) fs.rmSync(file, { force: true })
    }
  })
})
