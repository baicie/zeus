# Static WebC Studio / Native Lab host and sandbox. The same dist is served on
# two ports so the sandbox always runs on a different origin from the host.
# The Vite plugin loads the napi native compiler while building the example,
# so the build stage needs the Rust toolchain and the compiler crate.
FROM rust:1.95-bookworm AS build
COPY --from=node:24.18.0-bookworm-slim /usr/local /usr/local
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY packages ./packages
COPY scripts ./scripts
COPY examples/playground-editor ./examples/playground-editor
ARG ZEUS_CORE_COMMIT
ARG ZEUS_UI_COMMIT
ARG ZEUS_VERSION
ARG ZEUS_BUILD_TIME
RUN pnpm install --frozen-lockfile
RUN rustup target add wasm32-unknown-unknown
RUN pnpm --filter @zeus-js/compiler-wasm build:wasm
RUN pnpm --filter @zeus-js/compiler-native build:native
RUN pnpm build
ARG VITE_ZEUS_SANDBOX_URL
ARG VITE_ZEUS_SANDBOX_ORIGIN
ARG VITE_ZEUS_PLAYGROUND_HOST_ORIGINS
ENV VITE_ZEUS_SANDBOX_URL=$VITE_ZEUS_SANDBOX_URL \
  VITE_ZEUS_SANDBOX_ORIGIN=$VITE_ZEUS_SANDBOX_ORIGIN \
  VITE_ZEUS_PLAYGROUND_HOST_ORIGINS=$VITE_ZEUS_PLAYGROUND_HOST_ORIGINS
RUN pnpm --filter @zeus-js/example-playground-editor build
RUN node --import tsx scripts/release/build-info.ts \
  --product webc-studio,native-lab \
  --dist examples/playground-editor/dist \
  --core-commit "$ZEUS_CORE_COMMIT" \
  --ui-commit "$ZEUS_UI_COMMIT" \
  --version "$ZEUS_VERSION" \
  --built-at "$ZEUS_BUILD_TIME"

FROM nginx:1.29-alpine AS runtime
ARG ZEUS_CORE_COMMIT
ARG ZEUS_VERSION
LABEL org.opencontainers.image.revision=$ZEUS_CORE_COMMIT \
  org.opencontainers.image.version=$ZEUS_VERSION
COPY examples/playground-editor/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/examples/playground-editor/dist /usr/share/nginx/html
EXPOSE 80 81
