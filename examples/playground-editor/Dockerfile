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
RUN pnpm install --frozen-lockfile
RUN rustup target add wasm32-unknown-unknown
RUN pnpm --filter @zeus-js/compiler-wasm build:wasm
RUN pnpm --filter @zeus-js/compiler-native build:native
RUN pnpm build
ARG VITE_ZEUS_SANDBOX_ORIGIN
ENV VITE_ZEUS_SANDBOX_ORIGIN=$VITE_ZEUS_SANDBOX_ORIGIN
RUN pnpm --filter @zeus-js/example-playground-editor build

FROM nginx:1.29-alpine AS runtime
COPY examples/playground-editor/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/examples/playground-editor/dist /usr/share/nginx/html
EXPOSE 80 81
