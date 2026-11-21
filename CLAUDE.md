# Working in this repo (for coding agents)

This file is read by Claude Code at the start of every session. It is also the
team's written agreement on how agent-assisted work happens here.

## What this is

A service delivery portal for a cloud phone (UCaaS) provider: admins browse
customer accounts and sites, provision users (extension, DID number, voicemail,
device) through orders, and watch orders move through
`submitted -> validating -> provisioning -> active | failed` live.

## Repo map

| Path                 | What                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `packages/contracts` | Zod schemas + types for every API payload. The single source of truth for the contract.    |
| `services/api`       | Node.js/TypeScript Lambda handlers, domain logic, and the local dev harness (`src/local`). |
| `apps/web`           | Angular app (standalone components, signals, Angular Material).                            |
| `infra`              | AWS CDK app (TypeScript).                                                                  |
| `e2e`                | Playwright tests against the full local stack.                                             |
| `docs`               | Detailed design and test plan.                                                             |
| `docker-compose.yml` | DynamoDB Local + OpenSearch for local development.                                         |

## Commands

```bash
npm ci                              # install every workspace
docker compose up -d                # DynamoDB Local :8000, OpenSearch :9200
npm run start:local -w @provisioning/api   # API + WebSocket harness, seeds demo data
npm run start:local -w @provisioning/api -- --reset   # drop the local table and reseed
npm run test:integration -w @provisioning/api         # against DynamoDB Local / OpenSearch
npm run reindex -w @provisioning/api                  # rebuild the local search index
npm start -w @provisioning/web      # Angular dev server
npm run lint                        # ESLint + Prettier, whole repo
npm run typecheck                   # every workspace
npm test                            # unit tests, every workspace
npm run e2e                         # Playwright E2E; needs `docker compose up -d`, starts the harness (fresh seed) and a production build itself
npm run e2e -- --project=chromium   # desktop only (`mobile` runs the @mobile tests on a phone viewport)
E2E_REUSE_SERVERS=1 npm run e2e     # reuse a harness and web server already running on the same ports (no reseed)
npx playwright show-report e2e/playwright-report   # last run's report; traces of failed tests are in it
npm run synth -w @provisioning/infra
```

## Rules

- **Contract first.** A payload change starts in `packages/contracts`, then the
  API, then the web app. Never redeclare an API type in the app or a handler.
- **The language model never writes.** The assistant returns an `OrderIntent`.
  Deterministic code resolves it into a draft, validates it, and the person
  approves the preview before anything is provisioned. Keep it that way.
- **Validation is deterministic and server-side.** The client may pre-check,
  but `POST /orders` re-validates everything.
- Every change ships with tests at the right level (see `docs/test-plan.md`).
- Lint, typecheck and tests must be green before a PR is opened. A flaky test
  is a bug: fix it, do not retry it.
- No vendor branding, real customer names, or real phone numbers. Demo data uses
  555-01xx numbers and `example.com` addresses.
- No secrets in the repo. Local config goes in `.env` (ignored); AWS secrets live
  in SSM Parameter Store / Secrets Manager.

## Workflow

Work is tracked as GitHub issues grouped into sprint milestones. One issue, one
branch, one PR:

1. Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `docs/<short-name>`.
2. Small commits with imperative messages (`Add order preview endpoint`), no
   co-author trailers.
3. Open a PR that says what changed, how it was tested, and `Closes #<issue>`.
4. CI (lint, typecheck, unit tests, build, synth, E2E) must pass; squash-merge.

## How agents are used here

Development is agent-driven with a human owner reviewing outcomes:

- An orchestrating session plans the sprint, writes the contract, and opens issues.
- Feature work runs in parallel lanes, one agent per lane, each in its own git
  worktree and branch, so lanes never share a checkout.
- Lanes that run the local stack use their own ports so they do not collide:
  `DDB_PORT`, `OPENSEARCH_PORT`, `API_PORT`, `WEB_PORT` (see below).
- Agents verify UI changes in a real browser (light and dark, desktop and
  mobile width) before calling a feature done, not just with unit tests.
- Agents write the first draft of docs and tests; the design doc is kept in
  step with the code in the same PR.

### Local ports

| Variable          | Default | Used by                  |
| ----------------- | ------- | ------------------------ |
| `DDB_PORT`        | 8000    | DynamoDB Local           |
| `OPENSEARCH_PORT` | 9200    | OpenSearch               |
| `API_PORT`        | 3000    | REST API + `config.json` |
| `WS_PORT`         | 3001    | WebSocket API            |
| `WEB_PORT`        | 4200    | Angular dev server       |

## Interfaces between the API and the infrastructure

Lambda entry points (each exports `handler`), under `services/api/src/handlers/`:

| File                         | Trigger                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| `http.ts`                    | API Gateway REST API, proxy integration, Cognito authorizer      |
| `ws.ts`                      | API Gateway WebSocket API: `$connect`, `$disconnect`, `$default` |
| `ws-authorizer.ts`           | WebSocket `$connect` Lambda authorizer (`?token=`)               |
| `workflow/validate-order.ts` | Step Functions task                                              |
| `workflow/provision-line.ts` | Step Functions task (inside a Map state, with retries)           |
| `workflow/finalize-order.ts` | Step Functions task                                              |
| `streams/search-indexer.ts`  | DynamoDB Streams -> OpenSearch                                   |
| `streams/order-notifier.ts`  | DynamoDB Streams -> WebSocket push                               |
| `seed-demo-data.ts`          | CloudFormation custom resource: demo data on first deploy (dev)  |

Environment variables read by the handlers: `TABLE_NAME`, `OPENSEARCH_ENDPOINT`,
`STATE_MACHINE_ARN`, `WS_MANAGEMENT_ENDPOINT`, `AUTH_MODE` (`cognito` | `local`),
`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `ASSISTANT_PROVIDER`
(`bedrock` | `anthropic` | `rules`), `ASSISTANT_MODEL`, `ANTHROPIC_API_KEY_PARAM`,
`CORS_ALLOWED_ORIGINS` (comma-separated, default `*`), `LOG_LEVEL`
(`debug` | `info` | `warn` | `error` | `silent`). The workflow Lambdas also read
`PROVISIONING_TRANSIENT_FAILURE_RATE` (default `0.1`) and
`PROVISIONING_STEP_DELAY_MS` (default `1000-3000`) for the simulated provisioner.
The assistant reads `BEDROCK_REGION` (defaults to `AWS_REGION`) for `bedrock`.
Search reads `OPENSEARCH_INDEX` (default `provisioning`), `OPENSEARCH_AUTH`
(`sigv4` default, `none` locally) and `OPENSEARCH_SERVICE` (`es` | `aoss`).

Local-only overrides (set by the harness, never in AWS): `DYNAMODB_ENDPOINT`,
`SFN_ENDPOINT`, `LOCAL_JWT_SECRET`, `ANTHROPIC_API_KEY` (instead of the SSM
parameter). Infrastructure imports table, workflow, stream-filter and index
definitions plus a per-handler env/IAM list from `@provisioning/api/infra`. Local demo login: `admin@example.com` / `portal-demo`.
