---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-10-30T09:29:31-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-30T09:53:29-03:00"
  docs/decisions/technical-decisions-phase-01-configuracao-base.md: "2026-10-30T09:29:57-03:00"
  docs/decisions/technical-decisions-phase-02-auth.md: "2026-10-30T09:29:57-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-30T09:29:57-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-30T09:29:57-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-30T09:29:31-03:00"
---

# phase-03-videos — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities**

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** Interface de vídeo no `next-frontend/`, edição de informações, visibilidade público/unlisted, fluxo de publicação e painel (Fase 04), player e contagem de visualizações (Fase 05).

**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.

**Affected subprojects:** `nestjs-project/`

**Deferred subprojects:** `next-frontend/` — o desafio define a fase como backend; a interface de vídeo não faz parte do escopo.

**Sequencing notes:** Depends on Fase 01 e Fase 02. Cada vídeo pertence ao canal 1:1 do usuário criado na Fase 02.

**Neighbors (for boundary detection only):**

- **Phase 02:** autenticação, usuários e canais (guard JWT global, throttler, filtro de exceções de domínio).
- **Phase 04:** edição do vídeo, visibilidade e publicação.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | technical-decisions-phase-03-videos.md | Backend | Tecnologia da fila de processamento | pending | — | — |
| phase-03-videos/TD-02 | technical-decisions-phase-03-videos.md | Cross-layer | Estratégia de upload de arquivos de até 10GB | pending | — | — |
| phase-03-videos/TD-03 | technical-decisions-phase-03-videos.md | Backend | Organização do object storage | pending | — | — |
| phase-03-videos/TD-04 | technical-decisions-phase-03-videos.md | Repo-wide | Como o worker de vídeo roda | pending | — | — |
| phase-03-videos/TD-05 | technical-decisions-phase-03-videos.md | Backend | Extração de metadados e geração de thumbnail | pending | — | — |
| phase-03-videos/TD-06 | technical-decisions-phase-03-videos.md | Cross-layer | Estratégia de URL única | pending | — | — |
| phase-03-videos/TD-07 | technical-decisions-phase-03-videos.md | Cross-layer | Streaming e download | pending | — | — |
| phase-03-videos/TD-08 | technical-decisions-phase-03-videos.md | Cross-layer | Ciclo de status e tratamento de falhas | pending | — | — |
| phase-03-videos/TD-09 | technical-decisions-phase-03-videos.md | Repo-wide | Chaves de ambiente e limites de upload | pending | — | — |
| phase-03-videos/TD-10 | technical-decisions-phase-03-videos.md | Repo-wide | Estratégia de teste do fluxo assíncrono | pending | — | — |

_Source files:_

- `docs/decisions/technical-decisions-phase-03-videos.md`

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-videos/TD-03, phase-03-videos/TD-09 |
| Serviço de processamento em segundo plano (filas) | phase-03-videos/TD-01, phase-03-videos/TD-04, phase-03-videos/TD-09, phase-03-videos/TD-10 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-videos/TD-02, phase-03-videos/TD-09 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-videos/TD-08 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-videos/TD-05, phase-03-videos/TD-08, phase-03-videos/TD-10 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-videos/TD-05, phase-03-videos/TD-10 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-videos/TD-06 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-videos/TD-07 |
| Download do vídeo pelo usuário | phase-03-videos/TD-07 |

## Decisions Detail

### phase-03-videos/TD-01

**Recommendation:** Option A (BullMQ + Redis) — a fase tem um único tipo de job, e o que importa é retry, backoff e falha terminal, que o BullMQ entrega prontos com integração oficial NestJS 11; pg-boss evitaria um container, mas custaria DI manual e misturaria fila e dados no mesmo Postgres. O que se perde é a atomicidade entre banco e fila, tratada em TD-08.

**Libraries:** —

### phase-03-videos/TD-02

**Recommendation:** Option A (Multipart pré-assinado) — é a única opção em que a API nunca vê os bytes, e a retomada vem de `ListParts` sem estado adicional. Perde-se simplicidade no cliente: são quatro chamadas em vez de uma. Limites: 10.000 partes e mínimo de 5 MiB por parte, exceto a última.

**Libraries:** —

### phase-03-videos/TD-03

**Recommendation:** Option A (Bucket único privado) — na Fase 03 não há tráfego que justifique CDN, e privado por padrão evita expor conteúdo de rascunho antes da Fase 04 definir visibilidade. Perde-se a thumbnail cacheável sem assinatura.

**Libraries:** —

### phase-03-videos/TD-04

**Recommendation:** Option A (Container separado, mesmo código) — mantém uma fonte única de `Video` e `StorageService`, respeita o isolamento pedido pelo diagrama e evita inventar um monorepo. Perde-se imagem mínima, aceitável porque a imagem de produção só existe na Fase 07.

**Libraries:** —

### phase-03-videos/TD-05

**Recommendation:** Option A (spawn com URL assinada) — zero dependência morta e custo de disco constante mesmo para 10GB; a fragilidade de rede é coberta pelos retries de TD-08. Perde-se a conveniência de um wrapper. Frame da thumbnail: 10% da duração, para evitar a tela preta inicial comum.

**Libraries:** —

### phase-03-videos/TD-06

**Recommendation:** Option A (base62 de 11 caracteres) — atende "curta e sem conflito" com a garantia no banco, e não depende de título editável. Perde-se legibilidade na URL.

**Libraries:** —

### phase-03-videos/TD-07

**Recommendation:** Option A (302 para URL assinada) — alinhada ao diagrama e sem custo de banda na API, com Range entregue pelo próprio storage. Perde-se a ocultação da URL do storage e o bitrate adaptativo, que nenhum requisito da fase exige.

**Libraries:** —

### phase-03-videos/TD-08

**Recommendation:** Option A (Quatro estados com transições condicionais) — é o ciclo pedido e a condição no `UPDATE` resolve concorrência sem lock. Se o enfileiramento falhar, o vídeo vai a `failed` com motivo. Perde-se a garantia de entrega do outbox; aceitável porque a falha é observável, não silenciosa.

**Libraries:** —

### phase-03-videos/TD-09

**Recommendation:** Option A (Dois endpoints) — mantém a regra do projeto no tráfego interno e não exige configuração na máquina do desenvolvedor. Parte de 64 MiB gera cerca de 160 partes para 10 GiB, longe do limite de 10.000. Perde-se a simplicidade de uma variável só.

**Libraries:** —

### phase-03-videos/TD-10

**Recommendation:** Option A (Worker real do Compose) — é o único formato que prova que os serviços sobem e conversam. Testes de integração chamam o serviço de processamento direto para cobrir ramos de falha sem fila. Perde-se autonomia do teste em relação ao Compose.

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

### phase-02-auth/TD-02

**Recommendation:** Option A (@nestjs/passport) — The project plan includes only email/password auth for now, but the plugin architecture costs little and future phases may add social login. Aligns with official NestJS docs, making onboarding and maintenance easier.

**Note:** Decision deliberately diverged from the Recommendation during implementation — custom guards were preferred over `@nestjs/passport` to keep the dependency surface smaller; social login is not on the near-term roadmap, so the plugin-architecture benefit did not justify the extra abstraction layer.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-06

**Recommendation:** Option A (class-validator + class-transformer) — This is a backend-only project (no shared schemas with frontend), so Zod's single-source-of-truth advantage is less impactful. class-validator is the documented NestJS approach, and the project already uses decorators extensively (TypeORM entities, NestJS DI). Fewer integration surprises with NestJS 11.

**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Option A (Custom Domain Exception Filter) — Provides machine-readable error codes that the Next.js frontend can switch on, without the overhead of RFC 9457's URI-based type system. The project is single-consumer (first-party frontend), so a simple `{ statusCode, error, message }` format with domain codes balances clarity and simplicity. The custom filter cost is low — two small files.

**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** Option A (@nestjs/throttler) — Native NestJS integration is decisive: the guard system allows scoping rate limiting to `AuthModule` only via module-level `APP_GUARD`, with `@SkipThrottle()` for exemptions. The project is single-instance with no distributed requirements, so in-memory storage is sufficient. Using express-rate-limit would bypass NestJS's DI and guard lifecycle for no clear benefit.

**Libraries:** `@nestjs/throttler@^6.x`

## Inherited Conventions

- Config por domínio com `registerAs` em `src/config/`, validada por Joi em `env.validation.ts` e injetada com `ConfigType`. _(from phase 01)_
- `TypeOrmModule.forRootAsync` com `autoLoadEntities: true` e `synchronize: false`; schema muda só por migration. _(from phase 01)_
- Serviços Compose são referenciados pelo nome como host; todo comando roda dentro do container. _(from phase 01)_
- Exceções de domínio estendem `DomainException` e o filtro responde `{ statusCode, error, message }`. _(from phase 02)_
- `JwtAuthGuard` é global via `APP_GUARD`; rotas abertas usam `@Public()`. _(from phase 02)_
- `ThrottlerGuard` é global via `APP_GUARD` (10 req/min); isenções usam `@SkipThrottle()`. _(from phase 02)_
- Entidades usam colunas `snake_case`, UUID como PK e relações declaradas nos dois lados. _(from phase 02)_
- Specs de integração compartilham o banco e `ALL_ENTITIES` lista todas as entidades relacionadas. _(from phase 02)_
- Endpoints documentados com `@nestjs/swagger` e `ApiErrorEnvelope`; `openapi.json` é o contrato exportado. _(from phase 02)_

## Inherited Deferred Capabilities

_No inherited deferred capabilities._

## Non-UI / Deferred Capabilities

_None._

## Testing Requirements

### nestjs-project

| Artifact type | Required layers |
|---------------|-----------------|
| Entity | Integration: constraints, defaults, `select: false` |
| Service with branching + DB | Unit (mock repo) + Integration (DB contract) |
| Service with side-effect dep (storage) | Integration: serviço real do Compose |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only |
| DTO | E2E: um teste de validação por endpoint |

_Comandos: `docker compose exec nestjs-api npm test` e `docker compose exec nestjs-api npm run test:e2e`._
