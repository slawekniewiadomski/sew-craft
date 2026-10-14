# Integration tests

Cross-stack tests that exercise the **real** system: a Laravel API in a
container, a real PostgreSQL 16 database, and the built Vue SPA — driven by
Playwright. They deliberately sit outside the unit suites and do **not** count
toward unit coverage (see `AGENTS.md`).

## How it works

`playwright.config.ts` registers a global setup/teardown that boots a harness
(`support/harness.ts`):

1. Builds the API image (`docker/integration/Dockerfile` → `sewcraft-app:integration`).
2. Builds the SPA (`npm run build -w @sewcraft/frontend`).
3. Starts PostgreSQL and the API containers on a shared Testcontainers network
   (`@testcontainers/postgresql` + `testcontainers`). The API entrypoint runs
   migrations against Postgres before serving.
4. Serves the built SPA with `vite preview` on `:4173`, proxying `/api` to the
   API container.
5. Writes both URLs to `integration/.tmp/urls.json` (and the environment) for
   the specs to read via `support/runtime.ts`.

Tear-down stops the containers and the preview server.

Requires a working Docker daemon (and, once, `npx playwright install --with-deps
chromium`).

## Running

```bash
# From the repo root
npx playwright install --with-deps chromium   # first run only
npm run test:integration                      # API + UI specs

# Or target one suite
npm run test:api -w @sewcraft/integration
npm run test:ui  -w @sewcraft/integration
```

Useful env flags (mainly to iterate without rebuilding):

| Variable                         | Effect                                       |
| -------------------------------- | -------------------------------------------- |
| `SEWCRAFT_SKIP_IMAGE_BUILD=1`    | Reuse an existing `sewcraft-app:integration` |
| `SEWCRAFT_SKIP_FRONTEND_BUILD=1` | Reuse the existing `frontend/dist`           |

## Driving the app with an agent

`agent-browser` (Vercel Labs) is installed as a dev dependency so an AI agent can
explore the running app. Start the harness in the foreground, then point the
agent at the frontend URL it prints:

```bash
npm run harness -w @sewcraft/integration
#   API:      http://localhost:<port>
#   Frontend: http://127.0.0.1:4173
npx agent-browser install   # first run only
npx agent-browser           # drive the SPA at the printed Frontend URL
```

## Layout

```
integration/
  playwright.config.ts   Playwright project + global setup/teardown
  global-setup.ts        Boots the harness, exports the URLs
  global-teardown.ts     Stops the harness
  support/harness.ts     Testcontainers + vite preview orchestration
  support/runtime.ts     Reads the harness URLs in specs
  support/serve.ts       Foreground harness for agent-browser
  tests/api.spec.ts      HTTP contract against the real API
  tests/ui.spec.ts       SPA flows in a real browser
```
