/**
 * Runs one instrumented module in a child process.
 *
 * ## Why a child process
 *
 * The thing under test is a defence against code that never yields. If that
 * defence is broken — which is exactly what these tests exist to detect — then
 * running the module in-process blocks the event loop, and no `setTimeout`,
 * `Promise.race` or `AbortSignal` inside that process can interrupt it. A
 * protection that fails would hang the whole suite instead of failing it,
 * which is the one outcome a CI gate must never have.
 *
 * So each case runs in its own process, and the parent kills it on a deadline.
 * The parent's timer is on a different event loop, so it always fires. A kill
 * is reported as `harness-timeout`, which the tests treat as a failure of the
 * protection — never as a pass.
 *
 * Usage (from the test): `runInChildProcess(code)`.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'

export interface ChildRunResult {
  readonly outcome: 'ok' | 'budget' | 'threw' | 'harness-timeout'
  readonly error?: string
}

const BUDGET_MARKER = 'ZEUS_PLAYGROUND_LOOP_BUDGET'

/**
 * The body executed in the child. It strips the module's ESM export syntax,
 * runs it, and reports one JSON line on stdout.
 *
 * Export stripping is deliberately crude: the preview compiler has already
 * rewritten imports into runtime lookups, so the only ESM left is the export
 * list. The tests assert on behaviour, never on an exported binding.
 */
const CHILD_SOURCE = `
import { readFileSync } from 'node:fs'

const code = readFileSync(process.argv[2], 'utf8')
const marker = process.argv[3]

const body = code
  .replace(/^\\s*export\\s+default\\s+/gm, 'var __default = ')
  .replace(/^\\s*export\\s+(?=(?:async\\s+)?(?:function|class|const|let|var)\\b)/gm, '')
  .replace(/^\\s*export\\s*\\{[^}]*\\}\\s*;?\\s*$/gm, '')

const write = value => process.stdout.write(JSON.stringify(value) + '\\n')

const finish = (outcome, error) => {
  write({ outcome, ...(error ? { error } : {}) })
  // Exit explicitly: a module that left a timer or promise pending would
  // otherwise keep the process alive and the parent would have to kill a
  // process whose real work already finished.
  process.exit(0)
}

try {
  const runner = new Function('exports', '"use strict";\\n' + body + '\\nreturn exports\\n')
  const result = runner({})
  if (result && typeof result.then === 'function') {
    result
      .then(() => finish('ok'))
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error)
        finish(message.includes(marker) ? 'budget' : 'threw', message)
      })
  } else {
    finish('ok')
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  finish(message.includes(marker) ? 'budget' : 'threw', message)
}
`

/**
 * Writes the module and the child script, spawns the child, and kills it after
 * `timeoutMs`. The kill is the safety net, not the assertion.
 */
export async function runInChildProcess(
  code: string,
  options: { readonly timeoutMs?: number } = {},
): Promise<ChildRunResult> {
  const timeoutMs = options.timeoutMs ?? 5_000
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const directory = await mkdtemp(path.join(tmpdir(), 'zeus-loop-budget-'))
  const modulePath = path.join(directory, 'module.mjs')
  const runnerPath = path.join(directory, 'runner.mjs')

  try {
    await writeFile(modulePath, code, 'utf8')
    await writeFile(runnerPath, CHILD_SOURCE, 'utf8')

    return await new Promise<ChildRunResult>(resolve => {
      const child = spawn(
        process.execPath,
        ['--no-warnings', runnerPath, modulePath, BUDGET_MARKER],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stdout = ''
      let stderr = ''
      let settled = false
      const settle = (result: ChildRunResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        child.kill('SIGKILL')
        resolve(result)
      }

      const timer = setTimeout(
        () => settle({ outcome: 'harness-timeout' }),
        timeoutMs,
      )

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        stdout += chunk
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => {
        stderr += chunk
      })
      child.on('error', error =>
        settle({ outcome: 'threw', error: error.message }),
      )
      child.on('exit', code_ => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        const line = stdout.trim().split('\n').filter(Boolean).pop()
        if (line) {
          try {
            const parsed = JSON.parse(line) as ChildRunResult
            resolve(parsed)
            return
          } catch {
            // fall through to the exit-code interpretation
          }
        }
        resolve({
          outcome: code_ === 0 ? 'ok' : 'threw',
          error: stderr.trim().slice(0, 400) || `exit ${code_}`,
        })
      })
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
