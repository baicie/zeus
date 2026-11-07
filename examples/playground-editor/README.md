# Zeus Playground Editor

The developer-facing Playground for Native TSX and WebC projects. It is the
reference host for the shared playground engine and trusted preview sandbox.

```sh
pnpm --filter @zeus-js/example-playground-editor dev
```

The example compiles project files with `@zeus-js/compiler-wasm` in a Worker.
DOM and SSR source maps, module diagnostics, interactive preview, and project
export use the same `@zeus-js/playground-engine` build contract.

## Playground surface

- CodeMirror 6 editor with TypeScript/TSX/JavaScript/CSS highlighting, line
  numbers, undo/redo, `Cmd/Ctrl+Enter` to run and `Cmd/Ctrl+S` to save. The
  editor is a lazy chunk so the shell stays small.
- Adjustable editor/preview split, persisted result tab, persisted split width,
  theme and font size, and preview maximize.
- Native and WebC products share one shell. WebC adds the manifest/DTS
  inspector and a real React 19 + Vue 3 consumption preview.
- Reliable auto-run: 700 ms debounce, manual run cancels a pending run, a
  rejected build keeps the last successful preview and marks it stale, and
  every build receives a fresh opaque sandbox realm.
- Sandbox console bridge (bounded to 50 entries, 2 KiB per entry and 100
  events/second) and Problems with file/line/column, severity and compiler
  code. Clicking a problem focuses the editor.
- Zero-account persistence in IndexedDB with schema validation, a 1.5 MB
  project budget, private-mode fallback and localStorage settings.
- Share links use a gzip-compressed URL fragment for small projects; larger
  projects fall back to a JSON download. Decompression is capped at 900 KB.
- Twelve runnable examples across Native and WebC.

## Host and sandbox origins

The editor and preview are intentionally different origins. Locally, the host
automatically pairs:

- `http://localhost:<port>` with `http://127.0.0.1:<port>`; or
- `http://127.0.0.1:<port>` with `http://localhost:<port>`.

Production builds must set a separate execution origin. Prefer the complete
sandbox URL so path prefixes, ports, query strings and fragments survive:

```sh
VITE_ZEUS_SANDBOX_URL=https://panel.example.com:8443/zeus-sandbox/sandbox.html \
VITE_ZEUS_PLAYGROUND_HOST_ORIGINS=https://playground.example.com:8443 \
  pnpm --filter @zeus-js/example-playground-editor build
```

`VITE_ZEUS_SANDBOX_ORIGIN` remains supported for compatibility; it keeps the
legacy origin-only behaviour and resolves `/sandbox.html` on that origin. The
host rejects a sandbox URL that shares its origin, uses a non-HTTP protocol,
contains credentials, or uses plain HTTP outside loopback.

The sandbox only accepts `postMessage` from
`VITE_ZEUS_PLAYGROUND_HOST_ORIGINS` (comma or whitespace separated). Loopback
parents are automatically admitted for local development; any other deployment
without an explicit allowlist fails closed.

Serve the same `dist` directory on both origins. Sandbox assets need
`Access-Control-Allow-Origin: *` or an exact opaque-origin-compatible CORS
policy. The sandbox page sets its own restrictive CSP, but `frame-ancestors`
and the document sandbox flag cannot be expressed in a `<meta>` tag. The
sandbox response MUST include an HTTP header equivalent to:

```text
Content-Security-Policy: sandbox allow-scripts; frame-ancestors https://playground.example.com:8443
```

This makes direct access and third-party embeds opaque as well as the normal
playground iframe. The server-side sandbox CSP is part of the security
boundary; a meta-only CSP is insufficient.

Run the full three-engine and external-export gate from the repository root:

```sh
pnpm check:playground-editor
```

Run the UX acceptance suite (initial preview, console bridge, Problems and
stale recovery, keyboard shortcuts, split/maximize, persistence, share links,
all examples, WebC React/Vue consumption, responsive layouts and screenshots):

```sh
pnpm check:playground-ux
```

Measure the real browser cost (initial shell, lazy editor chunk, first editable
and preview time, WASM compile, auto-run coalescing and heap/sandbox cleanup):

```sh
pnpm measure:playground-performance
```

Both commands accept `PLAYGROUND_UX_BROWSERS` / `PLAYGROUND_BROWSERS` with a
comma-separated engine list; the UX and official gates default to Chromium,
Firefox and WebKit.
