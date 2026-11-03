# RFC-020: Playground Shared Engine and Trust Boundary

- Status: Accepted
- Owner: Compiler and DevTools
- Related: ADR-08 playground trust model, PR-27

## Decision

Zeus playgrounds use one renderer-neutral project and compiler contract, but
the trusted editor and untrusted preview remain separate security domains.

`@zeus-js/playground-engine` is the public shared package. It validates a
schema-versioned `ProjectSnapshot`, follows its import graph, compiles each
reachable module for DOM and SSR, links browser preview modules, validates the
postMessage protocol, and creates a standalone export.

The editor host runs the WASM compiler in a Worker. Generated source executes
only in a distinct-origin iframe with an opaque JavaScript origin. The iframe
uses `sandbox="allow-scripts"` and a CSP that denies network access, workers,
nested frames, forms, and objects.

## Project contract

Project files are immutable relative POSIX paths with UTF-8 byte budgets.
Supported languages are TS, TSX, CSS, and JSON. The snapshot records the
framework target, compiler version, declared dependency metadata, and compiler
and sandbox options.

The compiler follows static and literal dynamic imports. It compiles the
reachable TS/TSX graph dependency-first, collects CSS and JSON, and attaches
diagnostics and source maps to each module. External browser dependencies are
denied unless they are part of the explicit Zeus runtime allowlist.

Cycles, non-literal dynamic imports, unsupported packages, unresolved files,
invalid JSON, and style re-exports are diagnosed before preview execution.

## Preview contract

Preview payloads are serializable module records plus styles and runtime keys.
The sandbox creates blob modules and imports the entry inside the opaque
document. TypeScript is stripped only on the preview path.

All JavaScript loops receive a one-second execution budget during preview
linking. The host additionally applies the snapshot timeout and replaces the
iframe when the hard limit is reached.

Sandbox messages require:

- the versioned Zeus channel;
- a session nonce carried in the URL fragment;
- a bounded request ID;
- a matching `MessageEvent.source`;
- origin `"null"` for child messages; and
- a complete protocol schema under a 2 MiB size limit.

Malformed messages and mismatched sessions are ignored.

## Export contract

Export produces a deterministic archive containing the original multi-file
source, a generated auto-mount entry, Vite and TypeScript configuration, and
pinned direct package versions. Exported projects install without workspace
aliases and can run `tsc` and a production Vite build.

The browser cannot create a registry-resolved lockfile, so the archive omits
one. The first external install writes `pnpm-lock.yaml`; exported applications
should commit it.

## Deployment requirements

The editor and sandbox must use different origins in production. Sandbox module
assets require CORS suitable for `Origin: null`, normally
`Access-Control-Allow-Origin: *` with
`Cross-Origin-Resource-Policy: cross-origin`.

The sandbox document must set:

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

No server-side compile fallback is enabled by this RFC. A future fallback must
use an isolated compilation service with equivalent size, time, filesystem, and
network limits.

## Non-goals

- Executing arbitrary npm packages or install scripts.
- Sharing cookies, localStorage, API keys, or host DOM with preview code.
- Defining WebC Studio or Native Lab product UI in the shared package.
- Guaranteeing browser process-level memory limits beyond the host hard timeout
  and iframe replacement.
- SSR hydration execution inside the playground preview.

## Acceptance

`pnpm check:playground-editor` must pass in Chromium, Firefox, and WebKit. It
validates WASM compilation, multi-file source edits and generated output,
interactive preview, invalid-source diagnostics, recovery, credential and DOM
isolation, blocked network access, message injection, loop-budget recovery, and
an exported project installed and built outside the repository.
