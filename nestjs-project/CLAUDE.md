# CLAUDE.md

## Environment Startup Verification

**Default behavior:** starting the environment means starting **only infrastructure services** (database, mail, etc.) — **never** start the NestJS application server unless the user explicitly asks to run/serve the project (e.g., "rode o projeto", "suba o servidor", "run the app").

After starting infrastructure, always confirm the containers are up before proceeding:

```bash
docker compose ps   # all services must show status "running"
```

Then verify each infrastructure service is actually ready to accept connections — not just running:

- **PostgreSQL:** `docker compose exec db pg_isready -U streamtube` — expect `accepting connections`
- **Redis:** `docker compose exec redis redis-cli ping` — expect `PONG`
- **MinIO:** `curl -f http://localhost:9000/minio/health/live` — expect status 200

Only start the NestJS dev server (`npm run start:dev`) when the user **explicitly** asks to run the application — never as part of "start the environment".

## Development Environment

This project runs inside Docker. Always use the container for development:

```bash
# Start containers
docker compose up -d

# Install dependencies (first time only)
docker compose exec nestjs-api npm install

# Run the dev server (watch mode)
docker compose exec nestjs-api npm run start:dev
```

Services:
- `nestjs-api` — NestJS API, port `3000`
- `db` — PostgreSQL 17, port `5432`, database `streamtube`, user/password `streamtube`
- `mailpit` — SMTP on `1025`, web UI on `8025`
- `redis` — BullMQ backend, reachable only inside the Compose network (`maxmemory-policy noeviction`)
- `minio` — S3-compatible storage, API on `9000`, console on `9001`, volume `minio-data`
- `minio-init` — one-shot job that creates `S3_BUCKET`; it exits with code 0
- `video-worker` — runs `npm run start:worker` and consumes the processing queue. It waits for `node_modules` on a fresh clone and has no watch mode: **run `docker compose restart video-worker` after changing worker code or reinstalling dependencies**

All verification and teardown commands run on the **host machine**:

```bash
# Verify NestJS is running (expect 200 + "Hello World!")
curl http://localhost:3000

# Verify PostgreSQL is ready (runs inside the db container)
docker compose exec db pg_isready -U streamtube

# Check container logs
docker compose logs nestjs-api
docker compose logs db

# Tear down the entire environment
docker compose down
```

## Commands

**Strict rule:** every `npm`, `npx`, `node`, `tsc`, and test command runs **inside the container**, never on the host. Running on the host causes env-var divergence (`DB_HOST` resolves to `localhost` instead of the Compose service), uses a different Node version, and produces results that do not reflect what runs in CI/prod.

### Container-only commands (always prefix with `docker compose exec nestjs-api`)

```bash
npm run start:dev                        # Dev server with hot-reload
npm run build                            # Compile to dist/
npm run start:prod                       # Run compiled build

npm test                                 # Unit + integration tests (serial, via jest maxWorkers: 1)
npm run test:watch                       # Unit tests in watch mode
npm run test:cov                         # Coverage report
npm run test:e2e                         # End-to-end tests (serial, via jest maxWorkers: 1)

npx tsc --noEmit                         # Type-check (required before declaring a task done)
npm run lint                             # ESLint with auto-fix
npm run format                           # Prettier formatting
```

### Host-only commands (Docker / connectivity probes)

```bash
docker compose ps
docker compose logs nestjs-api
docker compose exec db pg_isready -U streamtube
curl http://localhost:3000
```

### Test execution

Integration and e2e suites share a single test database, so both Jest configs set `maxWorkers: 1` (serial) and `forceExit: true` (open handles from libraries must not hang the run):

```bash
docker compose exec nestjs-api npm test
docker compose exec nestjs-api npm run test:e2e
```

Parallel execution causes FK violations, deadlocks, and cross-suite contamination because suites truncate or seed shared tables concurrently.

During active development, run only the tests related to the file being changed (`npm test -- path/to/file.spec.ts`). Before declaring a task done, run the full suite — see the global `CLAUDE.md` → "Definition of Done (Technical)".

## Long-running Processes

Commands that never exit (dev server, watch modes) must be run in background in the Bash tool — otherwise the agent blocks indefinitely waiting for the process to return.

This applies to: `start:dev`, `start:prod`, `test:watch`, and any other persistent process.

## Test Type Selection

Choose the suffix by what the test really does, not by where the code under test lives. The suffix is a contract that drives Jest config (`testRegex`, parallelism), CI steps, and reader expectations.

| Suffix                  | Purpose                                                              | DB / external I/O | Location                     |
|-------------------------|----------------------------------------------------------------------|-------------------|------------------------------|
| `*.spec.ts`             | **Unit** — pure logic, all collaborators mocked                      | Forbidden         | Next to the source file      |
| `*.integration-spec.ts` | **Integration** — exercises real DB, real repositories, real modules | Required          | Next to the source file      |
| `*.e2e-spec.ts`         | **End-to-end** — full HTTP cycle via `supertest`                     | Required          | `nestjs-project/test/`       |

A test that constructs a `TypeOrmModule.forRoot`, opens a connection, or hits the `db` service **must** be `*.integration-spec.ts`, never `*.spec.ts`. A test that boots the full Nest application and makes HTTP calls **must** be `*.e2e-spec.ts`.

Conventions for **how to write** each kind of test (mocking patterns, AAA structure, override strategies for global guards, etc.) live in `.claude/rules/nestjs-testing.md` and load when you edit a test file.

## Jest Configuration

These settings are required in `package.json` (jest config) and `test/jest-e2e.json` for the project's tests to work correctly:

- `setupFiles: ["dotenv/config", ".../setup-env.ts"]` — `dotenv/config` loads `.env` inside the Jest process; without it, `DB_HOST`, `JWT_SECRET`, etc. fall back to undefined or to the host's `localhost`, breaking container-to-container DNS. `src/test/setup-env.ts` is listed in both `package.json` and `test/jest-e2e.json`.
- `testRegex: '.*\\.(spec|integration-spec)\\.ts$'` — covers both unit (`*.spec.ts`) and integration (`*.integration-spec.ts`) suffixes.

Do not add new test-file suffixes; if a new test type is needed, update the regex deliberately.

## Environment File Conventions

`.env` is parsed by both Docker Compose and `dotenv` — values containing shell-special characters (`<`, `>`, `|`, `&`, spaces) **must be quoted** or rewritten:

```dotenv
# Wrong — the unquoted angle brackets are shell redirection syntax and break parsing
MAIL_FROM=StreamTube <noreply@streamtube.local>

# Right — quote the value
MAIL_FROM="StreamTube <noreply@streamtube.local>"
```

Whenever possible, prefer storing only the bare address in `.env` and composing display names in code (e.g., in `mail.config.ts`) so the file stays shell-safe.

## Videos

Phase 03 lives in four modules. Decisions: `docs/decisions/technical-decisions-phase-03-videos.md`. Plan: `docs/phases/phase-03-videos/`.

| Path | Responsibility |
|---|---|
| `src/videos/` | HTTP API, draft creation, upload lifecycle, public reads, queue publishing |
| `src/storage/` | `StorageService`, the only code that talks to S3 |
| `src/queue/` | Shared BullMQ connection |
| `src/video-worker/` | `VideoProcessor`, `VideoProcessingService`, `FfmpegService`; entrypoint `src/worker.ts` |

### Upload flow

The file never passes through the API. The client calls `POST /videos`, requests URLs with `POST /videos/:slug/upload/parts`, sends each part to the storage with `PUT`, and finishes with `POST /videos/:slug/upload/complete`. `GET /videos/:slug/upload/parts` lists received parts so an interrupted upload can resume, and `DELETE /videos/:slug/upload` cancels it.

### Endpoints

| Route | Access |
|---|---|
| `POST /videos` | Authenticated, rate limited |
| `POST`, `GET /videos/:slug/upload/parts` | Owner |
| `POST /videos/:slug/upload/complete` | Owner |
| `DELETE /videos/:slug/upload` | Owner |
| `GET /videos/:slug/status` | Owner |
| `GET /videos/:slug` | Public, `ready` only |
| `GET /videos/:slug/stream`, `/download`, `/thumbnail` | Public, `ready` only; 302 to a signed URL |

`VideosController` uses `@SkipThrottle()` because the global throttler would block part signing and playback. Only `POST /videos` keeps the default limit.

### Status and failures

`status` tracks the file lifecycle: `draft → processing → ready | failed`. A completion the storage refuses reverts `processing → draft`, so the client can retry. Transitions are conditional `UPDATE`s, so concurrent completions and job redelivery are safe. Publication (Phase 04) is a separate concern and must not be added to this enum.

The job `process-video` in queue `video-processing` carries `{ videoId }`, uses the video id as `jobId` and runs up to 3 attempts with exponential backoff. An invalid file throws `UnrecoverableError` and ends in `failed` with `INVALID_VIDEO_FILE`; exhausted attempts end with `PROCESSING_ERROR`; a queue failure during completion ends with `ENQUEUE_FAILED` and returns 503.

FFmpeg runs through `child_process.spawn` and reads the signed URL over HTTP, so the worker never copies the video to disk. `fluent-ffmpeg` is deprecated; do not add it.

### Storage conventions

- One private bucket: `videos/{id}/original{ext}` and `videos/{id}/thumbnail.jpg`.
- `StorageService` keeps two clients: internal (`S3_ENDPOINT`) and signing (`S3_PUBLIC_ENDPOINT`). The host is part of the signature, so a URL signed for one host fails on another.
- `src/test/setup-env.ts` makes tests sign with `S3_ENDPOINT`, because the public host is not reachable from inside a container.
- Storage variables: `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`.
- Queue variables: `REDIS_HOST`, `REDIS_PORT`.
- Limits and worker: `VIDEO_MAX_SIZE_BYTES` (10 GiB), `VIDEO_PART_SIZE_BYTES` (64 MiB) and `VIDEO_WORKER_CONCURRENCY` (2).
- MinIO images come from the `pgsty/*` fork: `minio/minio` is no longer available on Docker Hub.
- MinIO's defaults (`stale_uploads_expiry=24h`, checked every `6h`) remove abandoned multipart data. The application does not clean up: the draft row stays, and listing or completing it answers `VIDEO_UPLOAD_EXPIRED`. S3 needs an equivalent lifecycle rule in production.

### Testing videos

- `test/videos*.e2e-spec.ts` has one file per plan spec and shares `test/videos-e2e.helper.ts`. The files that reach `ready` or `failed` need the real `video-worker` running and up to date.
- `src/test/video-fixture.ts` generates the test MP4 with FFmpeg; do not commit binary fixtures.
- Integration specs publish to a dedicated queue so the running worker does not consume their jobs.
- `Video` must be listed in every `ALL_ENTITIES`, because `Channel` declares the inverse relation.
- `@nestjs/bullmq` stays on the `11.x` line: `12.x` is ESM-only and Jest cannot load it. `ioredis` is a direct dependency because `bullmq` 6 treats it as optional.

## Build Assets

`tsc` (and therefore `nest build`) only emits compiled `.ts` files to `dist/`. Any non-TypeScript runtime asset — Handlebars templates (`.hbs`), JSON fixtures, static config files, etc. — must be declared in `nest-cli.json` under `compilerOptions.assets` (with `watchAssets: true` for dev). Without that, the file exists in `src/` but is missing in `dist/` and runtime fails only after build.

## Architecture

NestJS with standard module structure. Source lives in `src/`, compiled output in `dist/`.

- Each domain feature gets its own module (e.g., `UsersModule`, `VideosModule`) registered in `AppModule`
- Controllers handle HTTP routing; Services hold business logic; both are scoped to their module

## Code Conventions

- **TypeScript:** `nodenext` module resolution, `ES2023` target, `strictNullChecks` on, `noImplicitAny` off
- **Decorators:** `emitDecoratorMetadata` + `experimentalDecorators` enabled — required for NestJS DI
- **Prettier:** single quotes, trailing commas everywhere
- **ESLint:** `no-explicit-any` allowed; `no-floating-promises` and `no-unsafe-argument` are warnings; the `no-unsafe-*`, `unbound-method` and `require-await` rules are off in test files only

## REST Conventions

This is a RESTful API. All endpoints must follow standard REST conventions — correct HTTP methods, proper status codes, plural resource nouns, and consistent URL structure. Details are enforced via rules on controller files.
