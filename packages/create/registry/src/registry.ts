import { reactButton } from './react/button'
import { reactCheckbox } from './react/checkbox'
import { reactDialog } from './react/dialog'
import { reactIcon } from './react/icon'
import { reactSwitch } from './react/switch'
import { reactTabs } from './react/tabs'
import { vueButton } from './vue/button'
import { vueCheckbox } from './vue/checkbox'
import { vueDialog } from './vue/dialog'
import { vueIcon } from './vue/icon'
import { vueSwitch } from './vue/switch'
import { vueTabs, vueTabList, vueTab, vueTabPanel } from './vue/tabs'

import type { RegistryFramework, RegistryItem } from './schema'

const items: RegistryItem[] = [
  reactButton,
  reactSwitch,
  reactCheckbox,
  reactTabs,
  reactDialog,
  reactIcon,

  vueButton,
  vueSwitch,
  vueCheckbox,
  vueTabs,
  vueTabList,
  vueTab,
  vueTabPanel,
  vueDialog,
  vueIcon,
]

export function listRegistryItems(
  framework?: RegistryFramework,
): RegistryItem[] {
  return framework ? items.filter(item => item.framework === framework) : items
}

export function getRegistryItem(
  framework: RegistryFramework,
  name: string,
): RegistryItem | undefined {
  return items.find(item => item.framework === framework && item.name === name)
}

export { cnTemplate } from './shared/cn'
export { themeCssTemplate } from './shared/theme'
