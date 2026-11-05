# PR-28 WebC Studio Evidence

Date: 2026-11-04

## Scope

WebC Studio on `examples/playground-editor`:

- real WASM compilation of TSX component source;
- manifest, Custom Elements Manifest view and per-tag DTS;
- Props/Events/Slots inspector;
- sandboxed preview that instantiates the compiled Custom Element;
- real React 19 and Vue 3 hosts consuming the same reference Custom Element;
- an explicit “Preview in React + Vue sandbox” action that mounts both hosts
  inside the existing opaque-origin preview iframe;
- installable export archive.

## Framework host

`host.html` and `src/host.tsx` mount the same `z-host-counter` definition in:

- React 19 with `StrictMode`;
- Vue 3 via `createApp`.

The gate verifies React starts at `React: 3`, the Vue instance starts at
`Vue: 7`, the sandbox hosts mount the same compiled `z-counter` element, and a
click inside the React-hosted counter advances it to `React: 4`.

The initial template CE previously rendered only `props.count`, so it had no
interaction to lose. It now owns a `createSignal` and an `onClick` increment,
which makes the React/Vue host interaction a real CE behavior rather than a
framework-specific workaround.

This host deliberately uses a fixed reference Custom Element. It is not a
cross-boundary injection point for editor source. Editor source still executes
only inside the opaque sandbox; dynamically hosting edited source in a trusted
framework page requires a separate isolated-origin module-loading design.

## Validation

| Command                        | Environment               | Result |
| ------------------------------ | ------------------------- | ------ |
| `pnpm check:playground-editor` | Chromium, Firefox, WebKit | PASS   |

The gate includes WebC manifest/DTS inspection, `z-counter` preview
instantiation, the React/Vue reference host, export download, external install,
typecheck, Vite build and the WebC export metadata check.

## Not done

- Online deployment URL and commit association: `NOT_RUN` (no deployment
  authorization).
