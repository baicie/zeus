import { VERSION } from '@zeus/shared'

export interface CliOptions {
  cwd?: string
  config?: string
}

export async function run(options: CliOptions = {}) {
  console.log(`Zeus CLI v${VERSION}`)

  // TODO: 实现 CLI 逻辑
  return {
    cwd: options.cwd || process.cwd(),
    config: options.config,
  }
}
