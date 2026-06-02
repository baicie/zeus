import fs from 'node:fs/promises'
import path from 'node:path'

export interface ZeusUiConfig {
  style: string
  framework: 'react' | 'vue'
  typescript: boolean
  tailwind: boolean
  aliases: {
    components: string
    ui: string
    lib: string
    styles: string
  }
}

export const CONFIG_FILE = 'components.json'

export function createDefaultConfig(framework: 'react' | 'vue'): ZeusUiConfig {
  return {
    style: 'default',
    framework,
    typescript: true,
    tailwind: true,
    aliases: {
      components: '@/components',
      ui: '@/components/ui',
      lib: '@/lib',
      styles: '@/styles',
    },
  }
}

export async function readConfig(
  cwd = process.cwd(),
): Promise<ZeusUiConfig | null> {
  const file = path.join(cwd, CONFIG_FILE)

  try {
    const source = await fs.readFile(file, 'utf-8')
    return JSON.parse(source) as ZeusUiConfig
  } catch {
    return null
  }
}

export async function writeConfig(
  config: ZeusUiConfig,
  cwd = process.cwd(),
): Promise<void> {
  await fs.writeFile(
    path.join(cwd, CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}
