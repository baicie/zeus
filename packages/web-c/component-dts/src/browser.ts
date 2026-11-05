/**
 * Browser-safe declaration generation. This entry omits plugin/file-system
 * helpers and only exposes pure AST-to-TypeScript formatting.
 */
export { generateComponentWCDts, generateWCIndexDts } from './generateWcDts'
export { generateWCJsxDts } from './generateJsxDts'
export { generateReactDts } from './generateReactDts'
export { generateVueDts, generateVueGlobalDts } from './generateVueDts'
export { formatPropType, formatEventType, formatDetailType } from './formatType'
export type { ComponentDtsOptions, DtsOutputFile } from './types'
