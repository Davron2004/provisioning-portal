# Test plan

What is tested at which level, why, and how to run it. Every change ships with
tests at the level that would catch its bugs; the design in
`docs/detailed-design.md` says what each part is supposed to do.

## Levels at a glance

Counts are from `main` at the time of writing (November 2026); the commands
below print the current ones.

| Level                        | Tool                                  | Where                               | Size                   | Needs                        |
| ---------------------------- | ------------------------------------- | ----------------------------------- | ---------------------- | ---------------------------- |
| Contracts                    | Vitest                                | `packages/contracts/src/*.spec.ts`  | 1 file, 7 tests        | nothing                      |
| API unit                     | Vitest                                | `services/api/src/**/*.test.ts`     | 22 files, 163 tests    | nothing                      |
| API integration              | Vitest                                | `services/api/src/**/*.int.test.ts` | 4 files, 18 tests      | DynamoDB Local, OpenSearch   |
| Web unit and component       | Angular unit-test builder (Vitest)    | `apps/web/src/**/*.spec.ts`         | 42 files, 297 tests    | nothing                      |
| Infrastructure               | Vitest + `aws-cdk-lib/assertions`     | `infra/test/*.test.ts`              | 5 files, 60 tests      | nothing (no AWS credentials) |
| End to end, desktop + mobile | Playwright (Chromium)                 | `e2e/tests/*.spec.ts`               | 9 files, 55 tests      | DynamoDB Local, OpenSearch   |
| Accessibility                | axe-core in Playwright                | `e2e/tests/accessibility.spec.ts`   | 32 of the 55 E2E tests | as E2E                       |
| Static checks                | ESLint, Prettier, `tsc` per workspace | whole repository                    |                        | nothing                      |

## Contracts

`packages/contracts` holds the Zod schemas for every payload. Its tests cover
the rules that live in the schemas themselves: a draft line may leave
extension and number out, an update must change something, malformed numbers
and extensions are rejected, WebSocket client messages parse by `action`,
path parameters are encoded. Everything else that uses the schemas (the API
parsing requests, the app parsing responses) is tested where it is used.

## API unit tests

Fast tests of the Lambda code with no network. They cover:

- **Domain rules**: order validation (`order-validation.test.ts`), the order
  and line lifecycle, order titles. Validation is a pure function over an
  account context, so every rule is tested directly.
- **HTTP layer**: the router, the Lambda adapter (CORS, missing claims, error
  mapping, base64 bodies), and the account and order routes with stubbed
  dependencies.
- **Assistant**: the `rules` provider's phrasings, deterministic resolution
  of sites, devices and people, the service that turns an intent into the same
  preview a manual order gets, and the Claude provider against a mocked SDK
  client (the request it sends, out-of-range output moved to `unresolved`,
  provider errors mapped to `502 assistant_unavailable`).
- **Workflow**: the state machine definition (shape, retry policy, Catch
  routing, backoff), the local Step Functions stand-in, and the simulated
  provisioner (`+fail`, `+flaky`, failure rate, step timing).
- **Streams, search and realtime**: stream record decoding, search document
  building and query construction, the WebSocket routes and the order
  notifier (fan-out, gone connections).
- **Data helpers and auth**: cursor encoding and checks, the users text
  filter, local tokens, seed generation (deterministic, fictional numbers
  only), the seed custom resource.

```bash
npm test -w @provisioning/api
```

## API integration tests

The same code against real DynamoDB Local and OpenSearch containers, for what
an in-memory fake would hide: key conditions, GSIs, conditional writes,
transactions, streams, analyzers and highlighting. Each file creates its own
throwaway table (`test-support/dynamo.ts`) and search index, so files run in
parallel without seeing each other's data.

| File                                  | What it proves                                                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/repositories.int.test.ts`       | Every list pages in the right order, the users text filter returns full pages with a working cursor, a cursor from another list is refused, a guessed site id from another account is not listed.              |
| `workflow/order-workflow.int.test.ts` | Adds, updates and removes provision and keep numbers and counters right; a permanently failed line keeps its number and retries alone; two concurrent orders never get the same number; idempotency keys work. |
| `search/search.int.test.ts`           | Name prefixes, numbers written any way, extensions, entity and account filters, per-entity totals, keeping up with stream changes, and highlights that never contain raw HTML.                                 |
| `local/streams-poller.int.test.ts`    | Subscriptions per account and for all accounts, and stream records delivered in the Lambda event shape with the production filters.                                                                            |

```bash
docker compose up -d
npm run test:integration -w @provisioning/api
```

`DYNAMODB_ENDPOINT` and `OPENSEARCH_ENDPOINT` (or `DDB_PORT` and
`OPENSEARCH_PORT`) point them at other ports.

## Web unit and component tests

Angular's unit-test builder runs Vitest with jsdom. Pages are rendered with
their real templates against a `FakeApi` (`src/testing/fake-api.ts`) that
answers by path and records requests, a fake realtime service for pushes, and
a fake viewport for the phone layouts. They cover:

- **Core**: the API client and error parsing, `pagedList()` paging, auth
  (local and Cognito strategies, guards, the interceptor), runtime config,
  theme, URL query state, unsaved-changes guard, the realtime service.
- **Pages**: overview, accounts list and every account tab, orders list,
  order detail (live merge, retry, reconnect), the order builder and form,
  review, submission (one idempotency key per preview), assistant, search,
  login, the shell and global search.
- **Shared pieces**: status chips and filters, truncation, pipes for phone
  numbers and relative time, labels and time formatting.

```bash
npm test -w @provisioning/web
```

## Infrastructure tests

`infra/test` synthesizes the stack (dev defaults, and prod with a budget
email and the Claude API provider) without AWS credentials and asserts the
properties that matter: table keys and stream, Lambda runtime and
environment, IAM that follows each handler's declared access, OpenSearch
sizing and resource policy, the state machine's retries against the exported
constants, stream filters and DLQs, authorizers, CloudFront headers and CSP,
budget and alarms, prod retention, and the GitHub OIDC role's exact trust.
`bundles.test.ts` builds every handler with esbuild and imports the bundle in
Node, which catches ESM and CommonJS problems template assertions cannot.
The full list is in the design doc under "Infrastructure > Tests".

```bash
npm test -w @provisioning/infra
npm run synth -w @provisioning/infra   # also run in CI, after building the web app
```

## End-to-end tests

Playwright drives the production build of the web app against the local
harness: the real Lambda handlers, DynamoDB Local, OpenSearch, the WebSocket
gateway and the Step Functions stand-in. `playwright.config.ts` starts the
harness with `--reset` (fresh seed), no random transient failures, short
provisioning steps and the `rules` assistant, then builds and serves the app
the way CloudFront does. `auth.setup.ts` signs in once through the real login
form and the other tests reuse that session.

Two projects:

- `chromium`: desktop Chrome at 1440x900, everything not tagged `@mobile`
  (34 tests).
- `mobile`: Pixel 7, only the tests tagged `@mobile` (20 tests).

| File                    | Journeys                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `login.spec.ts`         | Wrong password, redirect to sign in and back, sign out.                                                                                   |
| `navigation.spec.ts`    | Side navigation, signed-in visit to the login page, theme choice that survives a reload, the phone drawer.                                |
| `accounts.spec.ts`      | Filters and sort kept in the URL, account tabs, server-side users filter by name and number, account cards on a phone.                    |
| `orders.spec.ts`        | A manual order that fails live on a `+fail` line and fails again on retry; a `+flaky` line retried automatically; order cards on a phone. |
| `validation.spec.ts`    | Preview errors block submit and show on the line; a taken extension is flagged before the preview.                                        |
| `assistant.spec.ts`     | A plain-English request becomes a reviewed order that provisions live; a request it cannot understand orders nothing.                     |
| `search.spec.ts`        | Search by name and by number, keyboard navigation through results, the search button on a phone.                                          |
| `accessibility.spec.ts` | See below.                                                                                                                                |

Tests create their own users with a unique tag, so they run in parallel on
one seeded dataset without depending on each other or on order.

```bash
docker compose up -d
npm run e2e                          # both projects
npm run e2e -- --project=chromium    # desktop only
npx playwright show-report e2e/playwright-report
```

### Accessibility

`accessibility.spec.ts` opens the overview, accounts, an account, a new order,
an order, the assistant, search and the login page with an error shown, in
light and dark themes, on desktop and on a phone (32 scans). Each scan runs
axe against WCAG 2.0, 2.1 and 2.2 A and AA and fails on any serious or
critical violation; the full report, minor findings included, is attached to
the test. Other tests use roles and accessible names as locators, so a
control without a name breaks them too.

Automated checks find only part of the problems. The keyboard path through
search results has its own test, and UI changes are also checked in a real
browser in light and dark and at desktop and phone widths before a PR.

## What CI runs

`.github/workflows/ci.yml`, on every pull request and every push to `main`,
as four parallel jobs:

1. **Lint, typecheck, unit tests, build**: `npm run lint`, `npm run
typecheck`, `npm test` (contracts, API, web and infra), `npm run build`.
2. **API integration tests** against DynamoDB Local and OpenSearch 2.19
   service containers.
3. **CDK synth** after building the web app.
4. **E2E (Playwright)**, both projects, against the same containers. When it
   fails, the HTML report and traces are uploaded as an artifact.

All four must pass before a PR is merged. `deploy.yml` runs only after CI
passed on `main`, and finishes with a smoke test of the deployed stack
(`infra/scripts/smoke-test.sh`).

## No flaky tests

A test that sometimes fails is a bug, in the test or in the code, and is
fixed rather than retried. Playwright runs with `retries: 0` and `forbidOnly`
in CI. What makes that hold:

- Waits are on observable state (a role, a status, a pushed order), never
  fixed sleeps.
- Randomness is turned off or made deterministic: the seed is generated
  from a fixed PRNG, transient provisioning failures are off in E2E, and the
  simulated provisioner's failures are driven by `+fail` and `+flaky` email
  addresses.
- Each integration test file has its own table and index; each E2E test
  creates its own data.
- A failed E2E run keeps its trace, so a failure can be diagnosed from CI
  without reproducing it.

## Deliberately not tested

- **Real AWS.** No test talks to AWS: not DynamoDB, OpenSearch Service,
  API Gateway, Cognito, Step Functions or IAM. The harness stand-ins and the
  template tests cover the shape; the deploy's smoke test covers that the
  stack answers. What has not been checked against a real account is listed
  in `docs/deployment.md` ("Not verified without an AWS account").
- **Real Bedrock or Claude API calls.** The Claude provider is tested with a
  mocked SDK client; CI and E2E use the `rules` provider so they need no
  credentials and give the same answer every time. Model quality is not
  something a pass/fail test can pin down.
- **A real provisioning backend.** There is none; the simulated provisioner
  is tested instead.
- **Browsers other than Chromium.** Desktop and mobile both run in Chromium.
- **Load and performance.** Not measured; the design notes where the data
  model would change at higher volume.
- **Visual regression.** No screenshot comparisons; layout is checked in the
  browser when UI changes.
