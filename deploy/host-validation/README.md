# Host Validation Deployment Template

This directory is a deployment candidate, not a public deployment. All public
URLs remain `NOT_RUN` until Stage 2 is explicitly authorized and the online
acceptance returns `ONLINE_ACCEPTED`.

## Stage 1 (no production side effects)

```bash
pnpm deploy:stage1 --ui-root ../zeus-ui --browsers chromium
```

It builds four images from the checked-out Core/UI commits, pins each image by
its local content digest, validates `compose.yml`, starts the four products,
runs the real local acceptance with an isolated tenant, writes
`temp/deploy/stage1/deployment-candidate.json` and tears the stack down.

## Stage 2 (requires approval)

1. Copy `.env.example` to a private env file and fill image `@sha256:` digests,
   test tenant and secrets from the approved secret manager.
2. Start behind the TLS ingress in `nginx.conf`; keep Admin/AI host off the
   public network.
3. Run the online acceptance with the CI `provenance.json` and `--mode online`.
4. Roll back by restoring the previous image digests and data volume snapshot.

Never commit the private env file. Do not use the placeholder domains in
production without DNS/TLS authorization.
