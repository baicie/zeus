# Contributing

Thank you for your interest in Zeus! This guide covers how to set up the project and contribute.

## Setup

```bash
git clone https://github.com/baicie/zeus.git
cd zeus
pnpm install
```

## Development

```bash
# Build all packages
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm check

# Lint
pnpm lint
pnpm lint-fix
```

## Testing

```bash
# Run all tests
pnpm test

# Unit tests only
pnpm test-unit

# Benchmarks
pnpm test:benchs
```

## Documentation

```bash
# Develop docs
pnpm docs:dev

# Build docs
pnpm docs:build
```

## Package structure

| Package                | Description         |
| ---------------------- | ------------------- |
| `@zeus-js/signal`      | Reactivity core     |
| `@zeus-js/runtime-dom` | DOM runtime helpers |
| `@zeus-js/compiler`    | JSX compiler        |
| `@zeus-js/zeus`        | Framework entry     |
| `@zeus-js/vite-plugin` | Vite integration    |

## Version management

We use [Changesets](https://github.com/changesets/changesets) for version management.

Before submitting a PR with a user-facing change:

```bash
pnpm changeset
```

This creates a changeset file describing the change. Changesets will be reviewed and included in the next release.

## Commit messages

Follow the existing commit message style. No strict rules for now.

## Pull request checklist

- [ ] Passes `pnpm check`
- [ ] Passes `pnpm lint`
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Changeset added (if applicable)
