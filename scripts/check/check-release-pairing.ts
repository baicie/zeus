/**
 * Fails when a pairing record is malformed.
 *
 * Runs in CI so a record is correct before a tag exists, rather than the
 * release discovering it at tag time.
 */
import path from 'node:path'
import process from 'node:process'

import { validatePairingDirectory } from '../release/release-pairing'

const root = path.resolve(import.meta.dirname, '../..')
const directory = path.join(root, 'release-pairing')
const problems = validatePairingDirectory(directory)

if (problems.length === 0) {
  console.log('release pairing records passed')
} else {
  for (const problem of problems) {
    console.error(`${problem.file}: ${problem.message}`)
  }
  console.error(`\n${problems.length} pairing problem(s).`)
  process.exitCode = 1
}
