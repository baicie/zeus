# Zeus Playground Editor

A reference Native Lab prototype for the shared playground engine and trusted
preview sandbox.

```sh
pnpm --filter @zeus-js/example-playground-editor dev
```

The example compiles project files with `@zeus-js/compiler-wasm` in a Worker.
DOM and SSR source maps, module diagnostics, interactive preview, and project
export use the same `@zeus-js/playground-engine` build contract.

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
