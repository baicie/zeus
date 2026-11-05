import { execFileSync } from 'node:child_process'

import config from '../release.config'
import {
  getReleasePrecheckCommands,
  parseReleaseChannel,
} from './release-channels'

const channel = parseReleaseChannel(process.argv.slice(2))
const commands = getReleasePrecheckCommands(
  channel,
  config.precheck?.commands ?? [],
)

console.log(`[release] precheck channel: ${channel}`)
for (const command of commands) {
  const [bin, ...args] = command
  if (!bin) throw new Error('Release precheck command is empty')
  console.log(`\n> ${bin} ${args.join(' ')}\n`)
  execFileSync(bin, args, {
    cwd: (config as { cwd?: string }).cwd ?? process.cwd(),
    env: { ...process.env, ZEUS_RELEASE_CHANNEL: channel },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}
console.log(`\nRelease precheck (${channel}) passed.`)
