declare module 'picomatch' {
  function picomatch(
    patterns: string | string[],
    options?: Record<string, unknown>,
  ): (str: string) => boolean
  export = picomatch
}
