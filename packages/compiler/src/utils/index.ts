// Utils barrel — low-level string, JSX, and HTML helpers.
export * from './attribute'
export * from './constant'
export * from './html'
export * from './jsx'
export * from './logger'
export * from './metadata'

// Runtime barrel — import/template/event registration (previously imports.ts).
// Re-exported here so existing `from '../utils'` imports keep working.
export {
  registerImportMethod,
  appendImportMethods,
  getRendererConfig,
  getProgramScopeData,
  registerTemplate,
  findTemplateByString,
  appendEvents,
  escapeStringForTemplate,
  isMathMLTemplate,
  DEFAULT_RENDERER_MODULE,
} from '../runtime'
