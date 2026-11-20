/**
 * A machine-readable record of what a canary run actually did.
 *
 * When the canary fails, the workflow uploads `temp/release/canary-readiness.json`
 * and `temp/packed-consumers/report.json` with `if: always()`. If the run died
 * before either file was written, both uploads report "No files were found" —
 * and the artifact carries no evidence at all, so the failure is diagnosed from
 * log text.
 *
 * This recorder writes as it goes, so a failure at any stage leaves a file that
 * names the stage, the command, and the exit code. It records only what
 * happened: a stage that never ran is `not_run`, never `pass`.
 */
import fs from 'node:fs'
import path from 'node:path'

export type StageStatus = 'pass' | 'fail' | 'not_run' | 'skipped'

export interface StageRecord {
  readonly name: string
  readonly status: StageStatus
  /** The command that ran, when one did. */
  readonly command?: string
  /** Exit code, when the stage ran a command. */
  readonly exitCode?: number | null
  /** First line of stderr / the thrown message. */
  readonly detail?: string
  readonly durationMs?: number
}

export interface CanaryStageReport {
  readonly schema: 'zeus.canary-stages/v1'
  readonly startedAt: string
  readonly finishedAt?: string
  readonly version?: string
  readonly stagingTag?: string
  readonly outcome: 'running' | 'passed' | 'failed'
  readonly failedStage?: string
  readonly stages: readonly StageRecord[]
}

/**
 * Collects stage results and flushes them after each one.
 *
 * Flushing per stage is the point: a crash, a timeout, or a cancelled job still
 * leaves the stages that completed on disk.
 */
export class StageRecorder {
  private readonly stages: StageRecord[] = []
  private readonly startedAt: string
  private version?: string
  private stagingTag?: string
  private outcome: CanaryStageReport['outcome'] = 'running'
  private failedStage?: string

  constructor(private readonly outputPath: string) {
    this.startedAt = new Date().toISOString()
    this.flush()
  }

  /** Records the canary version and staging tag once known. */
  setVersions(version: string, stagingTag: string): void {
    this.version = version
    this.stagingTag = stagingTag
    this.flush()
  }

  /** Runs `body`, recording it as a stage whatever happens. */
  run(name: string, command: string, body: () => void): void {
    const startedAt = Date.now()
    try {
      body()
      this.stages.push({
        name,
        status: 'pass',
        command,
        exitCode: 0,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      this.failedStage = name
      this.stages.push({
        name,
        status: 'fail',
        command,
        exitCode: exitCodeOf(error),
        detail: firstLine(error),
        durationMs: Date.now() - startedAt,
      })
      this.outcome = 'failed'
      this.finish()
      throw error
    }
    this.flush()
  }

  /** Records a stage without running it. */
  record(stage: StageRecord): void {
    this.stages.push(stage)
    if (stage.status === 'fail') {
      this.failedStage = stage.name
      this.outcome = 'failed'
    }
    this.flush()
  }

  /** Marks every stage not yet recorded as `not_run`. */
  finish(): void {
    if (this.outcome === 'running') this.outcome = 'passed'
    this.flush()
  }

  private flush(): void {
    const report: CanaryStageReport = {
      schema: 'zeus.canary-stages/v1',
      startedAt: this.startedAt,
      ...(this.outcome === 'running'
        ? {}
        : { finishedAt: new Date().toISOString() }),
      ...(this.version ? { version: this.version } : {}),
      ...(this.stagingTag ? { stagingTag: this.stagingTag } : {}),
      outcome: this.outcome,
      ...(this.failedStage ? { failedStage: this.failedStage } : {}),
      stages: this.stages,
    }
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true })
    fs.writeFileSync(this.outputPath, `${JSON.stringify(report, null, 2)}\n`)
  }
}

function exitCodeOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number') return status
  }
  return null
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n')[0]
}
