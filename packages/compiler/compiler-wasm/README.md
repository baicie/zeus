# @zeus-js/compiler-wasm

The Zeus Rust compiler built for `wasm32-unknown-unknown`, for browsers,
Workers and other hosts without native Node.js addons. It runs the same
`crates/zeus_compiler` parser, lowering and code generation as
`@zeus-js/compiler-native`, and returns the same `TransformModuleResult`.

It is published on its own version line rather than with the fixed release
group, because its version tracks the Rust compiler build rather than the
runtime. It used to be `private: true` and ship inside the Playground's own
build; that stopped working when the Playground moved to `zeus-ecosystem`,
which installs from npm.

## Content Security Policy

The compiler is a WebAssembly module, so a page that loads it needs
`'wasm-unsafe-eval'` in `script-src`. Without it the module fails to
instantiate at runtime — there is no build-time signal:

```
Content-Security-Policy: script-src 'self' 'wasm-unsafe-eval';
```

`worker-src` must also allow the worker entry if you use
`createWorkerCompiler`.

## Not for consumers to run

The published manifest keeps `build:wasm` and `test:wasm` because they are how
this package is built in its own repository. Their inputs (`scripts/build.mjs`,
`__tests__/`) are not in the tarball, so both fail in an installed copy. That is
intentional: the `.wasm` ships prebuilt, and nothing here needs to be rebuilt by
a consumer.

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
- The shared lexical preflight rejects pathological input before the parser
  sees it. WebAssembly uses a smaller budget than native because the engine call
  stack is not growable: the limit is 506 equivalent JSX levels (native: 8,192),
  and deeper input returns the `ZEUS_INPUT_TOO_DEEP` diagnostic without trapping.
  The budget is calibrated per construct at 35% of the measured engine crash
  depth, so arrow, member, template, type-argument and JSX chains are covered.
- If the engine still traps, the loader reports `[ZEUS_COMPILER_WASM_TRAP]` and
  the next call uses a fresh instance.

## Build and verify

```sh
pnpm test:compiler-wasm
pnpm check:compiler-wasm-browser
```

The first builds the binary and compares every result with
`@zeus-js/compiler-native` on the repository's TSX corpus; the second runs the
compiler in a module Worker in Chromium, Firefox and WebKit.
