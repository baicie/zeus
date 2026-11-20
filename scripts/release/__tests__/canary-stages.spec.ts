/**
 * The stage recorder exists for one failure mode: a canary that dies before
 * writing any report, leaving `if: always()` uploads with nothing to upload.
 *
 * These tests check that a file is on disk at every point a run could stop,
 * and that a stage which did not run is never recorded as passing.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { StageRecorder, type CanaryStageReport } from '../canary-stages'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function outputPath(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-stages-'))
  temporaryRoots.push(root)
  return path.join(root, 'temp/release/canary-stages.json')
}

function read(file: string): CanaryStageReport {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as CanaryStageReport
}

describe('StageRecorder', () => {
  it('writes a file before any stage runs', () => {
    // If the process is killed during the first stage, this is what an upload
    // finds — a report saying the run started, not an empty directory.
    const file = outputPath()
    const recorder = new StageRecorder(file)
    expect(fs.existsSync(file)).toBe(true)
    expect(read(file).outcome).toBe('running')
    expect(read(file).stages).toEqual([])
    recorder.finish()
  })

  it('records the version and staging tag once known', () => {
    const file = outputPath()
    const recorder = new StageRecorder(file)
    recorder.setVersions('0.0.0-canary.1', 'staging-tag')
    const report = read(file)
    expect(report.version).toBe('0.0.0-canary.1')
    expect(report.stagingTag).toBe('staging-tag')
    recorder.finish()
  })

  it('flushes after every passing stage', () => {
    const file = outputPath()
    const recorder = new StageRecorder(file)
    recorder.run('one', 'cmd one', () => {})
    expect(read(file).stages.map(s => s.name)).toEqual(['one'])
    recorder.run('two', 'cmd two', () => {})
    expect(read(file).stages.map(s => s.name)).toEqual(['one', 'two'])
    recorder.finish()
    expect(read(file).outcome).toBe('passed')
  })

  it('records the failing stage with its exit code before rethrowing', () => {
    const file = outputPath()
    const recorder = new StageRecorder(file)
    recorder.run('ok', 'cmd', () => {})

    const failure = Object.assign(new Error('pnpm exited'), { status: 1 })
    expect(() =>
      recorder.run('boom', 'pnpm release:precheck', () => {
        throw failure
      }),
    ).toThrow('pnpm exited')

    const report = read(file)
    expect(report.outcome).toBe('failed')
    expect(report.failedStage).toBe('boom')
    expect(report.stages).toEqual([
      expect.objectContaining({ name: 'ok', status: 'pass' }),
      expect.objectContaining({
        name: 'boom',
        status: 'fail',
        command: 'pnpm release:precheck',
        exitCode: 1,
        detail: 'pnpm exited',
      }),
    ])
  })

  it('never reports a stage that did not run as passing', () => {
    // The workflow uploads on `always()`; a stage after the failure must be
    // absent, not present-and-passing.
    const file = outputPath()
    const recorder = new StageRecorder(file)
    try {
      recorder.run('first', 'cmd', () => {
        throw new Error('stop')
      })
    } catch {
      // expected
    }
    const names = read(file).stages.map(stage => stage.name)
    expect(names).toEqual(['first'])
    expect(names).not.toContain('second')
  })

  it('records an explicit not_run stage as such', () => {
    const file = outputPath()
    const recorder = new StageRecorder(file)
    recorder.record({ name: 'publish-staging', status: 'not_run' })
    const report = read(file)
    expect(report.stages[0]).toEqual({
      name: 'publish-staging',
      status: 'not_run',
    })
    expect(report.outcome).toBe('running')
    recorder.finish()
  })

  it('finishes as passed when no stage failed', () => {
    const file = outputPath()
    const recorder = new StageRecorder(file)
    recorder.run('only', 'cmd', () => {})
    recorder.finish()
    const report = read(file)
    expect(report.outcome).toBe('passed')
    expect(report.finishedAt).toBeDefined()
  })
})
