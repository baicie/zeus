#!/usr/bin/env node

import { runCreateZeus } from './cli'

runCreateZeus().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
