import { generateLazyManifest } from './generateLazyManifest'
import { WC_RUNTIME_ABI_IMPORT } from './generateLoader'

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export function generateLazyRegistration(
  component: ComponentRecord,
  entryFileName: string,
): string {
  return `import { bootstrapLazy, ${WC_RUNTIME_ABI_IMPORT} } from "@zeus-js/web-c-runtime";
${generateLazyManifest({
  components: [component],
  getEntryFileName: () => entryFileName,
})}
export const component = components[0];

export function defineCustomElement(options = {}) {
  bootstrapLazy([component], options);
}
`
}
