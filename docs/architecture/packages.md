# Zeus Package Architecture

Zeus's `packages/` directory is organised into six domains. A package's
physical location states what it is; the directory is the architecture, not a
filing convenience.

```
packages/
├── core/       framework runtime — the floor everything else stands on
├── compiler/   compiler IR, Rust engine, native/WASM distribution
├── features/   official optional capabilities
├── web-c/      Web Components compilation and output toolchain
├── tooling/    developer tooling and testing support
└── create/     project scaffolding and the component registry
```

`pnpm check:structure` enforces every rule on this page. If a package is in a
domain it does not belong to, CI fails and names it.

---

## The six domains

### `core` — framework runtime

The minimum a Zeus app needs. Five packages:

| Package       | Role                                           |
| ------------- | ---------------------------------------------- |
| `shared`      | framework-internal helpers                     |
| `signal`      | fine-grained reactive core                     |
| `runtime-dom` | DOM runtime: bindings, control flow, templates |
| `runtime-ssr` | server rendering                               |
| `zeus`        | public entry point, JSX runtime                |

**Allowed:** the runtime, the reactive primitives, the public entry.

**Forbidden:** routers, queries, i18n, data fetching, CLIs, ESLint plugins,
Vite plugins, compiler platform packages, UI registries, test helpers.

`core` may depend on nothing outside itself. A package that wants to build on
the runtime belongs in `features`, not here. This is the rule the gate exists
for: `router`, `query`, `resource` and `i18n` used to live in `core`, and the
directory stopped describing what the framework actually was.

### `compiler` — compiler domain

Eleven packages: the transform contract, the Rust engine's Node adapter, the
WASM build, and the seven native platform packages.

The Rust source stays in `crates/zeus_compiler`. Only the npm packages live
here, because their distribution constraints (N-API, `optionalDependencies`,
per-platform binaries) belong together.

`compiler` may depend on nothing outside itself. The runtime consumes compiler
_output_, never the compiler itself.

`compiler-wasm` is `private: true` and is not in the fixed release group. That
is deliberate — it ships inside the Playground build rather than to npm.

### `features` — optional capabilities

| Package    | What it adds             |
| ---------- | ------------------------ |
| `router`   | routing                  |
| `resource` | async resource primitive |
| `query`    | TanStack Query binding   |
| `i18n`     | internationalisation     |

`features` may depend on `core`. A new Form, Animation or similar optional
capability is evaluated for this domain first.

`resource` depends only on `signal`, which would let it live in `core` by
dependency. It lives here by decision: `core` is the framework floor, and an
opt-in data primitive is not part of the floor.

### `web-c` — Web Components toolchain

Ten packages: analysis, declaration generation, bundler integration, the
custom element runtime, and the output targets (WC, CSS, icons, React wrapper,
Vue wrapper).

These are not application-level ecosystem packages. The React and Vue wrappers
are _output formats for compiled components_, not framework adapters for apps.
That distinction is why they stay together here.

### `tooling` — developer tooling

| Package             | Role                                   |
| ------------------- | -------------------------------------- |
| `vite-plugin`       | build integration                      |
| `eslint-plugin`     | lint rules                             |
| `testing`           | official test helpers                  |
| `playground-engine` | the Playground's compile engine        |
| `consumer`          | internal DevTools consumer (`private`) |

Three of these have version lines separate from the 32-package fixed release
group: `vite-plugin` (`0.0.5`), `consumer` (private), and `create-zeus`.

### `create` — scaffolding and registry

| Package                          | Role                      |
| -------------------------------- | ------------------------- |
| `create-zeus`                    | project scaffolder        |
| `zeus-ui`                        | component CLI             |
| `registry` (`@zeus-ui/registry`) | component source registry |

`create-zeus` and `zeus-ui` keep independent version lines. Moving them into
one directory does not merge their releases.

---

## Dependency direction

```
        core          compiler
          │              │
          └──────┬───────┘
                 ▼
             features
                 │
                 ▼
               web-c
                 │
                 ▼
              tooling
                 │
                 ▼
                create
```

Each domain may depend on the ones above it, and must not depend on the ones
below it. Concretely:

| Domain     | May depend on                                      |
| ---------- | -------------------------------------------------- |
| `core`     | —                                                  |
| `compiler` | —                                                  |
| `features` | `core`                                             |
| `web-c`    | `core`, `compiler`                                 |
| `tooling`  | `core`, `compiler`, `features`, `web-c`            |
| `create`   | `core`, `compiler`, `features`, `web-c`, `tooling` |

Two additional rules:

1. **A publishable package may not depend on a private one.** A consumer
   installing from npm cannot resolve `@zeus-js/devtools-consumer`, so a
   published package depending on it is broken on arrival.
2. **`core` and `compiler` depend on nothing else.** They are the floor. If a
   change seems to need an upward dependency, the package is in the wrong
   domain.

### The `compiler-shared` question

`compiler-shared` sits in `compiler` rather than `core` even though the runtime
is conceptually downstream of its IR types. No runtime package imports it — the
Rust crate is the only consumer, through a canonical JSON fixture. Placing it in
`core` would make the layout claim a runtime dependency that does not exist.

---

## Placing a new package

Ask, in order:

1. **Is it the framework runtime?** → `core`. Very few things are.
2. **Is it compiler infrastructure, or a compiler distribution channel?** →
   `compiler`.
3. **Is it an optional capability an app opts into?** → `features`.
4. **Does it compile or emit Web Components?** → `web-c`.
5. **Does it exist to build, lint, test or debug Zeus?** → `tooling`.
6. **Does it create projects or distribute component source?** → `create`.

If the answer is "it's convenient next to something else", that is not a domain.
Choose by role.

### Adding a package

1. Create `packages/<domain>/<name>/` with a `package.json` carrying the right
   `name`, `private` flag and `repository.directory`.
2. Add it to `pnpm-workspace.yaml` if it is under a new domain directory (the
   existing six wildcards cover every current domain).
3. Add the short name to `EXPECTED[<domain>]` in
   `scripts/check/check-structure.ts`.
4. Update the expected counts in the same file (`checkDomainCounts`), and
   `checkReleaseLists` if it publishes.
5. If it publishes, decide its release line: the 32-package fixed group, the
   native group, or its own version line.
6. Update [packages.md](./packages.md) and this page.

The gate fails on any of these being skipped, which is the point: adding a
package is a decision, and the decision has to be written down.

---

## Private versus published

|               | Published                        | Private        |
| ------------- | -------------------------------- | -------------- |
| npm           | installed by consumers           | workspace only |
| Release group | fixed / native / own line        | never          |
| Version       | follows its group                | independent    |
| Dependencies  | may not include private packages | anything       |

Private packages today: `zeus-ui`, `compiler-wasm`, `@zeus-js/devtools-consumer`.

---

## What the gate checks

`pnpm check:structure` (`scripts/check/check-structure.ts`) verifies:

- the six domain directories exist and nothing else sits under `packages/`
- every package is in the domain that lists it, and no expected package is missing
- package names are unique
- `repository.directory` matches the real location when declared
- dependencies point only at permitted domains
- no publishable package depends on a private one
- the release groups still hold 32 and 8 packages, contain no private packages,
  and exclude the independently-versioned ones
- no retired path has come back (`packages/core/router`, `packages/devtools`, …)
- the domain counts still total 38

It reads the working tree and the configured release lists. It never asks the
npm registry, so a network outage cannot turn it green.

---

## Common mistakes

**"I'll put it in `core` because it's small."**
Size is not a domain. `testing` is a test helper and lives in `tooling`;
`router` is optional and lives in `features`.

**"The gate is wrong, I'll widen `EXPECTED`."**
The exception is the decision. Widen it in a reviewed change with a reason,
not to unblock a refactor.

**"I'll add a compatibility re-export at the old path."**
A retired path that still resolves keeps two layouts alive. The gate treats
the old path's reappearance as a failure for that reason.

**"`vite-plugin` is a build tool, put it in the release group."**
It has its own version line (`0.0.5`) and is deliberately outside the 32. A
gate check asserts it stays out.
