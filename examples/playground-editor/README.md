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

Production builds must set a separate execution origin:

```sh
VITE_ZEUS_SANDBOX_ORIGIN=https://sandbox.example.com \
  pnpm --filter @zeus-js/example-playground-editor build
```

Serve the same `dist` directory on both origins. Sandbox assets need
`Access-Control-Allow-Origin: *` or an exact opaque-origin-compatible CORS
policy. The sandbox page sets its own restrictive CSP.

Run the full three-engine and external-export gate from the repository root:

```sh
pnpm check:playground-editor
```
