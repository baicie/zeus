import path from 'node:path'

import { getRegistryItem, listRegistryItems } from '@zeus-ui/registry'
import kleur from 'kleur'
import prompts from 'prompts'

import { readConfig, createDefaultConfig } from '../core/config'
import { detectFramework } from '../core/detect'
import { writeFileSafe } from '../core/fs'
import { detectPackageManager, installDependencies } from '../core/install'
import { transformTemplate } from '../core/template'

export async function addCommand(
  components: string[],
  options: {
    framework?: 'react' | 'vue'
    yes?: boolean
  },
) {
  let config = await readConfig()

  if (!config) {
    const framework = options.framework ?? (await detectFramework()) ?? 'react'
    config = createDefaultConfig(framework)
  }

  let names = components

  if (!names.length && !options.yes) {
    const available = listRegistryItems(config.framework)

    const response = await prompts({
      type: 'multiselect',
      name: 'components',
      message: 'Select components to add',
      choices: available.map(item => ({
        title: item.name,
        value: item.name,
        description: item.description,
      })),
    })

    names = response.components ?? []
  }

  if (!names.length) {
    console.log(kleur.yellow('No components selected.'))
    return
  }

  const items = names.map(name => {
    const item = getRegistryItem(config.framework, name)

    if (!item) {
      throw new Error(`Unknown component "${name}" for ${config.framework}.`)
    }

    return item
  })

  const deps = new Set<string>()

  for (const item of items) {
    for (const dep of item.dependencies ?? []) {
      deps.add(dep.version ? `${dep.name}@${dep.version}` : dep.name)
    }
  }

  if (deps.size > 0) {
    console.log(
      kleur.dim(
        `Installing dependencies via ${await detectPackageManager()}...`,
      ),
    )
    await installDependencies(Array.from(deps))
  }

  for (const item of items) {
    for (const file of item.files) {
      const target = path.resolve(process.cwd(), file.path)
      const content = transformTemplate(file.content, config)

      const status = await writeFileSafe(target, content, {
        overwrite: false,
      })

      console.log(`${statusLabel(status)} ${file.path}`)
    }
  }
}

function statusLabel(status: 'created' | 'skipped' | 'overwritten'): string {
  switch (status) {
    case 'created':
      return kleur.green('create')
    case 'overwritten':
      return kleur.yellow('overwrite')
    case 'skipped':
      return kleur.dim('skip')
  }
}
