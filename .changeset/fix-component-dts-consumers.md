---
'@zeus-js/component-analyzer': patch
'@zeus-js/component-dts': patch
---

Fix generated Web Component declarations so React, custom element, and lazy loader outputs are self-contained TypeScript consumers.

- Resolve relative imported props types through NodeNext specifiers and named, default, or star barrels, including local interface inheritance and intersections.
- Preserve native `HTMLElement` member contracts while retaining custom props, methods, and typed events.
- Normalize source-bound method and event types to portable declaration types.
- Watch imported type dependencies during component builds and report dependency failures as structured diagnostics.
