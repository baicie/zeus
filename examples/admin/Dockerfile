# The Admin build compiles the napi native compiler, which needs a Rust
# toolchain; nothing from this stage ships.
#
# The runtime image used to copy the whole pnpm workspace (`node_modules` +
# `packages/`) and start through `tsx`. That put tsgo, four rolldown bindings,
# esbuild, playwright and typescript into every deployment: 311.9 MB compressed,
# 75% of it build tooling the server never imports. The server's only imports
# are `node:*` builtins (see `examples/admin/server/*.ts`), so it is bundled to
# one file and the runtime stage carries no `node_modules` at all.
FROM rust:1.95-bookworm AS build
COPY --from=node:24.18.0-bookworm-slim /usr/local /usr/local
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.build.json Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY packages ./packages
COPY scripts ./scripts
COPY examples/admin ./examples/admin
# `@zeus-web/dialog` is a vendored build (see examples/admin/package.json and
# vendor/zeus-web-dialog/provenance.json), so the install step below resolves it
# from the repository rather than from the registry. Without this line the
# frozen install fails on a missing `file:` target.
COPY vendor ./vendor
ARG ZEUS_CORE_COMMIT
ARG ZEUS_UI_COMMIT
ARG ZEUS_VERSION
ARG ZEUS_BUILD_TIME
RUN pnpm install --frozen-lockfile
# Rust/native compiler: build-time only. `pnpm build` needs it to compile views.
RUN pnpm --filter @zeus-js/compiler-native build:native
RUN pnpm build
RUN pnpm build-dts
RUN pnpm --filter @zeus-js/example-admin check
RUN pnpm --filter @zeus-js/example-admin build
RUN node --import tsx scripts/release/build-info.ts \
  --product admin \
  --dist examples/admin/dist \
  --core-commit "$ZEUS_CORE_COMMIT" \
  --ui-commit "$ZEUS_UI_COMMIT" \
  --version "$ZEUS_VERSION" \
  --built-at "$ZEUS_BUILD_TIME"
# Server -> one ESM file. Only `node:*` stays external, so the runtime needs no
# dependency tree. The path mirrors `server/index.ts` so `../dist` resolves.
RUN mkdir -p /out/server \
  && node --import tsx scripts/release/bundle-server.ts \
       --entry examples/admin/server/index.ts \
       --outfile /out/server/index.mjs

FROM node:24.18.0-bookworm-slim AS runtime
ARG ZEUS_CORE_COMMIT
ARG ZEUS_VERSION
LABEL org.opencontainers.image.revision=$ZEUS_CORE_COMMIT \
  org.opencontainers.image.version=$ZEUS_VERSION
WORKDIR /app
ENV NODE_ENV=production
# Ownership at copy time instead of a later `chown -R`: the recursive chown
# rewrote every file into a second layer and duplicated the whole app
# (119.1 MB of the old 311.9 MB image). One copy, correct ownership, one layer.
RUN useradd --system --uid 10001 --create-home zeus \
  && mkdir -p /data \
  && chown zeus:zeus /data
COPY --chown=zeus:zeus --from=build /app/examples/admin/dist ./dist
# `.mjs` because no `package.json` ships to the runtime: the extension, not a
# manifest, tells Node this file is ESM.
COPY --chown=zeus:zeus --from=build /out/server/index.mjs ./server/index.mjs
USER zeus
ENV ZEUS_ADMIN_DB=/data/admin.sqlite
ENV ZEUS_ADMIN_HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
