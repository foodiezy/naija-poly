# Deploying Odogwu Empire

One Render **web service**. The same Node process serves the built Vite client
as static files and hosts the Colyseus WebSocket server, so client and server
share an origin and no CORS is needed in the normal case.

> **The Render dashboard is authoritative, not `render.yaml`.**
> The service was created through the dashboard, so the blueprint file does not
> auto-apply — editing it changes nothing. It is kept only as documentation of
> intent. If you ever recreate the service _from_ the blueprint, delete this
> warning and make `render.yaml` the source of truth instead. Do not maintain
> both as if either works.

## Current settings (mirror these in the dashboard)

| Setting           | Value                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Type              | Web service, Node                                                                        |
| Plan              | **Free** — spins down when idle, so the first request after a quiet period takes ~30–60s |
| Build command     | `npm install --legacy-peer-deps && npm run build`                                        |
| Start command     | `npm run start`                                                                          |
| Health check path | `/health`                                                                                |

### Environment variables

| Var                 | Value                 | Notes                                                                                                                                |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`          | `production`          | Also disables all dev tooling (the dev panel is stripped from the build)                                                             |
| `ALLOWED_ORIGINS`   | the service's own URL | Comma-separated exact origins. Only needed if the client is ever served from a _different_ origin; same-origin play works without it |
| `ENABLE_DEV_TOOLS`  | unset                 | Must stay unset in production. The guard fails closed (`=== "true"`)                                                                 |
| `SHUTDOWN_DRAIN_MS` | unset → `3000`        | How long players see the restart notice before rooms are disposed. Keep well under Render's ~30s SIGTERM grace                       |

## Why the build tools live in `dependencies`

`vite`, `typescript` and `@vitejs/plugin-react` are in `dependencies`, not
`devDependencies`, and that is **deliberate** — do not "fix" it without changing
the build command at the same time.

Render sets `NODE_ENV=production` for the build step, which makes npm skip
`devDependencies`. Move the build tools and the build fails with a missing
`vite`. If you want them in `devDependencies` where they belong, the build
command must become `npm install --include=dev --legacy-peer-deps` **in the
dashboard** — and since the dashboard is authoritative, changing `render.yaml`
alone will not do it.

`--legacy-peer-deps` is required because `@colyseus/schema` v3 sits against a
0.16 server; resolving that version skew is the real fix and is tracked in
`ROADMAP.md`.

## What happens on deploy

1. Render sends `SIGTERM` to the old instance.
2. The server broadcasts "Server dey restart — hold on small" to every room,
   waits `SHUTDOWN_DRAIN_MS`, then disposes rooms and closes the HTTP server.
   Look for `[shutdown] SIGTERM — draining` followed by `[shutdown] closed
cleanly` in the logs — if you only ever see the first line, the drain is not
   completing and the window needs looking at.
3. `/health` returns 503 as soon as a shutdown starts, and while the matchmaker
   is unreachable, so a broken deploy fails its health check instead of being
   served.

Live games do **not** survive a deploy — players are told and must rejoin. Game
state is in memory only; there is no persistence yet (see `ROADMAP.md` Phase 1).

## Observability

There is no Sentry and no analytics. Two things reach Render's log stream:

- `[fatal] uncaughtException` / `[fatal] unhandledRejection` from the server.
- `[client-error] {...}` — the React `ErrorBoundary` posts render crashes to
  `POST /api/error`, so a white screen in someone's browser leaves a trace.

`grep` the log stream for `[fatal]` or `[client-error]` when something is
reported. A real funnel is in `ROADMAP.md`.
