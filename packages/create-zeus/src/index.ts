#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { cancel, intro, isCancel, outro, select, text } from '@clack/prompts'
import pc from 'picocolors'

import { scaffold } from './scaffold'

const templates = [
  {
    value: 'basic-ts',
    label: 'Basic TypeScript',
    hint: 'Zeus + Vite + TSX',
  },
  {
    value: 'web-component-ts',
    label: 'Web Component TypeScript',
    hint: 'Zeus defineElement + Host + Slot',
  },
] as const

type TemplateName = (typeof templates)[number]['value']

async function main() {
  intro(pc.cyan('Create Zeus App'))

  const projectName = await text({
    message: 'Project name',
    placeholder: 'my-zeus-app',
    defaultValue: 'my-zeus-app',
    validate(value) {
      if (!value.trim()) return 'Project name is required.'
    },
  })

  if (isCancel(projectName)) {
    cancel('Operation cancelled.')
    process.exit(0)
  }

  const template = await select({
    message: 'Select a template',
    options: [...templates] as {
      value: string
      label: string
      hint?: string
    }[],
  })

  if (isCancel(template)) {
    cancel('Operation cancelled.')
    process.exit(0)
  }

  const root = resolve(process.cwd(), projectName)

  if (existsSync(root)) {
    const action = await select({
      message: `Directory "${projectName}" already exists.`,
      options: [
        { value: 'overwrite', label: 'Overwrite' },
        { value: 'cancel', label: 'Cancel' },
      ],
    })

    if (isCancel(action) || action === 'cancel') {
      cancel('Operation cancelled.')
      process.exit(0)
    }
  }

  await scaffold({
    root,
    projectName,
    template: template as TemplateName,
  })

  outro(
    `Done.${pc.reset('')}

Next steps:

  ${pc.green('$')} cd ${projectName}
  ${pc.green('$')} pnpm install
  ${pc.green('$')} pnpm dev`,
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
