# @zeus-js/compiler-wasm

The Zeus Rust compiler built for `wasm32-unknown-unknown`, for browsers,
Workers and other hosts without native Node.js addons. It runs the same
`crates/zeus_compiler` parser, lowering and code generation as
`@zeus-js/compiler-native`, and returns the same `TransformModuleResult`.

This package is private while the playground (design kit PR-27) settles its
consumption shape.

## Use

```js
import {
  compileCompilerModule,
  createWorkerCompiler,
  loadCompiler,
  wasmURL,
} from '@zeus-js/compiler-wasm'

const module = await compileCompilerModule(fetch(wasmURL))

// In a dedicated Worker, with a timeout that terminates a runaway transform:
const compiler = createWorkerCompiler(
  new Worker(new URL('@zeus-js/compiler-wasm/worker', import.meta.url), {
    type: 'module',
  }),
  module,
  { timeout: 10_000 },
)

// Or on the current thread:
// const compiler = await loadCompiler(module)

const result = await compiler.transformModule({
  source,
  filename: 'App.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: true,
})
```

Invalid options reject with a `TypeError` carrying the same message as the
native adapter. Compiler errors are returned in `result.diagnostics`.

## Limits

- The binary has no imports and needs no WASI, threads or cross-origin
  isolation. It is about 1.5 MB raw, 450 KB gzip and 325 KB brotli; each
  instance starts with 2.2 MiB of memory.
- JSX nested more than about 1,400 levels exceeds the engine's call stack (the
  native adapter handles tens of thousands). The transform rejects with
  `[ZEUS_COMPILER_WASM_TRAP]` and the next call uses a fresh instance.

## Build and verify

```sh
pnpm test:compiler-wasm
pnpm check:compiler-wasm-browser
```

The first builds the binary and compares every result with
`@zeus-js/compiler-native` on the repository's TSX corpus; the second runs the
compiler in a module Worker in Chromium, Firefox and WebKit.
