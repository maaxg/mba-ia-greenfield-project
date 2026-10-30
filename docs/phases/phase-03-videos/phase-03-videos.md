---
kind: phase
name: phase-03-videos
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-10-30T14:20:47.617676202-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-10-30T14:20:47.618111875-03:00"
  docs/project-plan.md: "2026-10-30T09:29:31.553675923-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-30T14:19:40.717837827-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-30T09:29:57.119077017-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-30T09:29:57.118680811-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-30T09:29:57.123070325-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-30T09:29:57.127243881-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-10-30T09:29:57.124166067-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-30T09:29:31.289585106-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Entregar upload de vídeos de até 10GB direto ao object storage, com pré-cadastro como rascunho, processamento automático em fila por um worker FFmpeg separado, thumbnail, URL única, streaming e download, com storage, fila e worker reais subindo no Docker Compose.

---

## Step Implementations

### SI-03.1 — Infraestrutura: storage, fila, worker e configuração

**Description:** Sobe MinIO, Redis e `video-worker` no Compose, instala as bibliotecas e cria os namespaces de configuração, base de todos os SIs seguintes.

**Technical actions:**

1. Instalar `bullmq@^6.5.1`, `ioredis@^5`, `@nestjs/bullmq@^11.0.5`, `@aws-sdk/client-s3@^3.1160.0` e `@aws-sdk/s3-request-presigner@^3.1160.0` (per `phase-03-videos/TD-01`, `phase-03-videos/TD-02`)
2. Adicionar `ffmpeg` ao `Dockerfile.dev`, compartilhado por API e worker (per `phase-03-videos/TD-04`)
3. Adicionar ao `compose.yaml` os serviços `redis` (`noeviction`, sem porta no host), `minio` (`pgsty/minio`, volume nomeado, healthcheck, sem CORS próprio), `minio-init` (cria `S3_BUCKET`) e `video-worker`, com o script `start:worker` e um `src/worker.ts` provisório que mantém o processo vivo até SI-03.7 (per `phase-03-videos/TD-01`, `phase-03-videos/TD-03`, `phase-03-videos/TD-04`, `phase-03-videos/TD-12`, `phase-03-videos/TD-14`)
4. Criar `src/config/storage.config.ts`, `src/config/queue.config.ts` e `src/config/video.config.ts`; estender `env.validation.ts`, `.env.example` e `AppModule` com as chaves de `phase-03-videos/TD-09`
5. Criar `src/test/setup-env.ts` nas duas configurações do Jest, assinando URLs com `S3_ENDPOINT` nos testes (per `phase-03-videos/TD-09`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `envValidationSchema` | Integration: defaults e rejeição das novas chaves | `src/config/env.validation.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose up -d` deixa `redis` e `minio` saudáveis, `minio-init` concluído com código 0 e `video-worker` em execução
- O bucket `S3_BUCKET` existe após a subida, e subir de novo não falha
- `ffmpeg` e `ffprobe` respondem dentro de `nestjs-api` e `video-worker`
- `VIDEO_MAX_SIZE_BYTES` ausente resulta em `10737418240`

---

### SI-03.2 — Serviço de storage

**Description:** Encapsula todo o acesso S3 em um módulo próprio, reutilizado pela API e pelo worker.

**Technical actions:**

1. Criar `src/storage/storage.service.ts` com dois `S3Client`: interno (`S3_ENDPOINT`) e de assinatura (`S3_PUBLIC_ENDPOINT`), ambos com `forcePathStyle: true` (per `phase-03-videos/TD-09`)
2. Implementar `createMultipartUpload`, `presignUploadPart` (validade de 1h), `listParts`, `completeMultipartUpload` e `abortMultipartUpload` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-13`)
3. Implementar `putObject`, `presignGetObject` para o cliente e `presignInternalGetObject` para o worker, com validade de 4h (per `phase-03-videos/TD-05`, `phase-03-videos/TD-07`, `phase-03-videos/TD-13`)
4. Adicionar as exceções de `### Error Catalog` a `domain.exception.ts`; converter `NoSuchUpload` em `VideoUploadExpiredException`, e `EntityTooSmall`, `InvalidPart` e `InvalidPartOrder` em `VideoUploadIncompleteException` (per `phase-03-videos/TD-02`)
5. Criar e exportar `StorageModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `StorageService` | Integration: multipart real no MinIO, URL assinada, Range 206 | `src/storage/storage.service.integration-spec.ts` |
| `StorageModule` | Unit: compilation test | `src/storage/storage.module.spec.ts` |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- Um upload multipart feito por `PUT` nas URLs assinadas resulta em objeto do tamanho enviado
- Um GET na URL assinada com `Range: bytes=0-9` retorna `206` e 10 bytes
- A URL de download assinada retorna `Content-Disposition: attachment`
- `listParts` de um upload abortado lança `VideoUploadExpiredException`

---

### SI-03.3 — Entidade Video e migration

**Description:** Cria a tabela de vídeos ligada ao canal e ajusta as specs existentes à nova relação.

**Technical actions:**

1. Criar `src/videos/entities/video.entity.ts` e `src/videos/videos.constants.ts` conforme `### Data Model` (per `phase-03-videos/TD-06`, `phase-03-videos/TD-08`)
2. Adicionar `@OneToMany` `videos` em `Channel`
3. Gerar a migration `CreateVideos` com `npm run migration:generate`
4. Adicionar `Video` a todos os `ALL_ENTITIES`, `videos` a `cleanAllTables`, e a migration e o enum ao spec de migrations (per `phase-03-videos/TD-10`)
5. Criar `VideosModule` com `TypeOrmModule.forFeature([Video])` e registrar em `AppModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` | Integration: constraints, defaults, FK, bigint | `src/videos/entities/video.entity.integration-spec.ts` |
| `CreateVideos` | Integration: aplica e reverte | `src/database/migrations.integration-spec.ts` |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- `npm run migration:run` cria `videos`, e `migration:revert` remove tabela e enum
- Inserir dois vídeos com o mesmo `slug` viola a constraint única
- Inserir vídeo com `channel_id` inexistente viola a FK
- `size_bytes` de 10 GiB volta como `number` igual a `10737418240`
- Um vídeo novo tem `status` `draft`

---

### SI-03.4 — Pré-cadastro e início do upload

**Route:** POST /videos
**Test Specs:** see `nestjs-project/specs/videos.plan.md`
**Authorization:** Authenticated

**Description:** Cria o vídeo como rascunho, gera a URL única e abre o multipart no storage.

**Technical actions:**

1. Adicionar `findByUserId` a `ChannelsService` (resolve DG-1)
2. Criar `src/videos/slug.util.ts` com base62 de 11 caracteres via `crypto.randomInt` (per `phase-03-videos/TD-06`)
3. Criar `VideosService.initiateUpload`: valida tamanho e tipo, cria `draft`, retenta colisão de slug e compensa removendo o rascunho se o storage falhar (per `phase-03-videos/TD-02`, `phase-03-videos/TD-08`)
4. Criar `VideosController` com `POST /videos`, `InitiateUploadDto` e respostas OpenAPI; `@SkipThrottle()` na classe, mantendo o limite neste método (per `phase-03-videos/TD-07`)
5. Criar `src/test/video-fixture.ts`, gerando MP4 com `ffmpeg -f lavfi`, e `test/videos-e2e.helper.ts`, compartilhado pelos arquivos e2e de vídeo (per `phase-03-videos/TD-10`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `generateSlug` | Unit: tamanho, alfabeto, unicidade | `src/videos/slug.util.spec.ts` |
| `VideosService` | Unit: ramos de validação e compensação | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: rascunho real no banco e no MinIO | `src/videos/videos.service.integration-spec.ts` |
| `ChannelsService` | Integration: `findByUserId` | `src/channels/channels.service.integration-spec.ts` |

**Dependencies:** SI-03.2, SI-03.3

**Acceptance criteria:**

- `POST /videos` com dados válidos retorna `201` com `slug` de 11 caracteres, `status: "draft"`, `part_size_bytes` e `part_count`
- `POST /videos` sem token retorna `401`
- `POST /videos` com `size_bytes` de 10 GiB + 1 retorna `413` com `VIDEO_TOO_LARGE`
- `POST /videos` com `content_type: "text/plain"` retorna `415` com `UNSUPPORTED_VIDEO_TYPE`
- `POST /videos` com corpo inválido retorna `400` com `VALIDATION_ERROR`
- Se o storage falhar ao abrir o multipart, nenhuma linha fica em `videos`
- `POST /videos` com `size_bytes` de 10 GiB retorna `201` com `part_count: 160`
- Duas chamadas a `POST /videos` retornam `slug`s diferentes

---

### SI-03.5 — Assinatura e retomada de partes

**Route:** POST /videos/:slug/upload/parts
**Test Specs:** see `nestjs-project/specs/videos-upload-parts.plan.md`
**Authorization:** Owner

**Description:** Entrega URLs de partes e informa o que já foi enviado, viabilizando a retomada.

**Technical actions:**

1. Implementar `VideosService.getOwnedVideo`, verificando o dono pelo canal do usuário (per `### Authorization Matrix`)
2. Implementar `signUploadParts`, recusando parte acima de `part_count` e vídeo fora de `draft` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-13`)
3. Implementar `listUploadedParts` (per `phase-03-videos/TD-02`)
4. Adicionar `POST` e `GET /videos/:slug/upload/parts` com `SignUploadPartsDto` e OpenAPI

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` | Unit: dono, status, faixa de partes | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: partes reais no MinIO | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.4

**Acceptance criteria:**

- `POST /videos/:slug/upload/parts` com `part_numbers: [1]` retorna `200` com uma URL e `expires_in: 3600`
- `POST /videos/:slug/upload/parts` com `part_numbers: [999]` retorna `400` com `VIDEO_PART_OUT_OF_RANGE`
- `POST /videos/:slug/upload/parts` de outro usuário retorna `403` com `VIDEO_ACCESS_DENIED`
- `GET /videos/:slug/upload/parts` lista só as partes já enviadas, com `etag` e `size_bytes`
- Mais de 10 requisições de assinatura por minuto não retornam `429`
- `POST /videos/:slug/upload/parts` de vídeo inexistente retorna `404` com `VIDEO_NOT_FOUND`
- `POST /videos/:slug/upload/parts` com `part_numbers: []` retorna `400` com `VALIDATION_ERROR`

---

### SI-03.6 — Conclusão do upload e enfileiramento

**Route:** POST /videos/:slug/upload/complete
**Test Specs:** see `nestjs-project/specs/videos-upload-complete.plan.md`
**Authorization:** Owner

**Description:** Fecha o multipart, muda o status de forma atômica e publica o job; também cancela uploads.

**Technical actions:**

1. Criar `src/queue/queue.module.ts` com `BullModule.forRootAsync`, registrar a fila em `VideosModule` com `enableOfflineQueue: false` e criar `src/videos/video-queue.service.ts` publicando o job de `### Events/Messages` (per `phase-03-videos/TD-01`)
2. Implementar `completeUpload`: confere partes e tamanho, faz a transição `draft → processing`, completa no storage e reverte para `draft` se ele falhar (per `phase-03-videos/TD-08`)
3. Publicar o job e, se a publicação falhar, ir de `processing` a `failed` com `ENQUEUE_FAILED` (per `phase-03-videos/TD-08`)
4. Implementar `cancelUpload`: aborta o multipart, tolera upload já expirado no storage e remove o rascunho (per `phase-03-videos/TD-02`, `phase-03-videos/TD-11`)
5. Adicionar `POST /videos/:slug/upload/complete` e `DELETE /videos/:slug/upload` com `CompleteUploadDto` e OpenAPI

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` | Unit: partes divergentes, reversão, `ENQUEUE_FAILED` | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: corrida de conclusão, Redis e MinIO reais | `src/videos/videos.service.integration-spec.ts` |
| `QueueModule` | Unit: compilation test | `src/queue/queue.module.spec.ts` |
| `VideosModule` | Unit: compilation test | `src/videos/videos.module.spec.ts` |

**Dependencies:** SI-03.5

**Acceptance criteria:**

- `POST /videos/:slug/upload/complete` com partes corretas retorna `202` com `status: "processing"`
- O job `process-video` fica na fila com `jobId` igual ao `id` do vídeo
- Soma das partes diferente de `size_bytes` retorna `422` com `VIDEO_UPLOAD_INCOMPLETE` e o vídeo segue `draft`
- Duas conclusões simultâneas resultam em um `202` e um `409` com `VIDEO_UPLOAD_CLOSED`
- `DELETE /videos/:slug/upload` retorna `204` e o vídeo deixa de existir
- `DELETE /videos/:slug/upload` de vídeo em `processing` retorna `409` com `VIDEO_UPLOAD_CLOSED`
- `POST /videos/:slug/upload/complete` com corpo inválido retorna `400` com `VALIDATION_ERROR`
- `POST /videos/:slug/upload/complete` de outro usuário retorna `403` com `VIDEO_ACCESS_DENIED`
- Uma segunda `POST /videos/:slug/upload/complete` retorna `409` com `VIDEO_UPLOAD_CLOSED`
- `DELETE /videos/:slug/upload` de rascunho cujo multipart expirou retorna `204` e remove o rascunho

---

### SI-03.7 — Worker de vídeo

**Description:** Consome a fila em processo separado, extrai metadados, gera a thumbnail e fecha o ciclo de status.

**Technical actions:**

1. Criar `src/video-worker/ffmpeg.service.ts` com `spawn`, timeout, `probe` e `extractFrame` (per `phase-03-videos/TD-05`)
2. Criar `src/video-worker/video-processing.service.ts`: ignora vídeo fora de `processing`, grava metadados e thumbnail, e transiciona para `ready` (per `phase-03-videos/TD-05`, `phase-03-videos/TD-08`)
3. Criar `src/video-worker/video.processor.ts`: traduz arquivo inválido em `UnrecoverableError` e marca `failed` ao esgotar tentativas (per `phase-03-videos/TD-08`)
4. Extrair `src/database/database.module.ts` de `AppModule` para reuso no worker (per `phase-03-videos/TD-04`)
5. Criar `src/video-worker/video-worker.module.ts` e substituir o `src/worker.ts` provisório por `NestFactory.createApplicationContext` (per `phase-03-videos/TD-04`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `FfmpegService` | Integration: FFmpeg real com vídeo gerado | `src/video-worker/ffmpeg.service.integration-spec.ts` |
| `VideoProcessingService` | Integration: banco, MinIO e FFmpeg reais | `src/video-worker/video-processing.service.integration-spec.ts` |
| `VideoProcessor` | Unit: tradução de erros e tentativas | `src/video-worker/video.processor.spec.ts` |
| `VideoWorkerModule` | Unit: compilation test | `src/video-worker/video-worker.module.spec.ts` |

**Dependencies:** SI-03.6

**Acceptance criteria:**

- Processar um vídeo válido grava `duration_seconds`, `metadata` e `thumbnail_key`, com `status` `ready`
- A thumbnail no storage é um JPEG decodificável
- Processar um arquivo que não é vídeo resulta em `failed` com `INVALID_VIDEO_FILE`, sem novas tentativas
- Um erro transitório na última tentativa resulta em `failed` com `PROCESSING_ERROR`
- Reprocessar um vídeo `ready` não altera a linha

---

### SI-03.8 — Leitura pública, streaming e download

**Route:** GET /videos/:slug/stream
**Test Specs:** see `nestjs-project/specs/videos-stream.plan.md`
**Authorization:** Anonymous

**Description:** Expõe o vídeo pronto na URL única e redireciona o consumo de bytes ao storage.

**Technical actions:**

1. Implementar `getPublicVideo`, que só retorna vídeos `ready`, e `getVideoStatus` para o dono (per `phase-03-videos/TD-07`, `phase-03-videos/TD-08`)
2. Implementar `getStreamUrl`, `getDownloadUrl` com `Content-Disposition: attachment` e `getThumbnailUrl` (per `phase-03-videos/TD-07`)
3. Adicionar `GET /videos/:slug`, `/stream`, `/download` e `/thumbnail` com `@Public()`, e `GET /videos/:slug/status` restrito ao dono (per `### Authorization Matrix`)
4. Criar os DTOs de resposta com `@ApiProperty`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` | Unit: visibilidade por status | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: URLs assinadas válidas | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.6, SI-03.7

**Acceptance criteria:**

- `GET /videos/:slug` anônimo de vídeo `ready` retorna `200` sem expor chaves de storage
- `GET /videos/:slug`, `/stream`, `/download` e `/thumbnail` de vídeo fora de `ready` retornam `404`, com `VIDEO_NOT_FOUND` na primeira
- `GET /videos/:slug/stream` retorna `302`, e a URL de destino responde `206` a uma requisição com `Range`
- `GET /videos/:slug/download` retorna `302`, e o destino responde com `Content-Disposition: attachment`
- `GET /videos/:slug/status` do dono retorna `200` em qualquer status, incluindo `failure_reason`
- `GET /videos/:slug/thumbnail` retorna `302`, e o destino responde um JPEG
- `GET /videos/:slug/status` sem token retorna `401` e de outro usuário retorna `403`

---

### SI-03.9 — Fluxo completo de upload a processamento

**Route:** POST /videos/:slug/upload/complete
**Test Specs:** see `nestjs-project/specs/videos-processing-flow.plan.md`
**Authorization:** Owner

**Description:** Prova upload, fila, worker e storage juntos, contra os serviços reais do Compose.

**Technical actions:**

1. Regenerar `nestjs-project/openapi.json` com `npm run openapi:export`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `exportSpec` | Integration: rotas de vídeo no documento | `src/openapi-export.integration-spec.ts` |

**Dependencies:** SI-03.7, SI-03.8

**Acceptance criteria:**

- Um upload real termina em `ready` com thumbnail, sem chamar o worker diretamente
- Um vídeo que chegou a `ready` tem `metadata` e `thumbnail_key` gravados no banco
- Um arquivo inválido enviado pelo mesmo fluxo termina em `failed`, sem thumbnail
- `GET /videos/:slug/status` de um arquivo inválido retorna `failure_reason: "INVALID_VIDEO_FILE"`
- `GET /videos/:slug` de um vídeo `failed` retorna `404`
- `openapi.json` documenta todas as rotas de `### API Contracts`

---

### SI-03.10 — Documentação de IA e diagrama

**Description:** Mantém a documentação coerente com o código entregue.

**Technical actions:**

1. Atualizar `CLAUDE.md` da raiz: fila definida, worker e estrutura atual
2. Atualizar `nestjs-project/CLAUDE.md`: seção de vídeos, serviços, endpoints, variáveis e testes
3. Trocar a fila `TBD` por `BullMQ/Redis` em `docs/diagrams/software-arch.mermaid`
4. Atualizar `nestjs-project/api.http` com o fluxo de upload

**Tests:** _(empty — documentação; verificada pela Definition of Done final)_

**Dependencies:** SI-03.9

**Acceptance criteria:**

- Todo arquivo, endpoint e variável citados na seção de vídeos existem no código
- Nenhum documento do projeto descreve a fila como `TBD`

---

## Technical Specifications

### Data Model

#### Video

Tabela `videos` (per `phase-03-videos/TD-03`, `phase-03-videos/TD-05`, `phase-03-videos/TD-06`, `phase-03-videos/TD-08`).

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | uuid | PK, gerado na aplicação; compõe `storage_key` e `jobId` |
| `channel_id` | uuid | FK → `channels.id`, not null |
| `slug` | varchar(11) | unique, not null; identificador da URL única |
| `title` | varchar(255) | not null; padrão: nome do arquivo sem extensão |
| `status` | enum `videos_status_enum` | not null, default `draft`; valores `draft`, `processing`, `ready`, `failed` |
| `storage_key` | varchar | not null; `videos/{id}/original{ext}` |
| `thumbnail_key` | varchar | null; `videos/{id}/thumbnail.jpg` |
| `upload_id` | varchar | null, `select: false`; id do multipart, limpo ao concluir |
| `original_filename` | varchar(255) | not null; usado no download |
| `content_type` | varchar(100) | not null; declarado no pré-cadastro |
| `size_bytes` | bigint | not null; transformado para `number` |
| `duration_seconds` | numeric(12,3) | null; transformado para `number` |
| `metadata` | jsonb | null; `width`, `height`, `video_codec`, `audio_codec`, `bitrate`, `frame_rate`, `format_name` |
| `failure_reason` | varchar(50) | null; `INVALID_VIDEO_FILE`, `PROCESSING_ERROR`, `ENQUEUE_FAILED` |
| `created_at` | timestamp | not null; `@CreateDateColumn` |
| `updated_at` | timestamp | not null; `@UpdateDateColumn` |

**Relations:** `Channel` has many `Video` (one-to-many)
**Indexes:** unique on `slug`; index on `channel_id`

**Status transitions** (per `phase-03-videos/TD-08`): `draft → processing → ready`; `processing → failed`; `processing → draft` quando o storage recusa a conclusão. Toda transição é condicional ao status atual. `failed` é terminal: mantém o arquivo original, sem nova tentativa nem remoção pela API.

### API Contracts

#### POST /videos (SI-03.4)

**Request headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request body:**
- filename: string, required — não vazio, até 255 caracteres
- size_bytes: integer, required — mínimo 1
- content_type: string, required — não vazio, até 100 caracteres
- title: string, optional — não vazio, até 255 caracteres

**Response 201:**
- id: string (uuid)
- slug: string
- status: `draft`
- part_size_bytes: integer
- part_count: integer

**Error responses:**
- 400 VALIDATION_ERROR: when the request body fails schema validation
- 401: when the access token is missing or invalid
- 404 CHANNEL_NOT_FOUND: when the user has no channel
- 413 VIDEO_TOO_LARGE: when `size_bytes` exceeds `VIDEO_MAX_SIZE_BYTES`
- 415 UNSUPPORTED_VIDEO_TYPE: when `content_type` has no `video/` prefix
- 429: when the default rate limit is exceeded

---

#### POST /videos/:slug/upload/parts (SI-03.5)

**Request headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request body:**
- part_numbers: integer[], required — 1 a 100 itens, cada um maior ou igual a 1

**Response 200:**
- parts: `{ part_number: integer, url: string }[]`
- expires_in: integer — `3600` segundos (per `phase-03-videos/TD-13`)

**Error responses:**
- 400 VALIDATION_ERROR: when the request body fails schema validation
- 400 VIDEO_PART_OUT_OF_RANGE: when a part number exceeds `part_count`
- 401: when the access token is missing or invalid
- 403 VIDEO_ACCESS_DENIED: when the user does not own the video
- 404 VIDEO_NOT_FOUND: when the slug does not exist
- 409 VIDEO_UPLOAD_CLOSED: when the video is not in `draft`

---

#### GET /videos/:slug/upload/parts (SI-03.5)

**Request headers:**
- Authorization: Bearer token

**Response 200:**
- parts: `{ part_number: integer, etag: string, size_bytes: integer }[]`

**Error responses:**
- 401: when the access token is missing or invalid
- 403 VIDEO_ACCESS_DENIED: when the user does not own the video
- 404 VIDEO_NOT_FOUND: when the slug does not exist
- 409 VIDEO_UPLOAD_CLOSED: when the video is not in `draft`
- 409 VIDEO_UPLOAD_EXPIRED: when the storage no longer knows the multipart (per `phase-03-videos/TD-11`)

---

#### POST /videos/:slug/upload/complete (SI-03.6)

**Request headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request body:**
- parts: `{ part_number: integer, etag: string }[]`, required — 1 a 10.000 itens; `part_number` maior ou igual a 1, `etag` não vazio

**Response 202:**
- slug: string
- status: `processing`

**Error responses:**
- 400 VALIDATION_ERROR: when the request body fails schema validation
- 401: when the access token is missing or invalid
- 403 VIDEO_ACCESS_DENIED: when the user does not own the video
- 404 VIDEO_NOT_FOUND: when the slug does not exist
- 409 VIDEO_UPLOAD_CLOSED: when the video is not in `draft`, or a concurrent completion won
- 409 VIDEO_UPLOAD_EXPIRED: when the storage no longer knows the multipart (per `phase-03-videos/TD-11`)
- 422 VIDEO_UPLOAD_INCOMPLETE: when the parts do not match the declared file, or the storage rejects them
- 503 VIDEO_PROCESSING_UNAVAILABLE: when the job cannot be published

---

#### DELETE /videos/:slug/upload (SI-03.6)

**Request headers:**
- Authorization: Bearer token

**Response 204:** No content.

**Error responses:**
- 401: when the access token is missing or invalid
- 403 VIDEO_ACCESS_DENIED: when the user does not own the video
- 404 VIDEO_NOT_FOUND: when the slug does not exist
- 409 VIDEO_UPLOAD_CLOSED: when the video is not in `draft`

---

#### GET /videos/:slug (SI-03.8)

**Response 200:**
- slug: string
- title: string
- status: `ready`
- duration_seconds: number
- metadata: `{ width, height, video_codec, audio_codec, bitrate, frame_rate, format_name }`, cada campo anulável (per `phase-03-videos/TD-05`)
- size_bytes: integer
- created_at: string (ISO-8601)

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the slug does not exist or the video is not `ready`

---

#### GET /videos/:slug/status (SI-03.8)

**Request headers:**
- Authorization: Bearer token

**Response 200:**
- id: string (uuid)
- slug: string
- title: string
- status: `draft | processing | ready | failed`
- failure_reason: string | null
- duration_seconds: number | null
- has_thumbnail: boolean
- created_at: string (ISO-8601)
- updated_at: string (ISO-8601)

**Error responses:**
- 401: when the access token is missing or invalid
- 403 VIDEO_ACCESS_DENIED: when the user does not own the video
- 404 VIDEO_NOT_FOUND: when the slug does not exist

---

#### GET /videos/:slug/stream (SI-03.8)

**Response 302:** header `Location` com URL assinada válida por 4h (per `phase-03-videos/TD-13`). O storage responde `Range` com `206 Partial Content` (per `phase-03-videos/TD-07`).

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the slug does not exist or the video is not `ready`

---

#### GET /videos/:slug/download (SI-03.8)

**Response 302:** header `Location` com URL assinada válida por 4h; o storage responde com `Content-Disposition: attachment` (per `phase-03-videos/TD-07`, `phase-03-videos/TD-13`).

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the slug does not exist or the video is not `ready`

---

#### GET /videos/:slug/thumbnail (SI-03.8)

**Response 302:** header `Location` com URL assinada válida por 4h para o JPEG gerado (per `phase-03-videos/TD-07`, `phase-03-videos/TD-13`).

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the slug does not exist or the video is not `ready`

### Authorization Matrix

| Endpoint | Anonymous | Authenticated | Owner |
|----------|-----------|---------------|-------|
| POST /videos | ✗ | ✓ | ✓ |
| POST /videos/:slug/upload/parts | ✗ | ✗ | ✓ |
| GET /videos/:slug/upload/parts | ✗ | ✗ | ✓ |
| POST /videos/:slug/upload/complete | ✗ | ✗ | ✓ |
| DELETE /videos/:slug/upload | ✗ | ✗ | ✓ |
| GET /videos/:slug/status | ✗ | ✗ | ✓ |
| GET /videos/:slug | ✓ | ✓ | ✓ |
| GET /videos/:slug/stream | ✓ | ✓ | ✓ |
| GET /videos/:slug/download | ✓ | ✓ | ✓ |
| GET /videos/:slug/thumbnail | ✓ | ✓ | ✓ |

Owner é o usuário cujo canal é `videos.channel_id`. As rotas públicas só atendem vídeo `ready` (per `phase-03-videos/TD-07`).

### Error Catalog

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| CHANNEL_NOT_FOUND | 404 | Usuário sem canal |
| VIDEO_NOT_FOUND | 404 | Vídeo inexistente, ou fora de `ready` em rota pública |
| VIDEO_ACCESS_DENIED | 403 | Usuário não é o dono do vídeo |
| VIDEO_TOO_LARGE | 413 | `size_bytes` acima de `VIDEO_MAX_SIZE_BYTES` |
| UNSUPPORTED_VIDEO_TYPE | 415 | `content_type` sem o prefixo `video/` |
| VIDEO_PART_OUT_OF_RANGE | 400 | Parte acima de `part_count` |
| VIDEO_UPLOAD_CLOSED | 409 | Upload fora de `draft`, ou conclusão concorrente perdida |
| VIDEO_UPLOAD_EXPIRED | 409 | Multipart desconhecido pelo storage ao listar ou concluir; `DELETE` tolera este caso (per `phase-03-videos/TD-11`) |
| VIDEO_UPLOAD_INCOMPLETE | 422 | Partes divergem do arquivo declarado, ou o storage responde `EntityTooSmall`, `InvalidPart` ou `InvalidPartOrder` |
| VIDEO_PROCESSING_UNAVAILABLE | 503 | Publicação do job falhou |

Formato de erro herdado: `{ statusCode, error, message }` (per `phase-02-auth/TD-07`).

### Events/Messages

#### video-processing / process-video

**Payload:**

```json
{ "videoId": "uuid" }
```

**Producer:** `VideoQueueService` (per `phase-03-videos/TD-01`)
**Consumer:** `VideoProcessor` no serviço `video-worker`
**Trigger:** transição `draft → processing` em `POST /videos/:slug/upload/complete`
**Delivery semantics:** at-least-once; o `jobId` igual ao `id` do vídeo e a transição condicional tornam a reentrega inofensiva (per `phase-03-videos/TD-08`)
**Job options:** `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`, `removeOnComplete: true`, `removeOnFail: 100`

---

## Dependency Map

SI-03.1 (root)
├── SI-03.2 — depends on SI-03.1 (storage precisa do MinIO e da configuração)
│   └── SI-03.4 — depends on SI-03.2, SI-03.3 (pré-cadastro usa storage e entidade)
│       └── SI-03.5 — depends on SI-03.4 (partes exigem vídeo em draft)
│           └── SI-03.6 — depends on SI-03.5 (conclusão consome as partes)
│               └── SI-03.7 — depends on SI-03.6 (worker consome o job publicado)
│                   └── SI-03.8 — depends on SI-03.6, SI-03.7 (leitura exige vídeo processado)
│                       └── SI-03.9 — depends on SI-03.7, SI-03.8 (fluxo completo)
│                           └── SI-03.10 — depends on SI-03.9 (documenta o estado final)
└── SI-03.3 — depends on SI-03.1 (entidade nasce com a infraestrutura de testes)

---

## Deliverables

- [x] SI-03.1 — Infraestrutura: storage, fila, worker e configuração
- [x] SI-03.2 — Serviço de storage
- [x] SI-03.3 — Entidade Video e migration
- [x] SI-03.4 — Pré-cadastro e início do upload
- [x] SI-03.5 — Assinatura e retomada de partes
- [x] SI-03.6 — Conclusão do upload e enfileiramento
- [x] SI-03.7 — Worker de vídeo
- [x] SI-03.8 — Leitura pública, streaming e download
- [x] SI-03.9 — Fluxo completo de upload a processamento
- [x] SI-03.10 — Documentação de IA e diagrama

**Full test suites:**

- [x] Backend tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test`)
- [x] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [x] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [x] Lint passes (`cd nestjs-project && docker compose exec nestjs-api npm run lint`)
- [x] Project builds successfully (`cd nestjs-project && docker compose exec nestjs-api npm run build`)
