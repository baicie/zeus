#!/usr/bin/env node

import { Command } from 'commander'

import { addCommand } from './commands/add'
import { initCommand } from './commands/init'
import { listCommand } from './commands/list'

const program = new Command()

program
  .name('zeus-ui')
  .description('Add customizable Zeus UI components to your project.')
  .version('0.0.1')

program
  .command('init')
  .description('Initialize Zeus UI config.')
  .option('-f, --framework <framework>', 'react or vue')
  .option('-y, --yes', 'skip prompts')
  .action(initCommand)

program
  .command('add')
  .description('Add a component.')
  .argument('[components...]', 'component names')
  .option('-f, --framework <framework>', 'react or vue')
  .option('-y, --yes', 'skip prompts')
  .action(addCommand)

program
  .command('list')
  .description('List available components.')
  .option('-f, --framework <framework>', 'react or vue')
  .action(listCommand)

program.parse()
