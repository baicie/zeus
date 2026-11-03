# Playground Engine and Trusted Sandbox

`@zeus-js/playground-engine` is the shared contract used by Zeus playground
products. It owns project validation, multi-file compilation, preview linking,
versioned sandbox messages, and standalone export. It does not own product UI
or deploy either WebC Studio or Native Lab.

## Trust boundary

There are two security domains:

| Domain          | Trust     | Responsibilities                                          |
| --------------- | --------- | --------------------------------------------------------- |
| Editor host     | Trusted   | File UI, WASM compiler Worker, diagnostics, export        |
| Preview sandbox | Untrusted | Executing generated DOM modules and rendering user source |

Never execute project modules in the editor document. The preview iframe must:

- use `sandbox="allow-scripts"` without `allow-same-origin`;
- live on a distinct origin from the editor;
- check `event.origin === "null"` for child messages;
- compare `event.source` with the exact iframe window;
- validate channel, version, session ID, request ID, and payload shape; and
- be replaceable when it exceeds the CPU or memory budget.

The reference implementation also instruments every JavaScript loop with a
1-second deadline. This prevents common infinite loops from wedging the iframe
and keeps the host responsive. The hard timeout remains the final guard for
recursion, memory pressure, and other runtime failures.

## Project and build contract

```ts
interface ProjectSnapshot {
  schemaVersion: 2
  entryPath: string
  files: readonly ProjectFile[]
  frameworkTarget: 'native' | 'webc'
  compilerVersion: string
  dependencies: readonly ProjectDependency[]
  options: {
    delegateEvents: boolean
    sourceMap: boolean
    sandboxTimeoutMs: number
  }
}
```

`compileProject` follows static and literal dynamic imports through the
snapshot. It compiles reachable TS/TSX modules, returns dependency-first output,
collects CSS and JSON modules, and keeps diagnostics and source maps attached to
their module.

The browser preview admits only Zeus runtime packages. Arbitrary npm packages,
Node built-ins, non-literal dynamic imports, style re-exports, and cycles fail
with structured diagnostics before sandbox execution. A future package resolver
must preserve the same default-deny policy.

## Sandbox protocol

Use the exported `PLAYGROUND_SANDBOX_CHANNEL`,
`PLAYGROUND_SANDBOX_MESSAGE_VERSION`, `parseSandboxMessage`, and
`isOpaqueSandboxOrigin` helpers. The host sends a `sandbox-load` payload;
the sandbox returns `sandbox-result` or `sandbox-error`.

Messages are limited to 2 MiB. The nonce is carried in the iframe fragment so it
is not sent to the server in the HTTP request. Do not accept a message merely
because it contains a known nonce; source, origin, schema, and pending request
must all match.

## CSP and CORS

The sandbox document should apply a policy equivalent to:

```text
default-src 'none';
script-src 'self' blob:;
style-src 'unsafe-inline';
img-src data: blob:;
connect-src 'none';
worker-src 'none';
frame-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none'
```

An iframe with an opaque origin sends `Origin: null` when it loads module
scripts. The asset server must return `Access-Control-Allow-Origin: *` or an
explicit compatible policy. It should also send
`Cross-Origin-Resource-Policy: cross-origin` for sandbox assets.

Set `VITE_ZEUS_SANDBOX_ORIGIN` to a separate execution origin in production.
Local checks use `127.0.0.1` for the editor and `localhost` for the sandbox.
Do not deploy the example with both roles on one origin.

## Export

`exportProject` emits a deterministic tar archive instead of serializing a
working tree through Node APIs. It includes the original project, an auto-mount
entry, Vite/TypeScript configuration, and pinned direct dependencies.

The exported application can be validated with:

```sh
pnpm install --ignore-scripts
pnpm check
pnpm build
pnpm dev
```

The archive deliberately has no lockfile because browser export cannot query
the registry. Pin direct versions, then commit the lockfile produced by the
first external install.

## Acceptance command

```sh
pnpm check:playground-editor
```

The command builds the shared package and example, then runs Chromium, Firefox,
and WebKit through:

- real WASM compilation;
- a multi-file edit that changes DOM and SSR output;
- live preview interaction;
- invalid TSX diagnostics and recovery;
- parent DOM/storage/cookie/fetch isolation;
- malformed postMessage injection;
- loop-budget recovery; and
- an exported project installed, built, and executed outside the workspace.

Evidence is written to `temp/playground-editor/report.json` and the exported
tar archive is retained beside it.
