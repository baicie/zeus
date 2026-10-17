const Fragment = Symbol.for('zeus.fragment')

function jsx() {
  throw new Error(
    '[ZEUS_JSX_COMPILATION_REQUIRED] Compile JSX with @zeus-js/vite-plugin or @zeus-js/compiler before execution.',
  )
}

export { Fragment, jsx, jsx as jsxs, jsx as jsxDEV }
