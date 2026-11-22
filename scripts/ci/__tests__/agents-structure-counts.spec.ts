/**
 * AGENTS.md's structural counts must match the source (R22 TASK 58).
 *
 * The file tells a contributor how large each compiler file is and how many
 * functions live in the two strongly-connected units, and it uses those counts
 * to argue that the units must not be split ("42 functions, all recursive").
 * A stale count does not just read as sloppy — it makes the argument weak in a
 * way nobody notices, because there is nothing to compare against.
 *
 * Two had drifted: `emit.rs` said 42 functions and had 47, the `Lowerer` said
 * 21 `lower_*` methods and had 35. Line counts are written with `~` and are
 * checked loosely; counts of things are exact and are checked exactly.
 *
 * The line figures are checked within a tolerance because they are explicitly
 * approximate and move with every edit. The counts are not.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

/** Line count of a table row's file, from the `~N` in the same row. */
function citedLines(file: string): number | undefined {
  const row = agents
    .split('\n')
    .find(line => line.includes(`\`${file}\``) && line.includes('|'))
  const match = row?.match(/\|\s*~(\d+)\s*\|/)
  return match ? Number(match[1]) : undefined
}

describe('AGENTS.md structure table', () => {
  const rows: Array<[string, number]> = [
    ['lower/frontend.rs', 10],
    ['lower/mod.rs', 15],
    ['codegen/dom/emit.rs', 10],
    ['codegen/dom/model.rs', 10],
    ['codegen/dom/names.rs', 10],
    ['codegen/mod.rs', 10],
  ]

  it.each(rows)(
    'describes %s within 10%% of its real size',
    (file, tolerance) => {
      const cited = citedLines(file)
      expect(
        cited,
        `no line count was found for ${file} in AGENTS.md`,
      ).toBeTypeOf('number')
      const actual = read(`crates/zeus_compiler/src/${file}`).split('\n').length
      const drift = Math.abs(actual - cited!) / actual
      expect(
        drift,
        `${file} is ${actual} lines but AGENTS.md says ~${cited}`,
      ).toBeLessThan(tolerance / 100)
    },
  )
})

describe('AGENTS.md function counts', () => {
  it('counts the DOM emit functions exactly', () => {
    const cited = Number(
      agents.match(/DOM 发射族，(\d+) 个函数/)?.[1] ?? Number.NaN,
    )
    expect(Number.isNaN(cited), 'the emit-function count was not found').toBe(
      false,
    )
    const source = read('crates/zeus_compiler/src/codegen/dom/emit.rs')
    // Every function definition, at any indentation. The file's definitions are
    // not all column-zero: 44 of the 47 are indented by one space, and a regex
    // anchored on `^fn` finds only three. `\w` is avoided too — this ran on
    // macOS, where grep does not support it.
    const actual = [
      ...source.matchAll(/^\s*(?:pub(?:\(crate\))? )?fn [A-Za-z_]/gm),
    ].length
    expect(
      actual,
      `emit.rs defines ${actual} functions but AGENTS.md says ${cited}`,
    ).toBe(cited)
  })

  it('counts the Lowerer methods exactly', () => {
    const cited = Number(agents.match(/`Lowerer` 的 (\d+) 个 `lower_\*`/)?.[1])
    expect(Number.isNaN(cited), 'the lower_* count was not found').toBe(false)
    const source = read('crates/zeus_compiler/src/lower/mod.rs')
    const actual = [...source.matchAll(/^ {4}fn lower_[A-Za-z_]/gm)].length
    expect(
      actual,
      `lower/mod.rs defines ${actual} lower_* methods but AGENTS.md says ${cited}`,
    ).toBe(cited)
  })
})
