# PR-15 Renderer Host Browser Evidence

Date: 2026-11-04

## Scope

This evidence extends the existing jsdom renderer-adapter tests to the packed
React 18, React 19 and Vue 3 browser consumers. It exercises
`createRendererHost` with `createReactRenderer` / `createVueRenderer` inside a
custom element whose business action and cell container stay owned by the
element.

The browser fixture checks:

- initial framework mount into a CE-owned container;
- same-key `update` keeps the framework DOM identity and component state;
- portal/teleport content mounts in an external target and is removed on
  dispose while the target itself stays connected;
- CE-owned business state is not copied into the framework cell;
- disconnect aborts the renderer session, disposes framework effects and does
  not reuse the disposed root after reconnect;
- React StrictMode effect balance and Vue `onMounted`/`onUnmounted` balance;
- 60 mount/unmount cycles return active framework effects to zero;
- a mount failure throws `ZEUS_RENDERER_ADAPTER_FAILURE` with the original
  cause and leaves no orphan nodes;
- rendering after host disposal throws `ZEUS_RENDERER_DISPOSED`.

The fixture uses a minimal custom element as the grid host. It demonstrates
the renderer-host boundary, not the public DataGrid API.

The `zeus-ui` repository additionally has a browser fixture for its DataGrid
cell-renderer adapter (`pnpm data-grid:framework-e2e`):

- React and Vue cells share one grid host; React Portal and Vue Teleport write
  into an external target that keeps an unrelated sentinel child;
- same-key update keeps both framework DOM nodes;
- disconnect clears both adapters and Portal/Teleport content while preserving
  the external target and its sentinel;
- reconnect mounts fresh React/Vue roots with the current grid value.

That fixture passed in Chromium, Firefox and WebKit on 2026-11-04.

The public `DataGridColumn.cellRenderer` field is now implemented in
`zeus-ui` and verified by `data-grid-runtime.spec.ts`:

- a plain DOM renderer mounts into grid-owned per-cell containers;
- stable `(rowKey, columnId)` updates keep the same renderer handle and DOM;
- focus inside renderer-owned content and row selection survive a stable-key
  data update;
- row removal and host disconnect dispose handles;
- reconnect mounts fresh renderer roots;
- `virtual: true` scroll recycling disposes offscreen handles and remounts
  when rows reenter the viewport;
- React 19 and Vue 3 roots mount, update in place, dispose on disconnect and
  remount through the same public `columns[].cellRenderer` API.

## Validation

| Command                       | Engines                      | Result                                   |
| ----------------------------- | ---------------------------- | ---------------------------------------- |
| `pnpm check:packed-consumers` | Chromium, Firefox, WebKit    | PASS (React 18, React 19, Vue 3, Native) |
| `data-grid-runtime.spec.ts`   | jsdom (compiled e2e project) | PASS (34 tests)                          |

All four consumer modes passed isolated install, SSR, typecheck, production
build, bundle inspection and browser checks. The renderer-host checks run for
the React 18, React 19 and Vue 3 consumers; the native consumer is skipped
because it does not load a framework adapter.

Run on macOS arm64 with Node 24.18.0. Report:
`temp/packed-consumers/report.json`.

## Not covered

- Windows/Linux browser and packaged-consumer runs are not executed here.
