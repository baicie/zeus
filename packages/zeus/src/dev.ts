export function initDev(): void {
  if (__BROWSER__) {
    if (!__ESM_BUNDLER__) {
      console.info(
        `You are running a development build of Zeus.\n` +
          `Make sure to use the production build (*.prod.js) when deploying for production.`,
      )
    }

    // initCustomFormatter()
  }
}
