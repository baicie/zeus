import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transformSync } from '../src/api'

const FIXTURE_ROOT = join(__dirname, 'fixtures')

function readLines(path: string): string[] {
  return readFileSync(path, 'utf-8')
    .split(/\r?\n/g)
    .map(line => line.trim())
    .filter(Boolean)
}

function eachCase(): Array<{
  name: string
  inputPath: string
  expectedPath: string
  forbiddenPath: string | null
  options: {
    generate: 'dom' | 'ssr' | 'universal'
    hydratable?: boolean
    ssrModuleName?: string
    hydrationEventStrategy?: 'delegate' | 'native'
    hydrationEventStrategies?: Record<string, 'delegate' | 'native'>
  }
}> {
  const modes = readdirSync(FIXTURE_ROOT).filter(mode => {
    const full = join(FIXTURE_ROOT, mode)
    return statSync(full).isDirectory()
  })
  const out: Array<{
    name: string
    inputPath: string
    expectedPath: string
    forbiddenPath: string | null
    options: {
      generate: 'dom' | 'ssr' | 'universal'
      hydratable?: boolean
      ssrModuleName?: string
      hydrationEventStrategy?: 'delegate' | 'native'
      hydrationEventStrategies?: Record<string, 'delegate' | 'native'>
    }
  }> = []

  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i] as 'dom' | 'ssr' | 'universal'
    const modeDir = join(FIXTURE_ROOT, mode)
    const cases = readdirSync(modeDir).filter(caseName => {
      const full = join(modeDir, caseName)
      return statSync(full).isDirectory()
    })
    for (let j = 0; j < cases.length; j++) {
      const caseName = cases[j]
      const caseDir = join(modeDir, caseName)
      const inputTSX = join(caseDir, 'input.tsx')
      const inputJSX = join(caseDir, 'input.jsx')
      const inputPath = existsSync(inputTSX) ? inputTSX : inputJSX
      const expectedPath = join(caseDir, 'expected.txt')
      const forbiddenPath = join(caseDir, 'forbidden.txt')
      const optionsPath = join(caseDir, 'options.json')
      const optionsFromFile = existsSync(optionsPath)
        ? (JSON.parse(readFileSync(optionsPath, 'utf-8')) as {
            hydratable?: boolean
            ssrModuleName?: string
            hydrationEventStrategy?: 'delegate' | 'native'
            hydrationEventStrategies?: Record<string, 'delegate' | 'native'>
          })
        : {}
      out.push({
        name: `${mode}/${caseName}`,
        inputPath,
        expectedPath,
        forbiddenPath: existsSync(forbiddenPath) ? forbiddenPath : null,
        options: Object.assign({ generate: mode }, optionsFromFile),
      })
    }
  }
  return out
}

describe('@zeus-js/compiler fixtures baseline', () => {
  const cases = eachCase()
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    it(`matches fixture: ${c.name}`, () => {
      const code = readFileSync(c.inputPath, 'utf-8')
      const { code: out } = transformSync({
        code,
        filename: `${c.name}.tsx`,
        options: c.options,
      })
      const expected = readLines(c.expectedPath)
      for (let k = 0; k < expected.length; k++) {
        expect(out).toContain(expected[k])
      }
      if (c.forbiddenPath) {
        const forbidden = readLines(c.forbiddenPath)
        for (let k = 0; k < forbidden.length; k++) {
          expect(out).not.toContain(forbidden[k])
        }
      }
    })
  }
})
