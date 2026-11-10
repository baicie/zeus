# The Admin build compiles the napi native compiler, which needs a Rust
# toolchain; the runtime image stays on the small Node base.
FROM rust:1.95-bookworm AS build
COPY --from=node:24.18.0-bookworm-slim /usr/local /usr/local
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.build.json Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY packages ./packages
COPY scripts ./scripts
COPY examples/admin ./examples/admin
ARG ZEUS_CORE_COMMIT
ARG ZEUS_UI_COMMIT
ARG ZEUS_VERSION
ARG ZEUS_BUILD_TIME
RUN pnpm install --frozen-lockfile
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

FROM node:24.18.0-bookworm-slim AS runtime
ARG ZEUS_CORE_COMMIT
ARG ZEUS_VERSION
LABEL org.opencontainers.image.revision=$ZEUS_CORE_COMMIT \
  org.opencontainers.image.version=$ZEUS_VERSION
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --system --uid 10001 --create-home zeus
COPY --from=build /app/examples/admin/dist ./dist
COPY --from=build /app/examples/admin/server ./server
COPY --from=build /app/examples/admin/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
RUN mkdir -p /data && chown -R zeus:zeus /data /app
USER zeus
ENV ZEUS_ADMIN_DB=/data/admin.sqlite
ENV ZEUS_ADMIN_HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]
