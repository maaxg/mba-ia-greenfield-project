---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-10-30T09:29:31.553675923-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-30T14:19:40.717837827-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-30T09:29:57.119077017-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-30T09:29:57.118680811-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-30T09:29:57.123070325-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-30T09:29:57.127243881-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-10-30T09:29:57.124166067-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-30T09:29:31.289585106-03:00"
---

# phase-03-videos — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities** (literal, `docs/project-plan.md`):

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** _Not specified._

**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.

**Affected subprojects:**

- `nestjs-project` — no specific note (in scope: storage, fila, worker, upload, processamento, URL única, streaming e download)

**Deferred subprojects:** _None._

**Sequencing notes:** Depende de: Fase 01, Fase 02.

**Neighbors (for boundary detection only):**

- **Phase 02:** Fluxo completo de criação de conta, confirmação por e-mail, login, logout e recuperação de senha.
- **Phase 04:** Edição das informações do vídeo, fluxo de rascunho e publicação, painel de administração do canal e página pública.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | phase | Backend | Tecnologia da fila de processamento | decided | A (BullMQ + Redis) | bullmq, @nestjs/bullmq, ioredis |
|     └─ Last revision: 2026-10-30 — Redis roda com `maxmemory-policy noeviction` e sem porta publicada no host | | | | | | |
| phase-03-videos/TD-02 | phase | Cross-layer | Estratégia de upload de arquivos de até 10GB | decided | A (Multipart S3 direto ao storage com URLs pré-assinadas) | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner |
|     └─ Last revision: 2026-10-30 — Sincronização de `next-frontend/openapi.json` e `next-frontend/lib/api/types.ge… | | | | | | |
| phase-03-videos/TD-03 | phase | Backend | Organização do object storage | decided | A (Bucket único privado com prefixo por vídeo) | — |
|     └─ Last revision: 2026-10-30 — Imagens fixadas em `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` e `pgsty/mc:RELEA… | | | | | | |
| phase-03-videos/TD-04 | phase | Repo-wide | Como o worker de vídeo roda | decided | A (Container separado, mesmo código-fonte) | — |
|     └─ Last revision: 2026-10-30 — O worker roda com `ts-node` em `npm run start:worker`, sem `nest start --watch` | | | | | | |
| phase-03-videos/TD-05 | phase | Backend | Extração de metadados e geração de thumbnail | decided | A (`child_process.spawn` de ffprobe/ffmpeg lendo URL assinada) | — |
|     └─ Last revision: 2026-10-30 — `metadata` guarda `width`, `height`, `video_codec`, `audio_codec`, `bitrate`, `… | | | | | | |
| phase-03-videos/TD-06 | phase | Cross-layer | Estratégia de URL única | decided | A (Slug aleatório base62 de 11 caracteres) | — |
|     └─ Last revision: 2026-10-30 — Todas as rotas de vídeo usam o slug como identificador externo; o UUID fica int… | | | | | | |
| phase-03-videos/TD-07 | phase | Cross-layer | Streaming e download | decided | A (Redirect 302 para URL assinada) | — |
|     └─ Last revision: 2026-10-30 — `GET /videos/:slug` (metadados) e `GET /videos/:slug/thumbnail` (302 para URL a… | | | | | | |
| phase-03-videos/TD-08 | phase | Cross-layer | Ciclo de status e tratamento de falhas | decided | A (Quatro estados com transições condicionais) | — |
|     └─ Last revision: 2026-10-30 — Vídeo `failed` mantém o arquivo original, sem nova tentativa nem remoção pela A… | | | | | | |
| phase-03-videos/TD-09 | phase | Repo-wide | Chaves de ambiente e limites de upload | decided | A (Dois endpoints S3 e limites configuráveis) | — |
|     └─ Last revision: 2026-10-30 — Lista completa de chaves: `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3… | | | | | | |
| phase-03-videos/TD-10 | phase | Backend | Estratégia de teste do fluxo assíncrono | decided | A (E2E contra o worker real do Compose, com fixture gerada por FFmpeg) | — |
|     └─ Last revision: 2026-10-30 — Scope corrigido de `Repo-wide` para `Backend` | | | | | | |
| phase-03-videos/TD-11 | phase | Backend | Destino de uploads multipart abandonados | decided | A (Expiração delegada ao storage, rascunho preservado) | — |
| phase-03-videos/TD-12 | phase | Repo-wide | Provisionamento do bucket | decided | A (Serviço one-shot `minio-init` no Compose) | — |
| phase-03-videos/TD-13 | phase | Cross-layer | Validade das URLs assinadas | decided | A (Constantes de 1h para partes e 4h para leitura) | — |
| phase-03-videos/TD-14 | phase | Cross-layer | CORS do object storage para upload pelo navegador | decided | A (Sem configuração própria nesta fase) | — |

_Source files:_

- phase-03-videos — docs/decisions/technical-decisions-phase-03-videos.md (scope_type: phase, related_phases: [3])

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-videos/TD-03, phase-03-videos/TD-09, phase-03-videos/TD-12 |
| Serviço de processamento em segundo plano (filas) | phase-03-videos/TD-01, phase-03-videos/TD-04, phase-03-videos/TD-09, phase-03-videos/TD-10 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-videos/TD-02, phase-03-videos/TD-09, phase-03-videos/TD-11, phase-03-videos/TD-13, phase-03-videos/TD-14 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-videos/TD-08 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-videos/TD-05, phase-03-videos/TD-08, phase-03-videos/TD-10 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-videos/TD-05, phase-03-videos/TD-07, phase-03-videos/TD-10 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-videos/TD-06, phase-03-videos/TD-07 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-videos/TD-07, phase-03-videos/TD-13 |
| Download do vídeo pelo usuário | phase-03-videos/TD-07, phase-03-videos/TD-13 |

## Decisions Detail

### phase-03-videos/TD-01

**Recommendation:** a fase tem um único tipo de job, e o que importa é retry, backoff e falha terminal, que o BullMQ entrega prontos com integração oficial NestJS 11; pg-boss evitaria um container, mas custaria DI manual e misturaria fila e dados no mesmo Postgres. O que se perde é a atomicidade entre banco e fila, tratada em TD-08.
**Libraries:** bullmq, @nestjs/bullmq, ioredis

**Revisions:**
- 2026-10-30 — `@nestjs/bullmq` fixado em `^11.0.5` em vez de `^12.0.0`. Rationale: a linha 12 é publicada só em ESM e o Jest do projeto, em CommonJS, não a carrega; a 11 é a linha do Nest 11 instalado e aceita `bullmq` 6.
- 2026-10-30 — `ioredis` adicionado como dependência direta. Rationale: no `bullmq` 6 ele é opcional e sem ele nenhuma conexão com Redis abre.
- 2026-10-30 — Redis roda com `maxmemory-policy noeviction` e sem porta publicada no host. Rationale: com evicção o Redis pode descartar jobs, e nenhum cliente fora da rede Compose precisa da fila.

### phase-03-videos/TD-02

**Recommendation:** é a única opção em que a API nunca vê os bytes, e a retomada vem de `ListParts` sem estado adicional. Perde-se simplicidade no cliente: são quatro chamadas em vez de uma. Limites: 10.000 partes e mínimo de 5 MiB por parte, exceto a última.
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

**Revisions:**
- 2026-10-30 — `DELETE /videos/:slug/upload` aborta o multipart e remove o rascunho. Rationale: é a saída explícita do cliente; o que acontece sem ela está em TD-11.
- 2026-10-30 — Sincronização de `next-frontend/openapi.json` e `next-frontend/lib/api/types.gen.ts` adiada para a fase de frontend de vídeos. Rationale: esta fase regenera `nestjs-project/openapi.json`, mas não altera o frontend, e `next-frontend-openapi-typing/TD-02` e `TD-03` valem quando houver consumidor.

### phase-03-videos/TD-03

**Recommendation:** na Fase 03 não há tráfego que justifique CDN, e privado por padrão evita expor conteúdo de rascunho antes da Fase 04 definir visibilidade. Perde-se a thumbnail cacheável sem assinatura.
**Libraries:** —

**Revisions:**
- 2026-10-30 — Imagens fixadas em `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` e `pgsty/mc:RELEASE.2026-10-26T00-00-00Z`. Rationale: as imagens oficiais não estão mais disponíveis, conforme o Context deste TD.

### phase-03-videos/TD-04

**Recommendation:** mantém uma fonte única de `Video` e `StorageService`, respeita o isolamento pedido pelo diagrama e evita inventar um monorepo. Perde-se imagem mínima, aceitável porque a imagem de produção só existe na Fase 07.
**Libraries:** —

**Revisions:**
- 2026-10-30 — FFmpeg entra no `Dockerfile.dev`, compartilhado por `nestjs-api` e `video-worker`. Rationale: a fixture de TD-10 é gerada no container do Jest.
- 2026-10-30 — O worker roda com `ts-node` em `npm run start:worker`, sem `nest start --watch`. Rationale: evita disputar `dist/` com a API.

### phase-03-videos/TD-05

**Recommendation:** zero dependência morta e custo de disco constante mesmo para 10GB; a fragilidade de rede é coberta pelos retries de TD-08. Perde-se a conveniência de um wrapper. Frame da thumbnail: 10% da duração, para evitar a tela preta inicial comum.
**Libraries:** —

**Revisions:**
- 2026-10-30 — `metadata` guarda `width`, `height`, `video_codec`, `audio_codec`, `bitrate`, `frame_rate` e `format_name`, além da coluna `duration_seconds`. Rationale: a capability não lista campos; estes são os que o `ffprobe` entrega e que um player ou painel usa, e eles são públicos em `GET /videos/:slug`.

### phase-03-videos/TD-06

**Recommendation:** atende "curta e sem conflito" com a garantia no banco, e não depende de título editável. Perde-se legibilidade na URL.
**Libraries:** —

**Revisions:**
- 2026-10-30 — Todas as rotas de vídeo usam o slug como identificador externo; o UUID fica interno. Rationale: mantém uma única forma de endereçar o vídeo e não expõe a chave do banco.

### phase-03-videos/TD-07

**Recommendation:** alinhada ao diagrama e sem custo de banda na API, com Range entregue pelo próprio storage. Perde-se a ocultação da URL do storage e o bitrate adaptativo, que nenhum requisito da fase exige.
**Libraries:** —

**Revisions:**
- 2026-10-30 — Nesta fase, vídeo `ready` é acessível a qualquer pessoa com a URL, inclusive anônimos, e não há listagem. Rationale: visibilidade é capability da Fase 04.
- 2026-10-30 — `VideosController` usa `@SkipThrottle()`, e só `POST /videos` mantém o limite padrão. Rationale: o limite global bloquearia a assinatura de partes e a reprodução.
- 2026-10-30 — `GET /videos/:slug` (metadados) e `GET /videos/:slug/thumbnail` (302 para URL assinada) seguem a mesma regra pública, só para vídeo `ready`. Rationale: o bucket é privado e a URL única precisa resolver para o vídeo e sua thumbnail.

### phase-03-videos/TD-08

**Recommendation:** é o menor ciclo que cobre rascunho, processamento e resultado, e a condição no `UPDATE` resolve concorrência sem lock. Se o enfileiramento falhar, o vídeo vai a `failed` com motivo. Perde-se a garantia de entrega do outbox: a falha do Redis é observável, mas uma queda da API dentro da janela deixa o vídeo em `processing` sem job e sem sinal, risco aceito nesta fase.
**Libraries:** —

**Revisions:**
- 2026-10-30 — `status` descreve o ciclo técnico do arquivo, e `draft` significa "aguardando conclusão do upload". Rationale: a publicação editorial da Fase 04 será um campo próprio, sem alterar este ciclo.
- 2026-10-30 — Pré-cadastro exige `filename` (até 255 caracteres), `size_bytes` (inteiro ≥ 1) e `content_type` (até 100 caracteres); `title` é opcional, até 255 caracteres, e assume o nome do arquivo sem extensão. Tamanho acima de `VIDEO_MAX_SIZE_BYTES` responde 413, e tipo sem prefixo `video/` responde 415. Rationale: a capability não define a entrada do rascunho, e o tipo só é conferido de verdade pelo worker.
- 2026-10-30 — Se a conclusão do multipart falhar, o vídeo volta de `processing` para `draft`. Rationale: o upload continua retomável. As demais transições são condicionais ao status, inclusive as de `failed` por `ENQUEUE_FAILED` e pelo worker.
- 2026-10-30 — Janela entre a reserva do status e o enfileiramento corrigida: ela inclui a conclusão do multipart, não é de milissegundos, e uma queda da API nela deixa o vídeo em `processing` sem job. Rationale: a afirmação anterior não correspondia ao código. Recuperação fica adiada; é risco aceito.
- 2026-10-30 — Vídeo `failed` mantém o arquivo original, sem nova tentativa nem remoção pela API. Rationale: nenhuma capability da fase cobre retry ou exclusão; o tratamento fica para uma fase posterior de gerenciamento.

### phase-03-videos/TD-09

**Recommendation:** mantém a regra do projeto no tráfego interno e não exige configuração na máquina do desenvolvedor. Parte de 64 MiB gera cerca de 160 partes para 10 GiB, longe do limite de 10.000. Perde-se a simplicidade de uma variável só.
**Libraries:** —

**Revisions:**
- 2026-10-30 — `S3_PUBLIC_ENDPOINT` é a exceção documentada à regra de Docker Networking, e os testes assinam com o valor de `S3_ENDPOINT`. Rationale: ele é consumido fora da rede Compose, e os testes rodam dentro dela.
- 2026-10-30 — Lista completa de chaves: `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `REDIS_HOST`, `REDIS_PORT`, `VIDEO_MAX_SIZE_BYTES`, `VIDEO_PART_SIZE_BYTES` (mínimo 5 MiB) e `VIDEO_WORKER_CONCURRENCY` (padrão 2, mínimo 1). Rationale: as chaves são contrato entre Joi, `.env.example`, Compose e serviços, e a Option A só citava parte delas.

### phase-03-videos/TD-10

**Recommendation:** é o único formato que prova que os serviços sobem e conversam. Testes de integração chamam o serviço de processamento direto para cobrir ramos de falha sem fila. Perde-se autonomia do teste em relação ao Compose.
**Libraries:** —

**Revisions:**
- 2026-10-30 — O SI da entidade adiciona `Video` a todos os `ALL_ENTITIES`, a `cleanAllTables` e ao spec de migrations. Rationale: `Channel` passa a declarar a relação inversa.
- 2026-10-30 — O cenário de vídeo em `processing` prepara o status direto no banco, sem publicar job. Rationale: com o worker real, publicar o job criaria uma corrida com a asserção.
- 2026-10-30 — Scope corrigido de `Repo-wide` para `Backend`. Rationale: estratégia de teste é categoria de Backend, e `Repo-wide` não cobre código de runtime.

### phase-03-videos/TD-11

**Recommendation:** o custo real é o espaço das partes, que o storage já recupera, e o rascunho restante é uma linha sem consumidor nesta fase porque não há listagem. Perde-se a coerência automática entre banco e storage: a limpeza das linhas fica adiada.
**Libraries:** —

### phase-03-videos/TD-12

**Recommendation:** mantém o provisionamento como infraestrutura, fora do código que vai para produção com S3. Perde-se um serviço a menos no Compose.
**Libraries:** —

### phase-03-videos/TD-13

**Recommendation:** atende upload e reprodução sem configuração nova. Perde-se o ajuste sem deploy, e a reprodução além de 4h exige nova requisição a `/stream`, limitação aceita.
**Libraries:** —

### phase-03-videos/TD-14

**Recommendation:** não há cliente de navegador nesta fase, e o padrão do MinIO já foi verificado. Perde-se o espelhamento da política de produção; a regra de S3 com `ETag` exposto fica como requisito de implantação.
**Libraries:** —

## Inherited Decisions Detail

### phase-01-configuracao-base/TD-01

**Recommendation:** Option A (@nestjs/config) — Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.

**Libraries:** `@nestjs/config@^4.x`

### phase-01-configuracao-base/TD-02

**Recommendation:** Option A (Joi) — First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively. Using a different tool for env validation vs. request validation is reasonable — env config is validated once at startup, DTOs are validated per-request. Zod is elegant but adds a third validation paradigm to the project.

**Libraries:** `joi@^17.x`

### phase-01-configuracao-base/TD-03

**Recommendation:** Option B (Namespaced/grouped with registerAs) — The project roadmap explicitly calls for auth, email, and storage in upcoming phases. Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability. The `registerAs()` factory is dual-purpose: DI token inside NestJS and plain importable function for `data-source.ts`. Initial files for Phase 01: `src/config/database.config.ts`, `src/config/app.config.ts`.

**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Option A (Shared registerAs factory) — Natural outcome of choosing `@nestjs/config` with `registerAs`. The factory is already callable by design. `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication, minimal code, no extra abstraction.

**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### phase-02-auth/TD-01

**Recommendation:** Argon2id — For a greenfield project in 2026, Argon2id is the OWASP-recommended choice. The native build dependency is a one-time Docker setup cost. The project has no legacy constraints favoring bcrypt. OWASP minimum: 19MiB memory, 2 iterations.

**Libraries:** `argon2@^0.41.x`

### phase-02-auth/TD-02

**Recommendation:** Option A (@nestjs/passport) — The project plan includes only email/password auth for now, but the plugin architecture costs little and future phases may add social login. Aligns with official NestJS docs, making onboarding and maintenance easier.

**Note:** Decision deliberately diverged from the Recommendation during implementation — custom guards were preferred over `@nestjs/passport` to keep the dependency surface smaller; social login is not on the near-term roadmap, so the plugin-architecture benefit did not justify the extra abstraction layer.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-03

**Recommendation:** Option A (Refresh Token Rotation) — Provides the strongest security model with automatic theft detection. The DB write overhead is acceptable for a video platform (auth refresh is infrequent vs. video operations). PostgreSQL is already in the stack, so no new infrastructure needed. Race conditions can be mitigated with a short grace period for the old token.

**Libraries:** —

### phase-02-auth/TD-04

**Recommendation:** Option B (Random Opaque Tokens in DB) — Revocability is important: when a user requests a new password reset, previous tokens should be invalidated. The DB table is trivial to implement, and the tokens table can also serve future needs (e.g., API keys). Keeps email tokens decoupled from the JWT auth system.

**Libraries:** —

### phase-02-auth/TD-05

**Recommendation:** Option A (@nestjs-modules/mailer) — Best NestJS integration with minimal boilerplate. Supports SMTP (matching the architecture diagram), works with MailHog/Mailpit for local development without external dependencies, and scales to any SMTP provider in production. Template engine support (Handlebars) simplifies email formatting. No vendor lock-in.

**Libraries:** `@nestjs-modules/mailer@^2.x`, `handlebars@^4.x`

### phase-02-auth/TD-06

**Recommendation:** Option A (class-validator + class-transformer) — This is a backend-only project (no shared schemas with frontend), so Zod's single-source-of-truth advantage is less impactful. class-validator is the documented NestJS approach, and the project already uses decorators extensively (TypeORM entities, NestJS DI). Fewer integration surprises with NestJS 11.

**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Option A (Custom Domain Exception Filter) — Provides machine-readable error codes that the Next.js frontend can switch on, without the overhead of RFC 9457's URI-based type system. The project is single-consumer (first-party frontend), so a simple `{ statusCode, error, message }` format with domain codes balances clarity and simplicity. The custom filter cost is low — two small files.

**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** Option A (@nestjs/throttler) — Native NestJS integration is decisive: the guard system allows scoping rate limiting to `AuthModule` only via module-level `APP_GUARD`, with `@SkipThrottle()` for exemptions. The project is single-instance with no distributed requirements, so in-memory storage is sufficient. Using express-rate-limit would bypass NestJS's DI and guard lifecycle for no clear benefit.

**Libraries:** `@nestjs/throttler@^6.x`

### phase-02-auth/TD-09

**Recommendation:** Option B (Opaque) — Since DB lookup is mandatory (TD-03), JWT signature adds no security value. Opaque tokens are shorter, leak no data, and are simpler to generate.

**Note:** Decision deliberately diverged from the Recommendation — JWT was kept to reuse the access-token signing/verification infrastructure (`@nestjs/jwt`), trading token size and base64-readability for a single token format across the codebase.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-10

**Recommendation:** Option A — The platform is a video sharing service with URL-based channel handles. A strict `[a-z0-9_]` allowlist is the simplest and most portable choice: no extra dependencies, no edge cases around hyphen positioning, and the `user_<random>` fallback provides a valid handle even for extreme email prefixes. Hyphens can always be added in a future iteration if user feedback justifies it.

**Libraries:** —

### phase-02-auth-frontend/TD-01

**Recommendation:** Three reasons. (1) **Architectural fit.** The strict-BFF model in `next-frontend-config-base/TD-03` already nominates the Route Handler as the only NestJS caller; cookie-based sessions are the natural match, and Auth.js's framework adds layers between the BFF and the cookie that buy nothing because the backend is the auth authority — Auth.js's value (DB adapters, OAuth providers, magic-link, `getServerSession` helpers) is mostly unused in this configuration. (2) **Smaller blast radius.** A ~50-LOC session helper is grep-friendly, debuggable, and test-friendly via the existing MSW+BFF integration test pattern; a misconfigured Auth.js callback is a longer fault-isolation loop. (3) **Compatibility with Next.js 16 / React 19.** Built-in `next/headers` `cookies()` is the canonical primitive both runtimes already use; Auth.js v5 versions track Next.js majors with a lag, adding compatibility risk that Option A does not have. Option C is rejected as unsafe (`localStorage` for refresh tokens) and architecturally regressive (loses RSC personalization).
**Libraries:** —

### phase-02-auth-frontend/TD-02

**Recommendation:** Three reasons. (1) **Defense in depth on the cookie content** — `httpOnly` blocks JS, encryption blocks accidental log/proxy inspection; the marginal cost is one ~3KB dep. (2) **Single cookie to manage** simplifies logout (one `session.destroy()` call) and avoids the orphan-cookie failure mode of Option A. (3) **Room to carry minimal user metadata** (`userId`, `email`, `channelSlug`) lets `app/layout.tsx` RSC render the authenticated chrome (avatar, channel name) without a per-render `/auth/me` round-trip — Phase 04+ gains compound here. Option A is a viable downgrade if the team rejects `iron-session` for any reason; the migration A→B (or B→A) is a one-Route-Handler refactor with no test changes downstream because the BFF interface is unchanged. Option C is rejected: it solves a problem (server-side revocation) the project does not have at the cost of infrastructure the project does not own.
**Libraries:** iron-session

### phase-02-auth-frontend/TD-03

**Recommendation:** The single-flight detail is non-trivial and goes in the helper from day one — tested by MSW with a "two concurrent intercepted upstream calls; one refresh expected" assertion. Option B's client-driven pattern is rejected because it doesn't replace Option A (RSC still needs server-side refresh) — adopting B means doing both. Option C's pre-emptive timer is rejected because the failure modes (multiple tabs, sleep/wake) outweigh the latency saving and force a `"use client"` shell near the root.
**Libraries:** —

### phase-02-auth-frontend/TD-04

**Recommendation:** Three reasons. (1) **Decoupled from TD-05** — works with Route Handlers OR Server Actions; the form code does not change if TD-05 is revisited later. (2) **Aligned with shadcn's canonical form primitive** — the project already commits to `radix-nova` shadcn (`components.json`); `npx shadcn@latest add form` produces react-hook-form wrappers; choosing react-hook-form means using the supported primitive instead of hand-rolling around it. (3) **Zod-first developer ergonomics match the rest of the FE foundation** — `next-frontend-config-base/TD-01` chose Zod 4 for env; the same schemas-as-source-of-truth pattern carries to forms with zero new validator paradigm. Option B is rejected for impedance with shadcn's primitive and for over-investing in progressive-enhancement that the strict-BFF model does not require. Option C is rejected for the per-field boilerplate and the loss of client-side feedback on a project that values quick, type-safe form iteration.
**Libraries:** react-hook-form, @hookform/resolvers

### phase-02-auth-frontend/TD-05

**Recommendation:** Three reasons. (1) **Strict-BFF alignment.** `next-frontend-config-base/TD-03` named Route Handlers as the BFF surface; Option A keeps every mutation visible under `app/api/**`. (2) **Test scaffold already exists** — `next-frontend/CLAUDE.md` § Testing and `next-frontend-msw-foundation` were authored for Route-Handlers-as-functions; Option A reuses them with zero invention. (3) **Single mutation surface** — Phase 02 sets the precedent for Phases 03–07; uniformity beats per-mutation idiom-picking when the cost of inconsistency compounds (Option C). Option B has real ergonomic appeal for the simplest forms but fragments the BFF surface and forces test-pattern reinvention; if the team later wants progressive enhancement for specific forms, the migration A→B is per-form and doesn't require touching unrelated routes — A is the safer default and the cheaper baseline.
**Libraries:** —

### phase-02-auth-frontend/TD-06

**Recommendation:** Two reinforcing reasons. (1) **No first-render flicker, no round-trip** — the session is delivered in the same response as the page HTML; the Client Provider hydrates with the correct initial state; users never see "Login" briefly turn into their avatar. (2) **No new BFF endpoint** — the cookie is the source of truth, RSC reads it, the Provider broadcasts it; the BFF surface stays minimal. The `router.refresh()` requirement after mid-session mutations is a small price (one line in the relevant mutation handler) for the structural benefits. Option B is rejected for the double-read-and-flicker; Option C is dominated by Option B and rejected.
**Libraries:** —

### phase-02-auth-frontend/TD-07

**Recommendation:** Three reasons. (1) **First-paint-correct** — the user sees the right outcome on the first paint, no skeleton, no flicker. (2) **Single integration pattern across both flows** — confirmation is RSC-only; reset is RSC + Client form (TD-04, TD-05 patterns reused) — both share the "RSC owns the token, Client Component owns the input" split. (3) **Email-prefetch behavior** is solved at the backend's idempotent-confirmation level (a small note for `/plan-build` to confirm; not a separate TD). Option B's Route-Handler-as-link-target adds redirects for no clean gain. Option C is dominated.
**Libraries:** —

### openapi-docs-nestjs/TD-01

**Recommendation:** é a única opção que preserva as decisões anteriores (`class-validator` em TD-06 de phase-02-auth) sem re-platform; o CLI plugin com `classValidatorShim: true` aproveita os decoradores `class-validator` existentes para inferir schemas, mantendo o boilerplate baixo. Nestia tem mérito técnico real mas o custo de migração do stack de validação inviabiliza-a sem uma decisão upstream de supersede de TD-06. Manual authoring é descartado.
**Libraries:** @nestjs/swagger

### openapi-docs-nestjs/TD-02

**Recommendation:** o custo marginal sobre Option A é apenas um npm script (~15 linhas) e o benefício é uma fundação correta para futura integração FE (codegen offline) sem perder a UI interativa que dev/QA usam. Option B sozinho pune a experiência de desenvolvimento em dev/local; Option A sozinho compromete o pipeline de codegen futuro. Combinar é dominante.
**Libraries:** —

### openapi-docs-nestjs/TD-03

**Recommendation:** alinha com a postura defensiva já estabelecida em phase 02 e não compromete consumidores legítimos (o `openapi.json` commitado em TD-02 cumpre o papel de "spec consultável fora da UI"). Re-abrir como Option A ou C é trivial no futuro se um caso de uso de API pública aparecer.
**Libraries:** —

### next-frontend-openapi-typing/TD-01

**Recommendation:** Three reinforcing reasons. (1) **Strict BFF makes the SDK surface valueless on the client.** Only Route Handlers ever call the upstream Nest; they already use `fetch` (Next 16's caching extensions sit on top of native `fetch`); a generated SDK adds a third client style to learn for zero functional gain. (2) **Types-first matches the rest of the FE foundation.** Env validation is Zod-derived types; component variants are `cva` types; both are TS-first with zero generated runtime. `paths` is the natural extension — one `.d.ts` file imported wherever the contract is touched. (3) **MSW typing is solved by the same `paths` symbol.** Hand-written handlers in `mocks/handlers.ts` type their resolver returns off `paths["/videos"]["get"]["responses"][200]`, giving the contract guarantee without orval/kubb's verbose generated handlers (which would be overridden per-test anyway). The marginal cost of adding `openapi-fetch` (~6KB, server-side only) is small enough that we recommend the **types + thin-client** pair, not types alone — `openapi-fetch` removes the `fetch(API_URL + path, { method, headers, body })` boilerplate in each Route Handler while staying within the BFF model. Options B/C/D may be revisited if (a) client-side data-fetching enters the stack with TanStack Query and per-endpoint hooks are wanted, or (b) the API grows beyond ~20 operations and per-call boilerplate becomes painful.
**Libraries:** openapi-typescript, openapi-fetch

### next-frontend-openapi-typing/TD-02

**Recommendation:** Three reasons. (1) **Preserves the compose-stack independence** that `next-frontend-config-base/TD-03` Context calls out as the current architecture — neither subproject's compose file references the other. (2) **Drift is eliminated structurally when paired with TD-03's CI freshness check** — the check runs the sync script and asserts no diff on either `openapi.json` or `types.gen.ts`, so a backend PR that forgets to re-sync fails CI with a clear message. (3) **The committed local file is a real artifact in PR review** — reviewers see the contract change in `next-frontend/openapi.json`'s diff at the same time as the backend change, doubling the visibility (an `openapi.json`-only diff in a feature PR is a red flag for accidental drift). Option A is acceptable as a pre-CI fallback; Option C is rejected because the cross-stack file dependency in `docker-compose.yaml` introduces coupling that the current architecture explicitly avoids, and the "no drift" gain over B is small once TD-03 lands.
**Libraries:** —

### next-frontend-openapi-typing/TD-03

**Recommendation:** It is the only option that makes contract drift _both_ visible (in PR diffs) _and_ impossible to merge accidentally (CI fail). The complexity premium over Option A is one CI step. Option B's "no committed artifacts" purity is poorly paid for in a monorepo where the cross-subproject build coupling becomes a real ergonomic cost, and it wastes the PR visibility that TD-02 Option B's committed `openapi.json` is specifically designed to deliver. Option A is acceptable as a temporary state until the CI pipeline lands; downgrading from C to A is reversible (just remove the CI step) but upgrading to C later requires explaining `types.gen.ts` history in a separate commit. Start at C. Apply the same script-and-check pattern to any future generated artifact (e.g., if `openapi-fetch` is wrapped, the wrapper file is hand-written; the only generated artifact remains `types.gen.ts`).
**Libraries:** —

### next-frontend-openapi-typing/TD-04

**Recommendation:** It is the only option that (i) handles pass-through and reshape with the same mechanism, (ii) gives a single grep target for "what shape does the BFF expose", and (iii) decouples Component imports from App Router file paths (Components import `from "@/lib/api/contracts"`, not `from "@/app/api/videos/route"`). Option B is theoretically minimal but fragile against Next's actual RSC/Client/Route-Handler typing; Option C scatters the contract surface and creates drift opportunities. The "long file" concern is bounded — for the scope of StreamTube, the BFF will likely have <30 contract aliases at peak; sectioning by feature header comments is sufficient. Make `lib/api/contracts.ts` the only file that imports `paths` from `types.gen.ts` (lintable later); every other consumer imports from `contracts.ts`.
**Libraries:** —

### next-frontend-openapi-typing/TD-05

**Recommendation:** Reasons: (1) **Determinism over auto-generation** — BFF integration tests assert on specific values; randomized fixtures are anti-helpful. (2) **Coherence with TD-01 recommendation** — `openapi-typescript`'s `paths` type is the single contract anchor; reusing it in MSW handlers means "spec ↔ handler ↔ assertion" is one type chain. (3) **Scale fit** — Phase 02 introduces few endpoints; the manual cost is negligible at this stage. If the API grows to dozens of endpoints and authoring overhead becomes real, this TD can be superseded with a Kubb-or-hey-api MSW plugin without touching TD-01's `paths` import sites (the generator just produces additional handler files; the existing manual handlers stay valid). Option B locks the project into a heavier TD-01 choice for marginal mock-authoring savings; Option C is Option A with an unnecessary detour.
**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, validationOption... _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`; the same factory is importable as a plain function... _(from phase 01)_
- `data-source.ts` loads `.env` via `import 'dotenv/config'` at the top, then imports `databaseConfig` and calls it as a plain function. _(from phase 01)_
- Database connection parameters (host, port, etc.) are sourced from a single `databaseConfig` factory — never duplicated between `AppModule` and `da... _(from phase 01)_
- `TypeOrmModule.forRootAsync` is used (not `forRoot`), with `imports: [ConfigModule]`, `inject: [databaseConfig.KEY]`, `useFactory` returning option... _(from phase 01)_

## Inherited Deferred Capabilities

| Capability | Status | Origin phase | Rationale |
|-----------|--------|--------------|-----------|
| Telas de frontend | deferred | phase-01-configuracao-base | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| Telas de cadastro, login, confirmação de conta e recuperação de senha | deferred | phase-02-auth | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| "Confirmação de conta via e-mail com link de ativação" | deferred | phase-02-auth-frontend | deferred_to_next_phase — UI landing screen de-scoped 2026-05-14; FE confirmation flow (TD-07) picked up by a future phase. BE side unchanged in `phase-02-auth`. |
| "Logout" | deferred | phase-02-auth-frontend | deferred_to_next_phase — logout button lives inside authenticated chrome (typically Phase 04). Phase 02 still implements POST `/api/auth/logout` (BFF route handler + `session.destroy()`) so the contract is ready when the chrome lands. |
| "Recuperação de senha (destination screen / set-new-password)" | deferred | phase-02-auth-frontend | deferred_to_next_phase — `/forgot-password` ships this phase sending the e-mail; the reset-password destination screen is absent from Figma → link destination remains a 404 until a later phase delivers the screen via `/screen-inventory` extension run. Documented as a known gap. |
| "Telas de cadastro, login, confirmação de conta e recuperação de senha" | deferred | phase-02-auth-frontend | a tela de confirmação da conta não será implementada nesta fase corrente, será adiada — the umbrella bullet's full coverage requires the confirmação and reset-password destination screens; both are deferred per Non-UI rows above. The 3 ship-this-phase telas (signup, login, forgot-password) are inventoried and covered by their own verbs; the umbrella bullet itself is deferred to the phase that lands the missing screens. |

## UI Inventory

_No screen inventory — UI↔API sync deferred. Run /screen-inventory 03 and then rerun /plan-context 03 to activate UI checks._

## Non-UI / Deferred Capabilities

_None._

## Testing Requirements

### nestjs-project

| Artifact type | Required layers |
|---------------|-----------------|
| Entity (`*.entity.ts`) | Integration: constraints, defaults, `select: false` |
| Service with branching + DB | Unit: branch logic (mock repo) + Integration: DB contract |
| Service with DB only (no branching) | Integration: DB contract |
| Service with configured lib (JWT, cache) | Unit: real lib with test config |
| Service with side-effect dep (email, storage) | Integration: real capture service (Mailpit) or local adapter |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only — do NOT write unit tests |
| DTO | E2E: one validation wiring test per endpoint |
| Guard (delegates to service for business logic) | E2E + Unit if complex internal logic |
| Guard (simple, delegates to Passport) | E2E only |
| Strategy (Passport) | E2E via guard |
| Pipe (custom transformation/validation) | Unit |
| Interceptor (response transform, logging) | Unit and/or E2E |
| Exception Filter | Unit + E2E |
| Middleware | E2E |
