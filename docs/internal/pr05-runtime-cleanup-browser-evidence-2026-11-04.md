# PR-05 Runtime Cleanup Browser Evidence

Date: 2026-11-04

## Scope

`pnpm check:runtime-cleanup-browser` now exercises real custom elements in
Chromium, Firefox and WebKit:

- a connected host, a detached host, and a reconnected host keep one click
  handler each;
- clicking the detached instance does not dispatch a second event;
- 50 remove/reconnect cycles on one custom element do not duplicate click
  listeners;
- moving a custom element from one host container to another remounts it
  once, and the new instance accepts one click;
- clicking the old, detached instance after the reparent does not increment
  the live count;
- the final connected host remains connected;
- Chromium CDP `HeapProfiler.collectGarbage` is run after 20 warmup cycles and
  again after 80 measured add/remove cycles. `Runtime.getHeapUsage()` reports
  `1,486,172` → `1,486,940` bytes, a `768` byte retained-heap delta for 100
  total mounts.

The fixture is served from the built
`packages/core/runtime-dom/dist/runtime-dom.esm-browser.js`.

## Validation

| Command                              | Engines                   | Result |
| ------------------------------------ | ------------------------- | ------ |
| `pnpm check:runtime-cleanup-browser` | Chromium, Firefox, WebKit | PASS   |

Report: `temp/runtime-cleanup-browser/report.json`.

## Boundary

This proves DOM-visible cleanup, listener identity, reparent behavior and a
forced-GC retained-heap measurement in Chromium. The browser bundle does not
export the diagnostics session, so owner/binding/listener counters are
covered by jsdom unit tests instead. Firefox and WebKit do not expose the
Chrome DevTools Protocol heap API; they verify DOM/listener cleanup but not
heap retention. Full heap snapshots are `NOT_RUN`.
