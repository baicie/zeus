import { listRegistryItems } from '@zeus-ui/registry'

export async function listCommand(options: { framework?: 'react' | 'vue' }) {
  const items = listRegistryItems(options.framework)

  for (const item of items) {
    console.log(`${item.name}\t${item.framework}\t${item.description ?? ''}`)
  }
}
