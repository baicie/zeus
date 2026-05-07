declare module '@babel/plugin-syntax-jsx' {
  function jsx(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manipulateOptions(opts: any, parserOpts: { plugins: string[] }): void
  }
  const module: {
    default: typeof jsx
  }
  export default module
}
