#!/usr/bin/env node

import path from 'node:path'

import { cnTemplate, themeCssTemplate } from '@zeus-ui/registry'
import kleur from 'kleur'
import prompts from 'prompts'

import { createDefaultConfig, writeConfig } from '../core/config'
import { detectFramework } from '../core/detect'
import { writeFileSafe } from '../core/fs'

export async function initCommand(options: {
  framework?: 'react' | 'vue'
  yes?: boolean
}) {
  let framework = options.framework ?? (await detectFramework())

  if (!framework && !options.yes) {
    const response = await prompts({
      type: 'select',
      name: 'framework',
      message: 'Which framework are you using?',
      choices: [
        {
          title: 'React',
          value: 'react',
        },
        {
          title: 'Vue',
          value: 'vue',
        },
      ],
    })

    framework = response.framework
  }

  framework ??= 'react'

  const config = createDefaultConfig(framework)

  await writeConfig(config)

  await writeFileSafe(
    path.resolve(process.cwd(), 'src/lib/utils.ts'),
    cnTemplate,
    {
      overwrite: false,
    },
  )

  await writeFileSafe(
    path.resolve(process.cwd(), 'src/styles/zeus-theme.css'),
    themeCssTemplate,
    {
      overwrite: false,
    },
  )

  console.log(kleur.green('Zeus UI initialized.'))
  console.log(kleur.dim('Created components.json'))
  console.log(kleur.dim('Created src/lib/utils.ts'))
  console.log(kleur.dim('Created src/styles/zeus-theme.css'))
  console.log()
  console.log(
    kleur.yellow(
      'Remember to import src/styles/zeus-theme.css in your app entry.',
    ),
  )
}
