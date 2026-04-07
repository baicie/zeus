declare module '@babel/plugin-syntax-jsx' {
  import type { PluginObj } from '@babel/core'
  const plugin: () => PluginObj
  export default plugin
}
