import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import {
  cancel,
  confirm,
  intro,
  isCancel,
  outro,
  select,
  text,
} from '@clack/prompts'
import pc from 'picocolors'

import { scaffold } from './scaffold'
import { inspectScaffoldTarget } from './target'

const templates = [
  { value: 'basic-ts', label: 'Basic TypeScript', hint: 'Zeus + Vite + TSX' },
  {
    value: 'web-component-ts',
    label: 'Web Component TypeScript',
    hint: 'Zeus defineElement + Host + Slot',
  },
] as const

export async function runCreateZeus(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const { values } = parseArgs({
    args: [...argv],
    options: { force: { type: 'boolean', default: false } },
  })
  intro(pc.cyan('Create Zeus App'))
  const projectName = await text({
    message: 'Project name',
    placeholder: 'my-zeus-app',
    defaultValue: 'my-zeus-app',
    validate(value) {
      if (!value?.trim()) return 'Project name is required.'
    },
  })
  if (isCancel(projectName)) {
    cancel('Operation cancelled.')
    return
  }

  const root = resolve(process.cwd(), projectName)
  const target = inspectScaffoldTarget(root)
  if (target.nonEmpty && !values.force) {
    throw new Error(
      `Directory "${root}" is not empty. Run again with --force to explicitly replace its contents.`,
    )
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
    return
  }

  const preparedTarget = inspectScaffoldTarget(root)
  if (preparedTarget.nonEmpty && !values.force) {
    throw new Error(
      `Directory "${root}" is not empty. Run again with --force to explicitly replace its contents.`,
    )
  }
  if (preparedTarget.nonEmpty) {
    const overwrite = await confirm({
      message: `DANGER: --force permanently deletes ALL contents of "${root}". This cannot be undone. Continue?`,
      initialValue: false,
    })
    if (isCancel(overwrite) || !overwrite) {
      cancel('Operation cancelled. Existing files were kept.')
      return
    }
  }

  await scaffold({
    root,
    projectName,
    template: String(template),
    force: values.force,
  })
  outro(
    `Done.\n\nNext steps:\n\n  ${pc.green('$')} cd ${projectName}\n  ${pc.green('$')} pnpm install\n  ${pc.green('$')} pnpm dev`,
  )
}
