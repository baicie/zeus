import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: ['src/index'],
  externals: ['vite', '@zeus-js/compiler-core', '@zeus-js/compiler-dom'],
  clean: true,
  declaration: 'compatible',
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
})
