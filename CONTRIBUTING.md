# Contributing

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Test

```bash
pnpm test
```

## Type check

```bash
pnpm check
```

## Build

```bash
pnpm build
```

## Changesets

Every user-facing change should include a changeset:

```bash
pnpm changeset
```

## Package responsibilities

- `@zeus-js/signal`: reactivity core
- `@zeus-js/runtime-dom`: DOM runtime helpers
- `@zeus-js/compiler`: JSX compiler
- `@zeus-js/zeus`: framework entry
- `@zeus-js/vite-plugin`: Vite integration

## Scripts

See `package.json` for all available scripts.
