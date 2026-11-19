# @zeus-js/playground-engine

Shared project, compiler, preview-message, and export contracts for Zeus
playgrounds. The package is renderer-neutral; it does not render into its own
DOM and it never executes playground source in the host page.

```ts
import {
  compileProject,
  createPlaygroundPreview,
  exportProject,
  parseProjectSnapshot,
} from '@zeus-js/playground-engine'

const project = parseProjectSnapshot({
  schemaVersion: 2,
  entryPath: 'src/main.tsx',
  frameworkTarget: 'native',
  compilerVersion: 'wasm:0.1.1-beta.20',
  files: [{ path: 'src/main.tsx', content: source }],
})

const dom = await compileProject(project, wasmCompiler, {
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
})
const preview = await createPlaygroundPreview(dom)
const exported = await exportProject(project)
```

## Project snapshots

`ProjectSnapshot` schema version 2 contains:

- a relative POSIX entry path and an immutable file list;
- `ts`, `tsx`, `css`, and `json` files;
- the `native` or `webc` framework target;
- compiler version metadata;
- declared dependency metadata; and
- compiler and sandbox options.

Absolute paths, traversal, duplicate files, unsupported languages, oversized
files, missing entries, invalid UTF-8 byte budgets, and malformed options fail
with structured `PlaygroundProjectError` issues before compiler execution.

## Compiler graph

`compileProject` follows static imports and literal dynamic imports through the
snapshot. It compiles each reachable TypeScript module for the requested DOM or
SSR target, returns dependency-first module output, collects CSS, and preserves
each module's source map and diagnostics.

Browser preview imports are limited to the Zeus runtime allowlist. Arbitrary npm
packages and install scripts are rejected. Cycles are diagnosed because the
preview linker requires an acyclic blob-module graph.

## Preview messages

`createPlaygroundPreview` links compiled modules into a serializable payload and
adds a 1-second loop budget to each JavaScript loop. It strips TypeScript only
when loading the preview path, so the editor's initial JavaScript chunk does not
include Babel.

`PLAYGROUND_SANDBOX_CHANNEL` and `parseSandboxMessage` define the versioned
iframe protocol. Messages are capped at 2 MiB and validate session/request IDs,
module dependencies, executable export names, and runtime keys.

Accepted sandbox responses must have origin `"null"`. Hosts must also compare
`MessageEvent.source` with the exact iframe window and enforce the session ID.
The iframe should use `sandbox="allow-scripts"` without `allow-same-origin`.

`sandbox="allow-scripts"` also omits `allow-modals`, so preview code cannot open
`alert`, `confirm`, `prompt`, or `print` dialogs. That is deliberate: a shared
link must not be able to block the editor. `installPlaygroundModalGuard`
replaces those APIs inside the sandbox so each suppressed call is reported
through the Console bridge (`formatPlaygroundModalCall` builds the message) and
returns the same values the browser returns when it blocks the dialog: `false`
for `confirm` and `null` for `prompt`.

## Export

`exportProject` returns a deterministic `.tar.gz` containing:

- the original snapshot files;
- a generated auto-mount entry;
- `package.json`, `tsconfig.json`, and `vite.config.ts`; and
- a README with standalone install/build commands.

Direct dependency versions are pinned. The archive intentionally omits a
lockfile because it is generated in the browser without registry access; the
first external install writes a lockfile that the exported application should
commit.

## Host requirements

The host page is trusted. Playground source belongs in a different-origin,
opaque sandbox. Module scripts fetched by that sandbox need
`Access-Control-Allow-Origin: *` (or the exact sandbox origin). A restrictive
CSP must deny `connect-src`, workers, nested frames, forms, objects, and base URL
changes while allowing the sandbox module script and blob modules.

The reference example uses `127.0.0.1` for the host and `localhost` for the
sandbox locally. Production deployments should set a complete
`VITE_ZEUS_SANDBOX_URL` (the legacy `VITE_ZEUS_SANDBOX_ORIGIN` remains
supported for origin-only hosts). Use `resolveSandboxUrl` to preserve path,
query and fragment components, and `withSandboxSession` to add the per-frame
session query parameter without replacing a configured fragment.

The sandbox document must also be served with an HTTP response header:

```text
Content-Security-Policy: sandbox allow-scripts; frame-ancestors https://host.example.com
```

A `<meta>` CSP cannot express `sandbox` or `frame-ancestors`. The sandbox
module refuses to initialize when `globalThis.origin !== 'null'`, and only
accepts parent messages from the origins configured with
`VITE_ZEUS_PLAYGROUND_HOST_ORIGINS` (loopback is allowed for local
development). `parseSandboxParentOrigins` and
`isTrustedSandboxParentOrigin` expose the same fail-closed policy to custom
hosts.
