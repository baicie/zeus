/// <reference types="vite/client" />

declare module '@zeus-js/bundler-plugin/vite' {
  import type { Plugin } from 'vite'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zeusPlugin: (options?: any) => Plugin
  export default zeusPlugin
}
