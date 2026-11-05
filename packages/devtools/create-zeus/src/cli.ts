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
    value: 'application-ts',
    label: 'Application TypeScript',
    hint: 'Zeus app + Vite + Vitest smoke test',
  },
  {
    value: 'admin-ts',
    label: 'Admin TypeScript',
    hint: 'Signed-in admin shell with users, roles and audit views',
  },
  {
    value: 'component-library-ts',
    label: 'Component Library TypeScript',
    hint: 'Web Components + React/Vue outputs',
  },
  {
    value: 'web-component-ts',
    label: 'Web Component TypeScript',
    hint: 'Zeus defineElement + Host + Slot',
  },
  {
    value: 'webc-consumer-ts',
    label: 'WebC Consumer TypeScript',
    hint: 'Consume an installed Web Components package',
  },
] as const

export async function runCreateZeus(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      force: { type: 'boolean', default: false },
      name: { type: 'string' },
      template: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.info(
      [
        'Usage: create-zeus [--name <project>] [--template <template>] [--force]',
        '',
        'Templates:',
        ...templates.map(template => `  ${template.value}  ${template.hint}`),
      ].join('\n'),
    )
    return
  }
  const templateValues = new Set<string>(
    templates.map(template => template.value),
  )
  if (values.template && !templateValues.has(values.template)) {
    throw new Error(
      `Template "${values.template}" not found. Available: ${[...templateValues].join(', ')}`,
    )
  }
  intro(pc.cyan('Create Zeus App'))
  let projectName = values.name?.trim()
  if (values.name !== undefined && !projectName) {
    throw new Error('Project name must not be empty.')
  }
  if (!projectName) {
    const answer = await text({
      message: 'Project name',
      placeholder: 'my-zeus-app',
      defaultValue: 'my-zeus-app',
      validate(value) {
        if (!value?.trim()) return 'Project name is required.'
      },
    })
    if (isCancel(answer)) {
      cancel('Operation cancelled.')
      return
    }
    projectName = String(answer)
  }

  const root = resolve(process.cwd(), projectName)
  const target = inspectScaffoldTarget(root)
  if (target.nonEmpty && !values.force) {
    throw new Error(
      `Directory "${root}" is not empty. Run again with --force to explicitly replace its contents.`,
    )
  }

  let template = values.template
  if (!template) {
    const answer = await select({
      message: 'Select a template',
      options: [...templates] as {
        value: string
        label: string
        hint?: string
      }[],
    })
    if (isCancel(answer)) {
      cancel('Operation cancelled.')
      return
    }
    template = String(answer)
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
    template,
    force: values.force,
  })
  outro(
    `Done.\n\nNext steps:\n\n  ${pc.green('$')} cd ${projectName}\n  ${pc.green('$')} pnpm install\n  ${pc.green('$')} pnpm dev`,
  )
}
