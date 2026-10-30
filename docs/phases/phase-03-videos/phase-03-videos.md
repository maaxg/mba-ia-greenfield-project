---
kind: phase
name: phase-03-videos
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-10-30T09:55:52-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-10-30T09:55:52-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-30T09:55:52-03:00"
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
3. Adicionar ao `compose.yaml` os serviços `redis` (`noeviction`, sem porta no host), `minio` (`pgsty/minio`, volume nomeado, healthcheck), `minio-init` (cria `S3_BUCKET`) e `video-worker` (`npm run start:worker`) (per `phase-03-videos/TD-01`, `phase-03-videos/TD-03`, `phase-03-videos/TD-04`)
4. Criar `src/config/storage.config.ts`, `src/config/queue.config.ts` e `src/config/video.config.ts`; estender `env.validation.ts`, `.env.example` e `AppModule` (per `phase-03-videos/TD-09`)
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
2. Implementar `createMultipartUpload`, `presignUploadPart`, `listParts`, `completeMultipartUpload` e `abortMultipartUpload` (per `phase-03-videos/TD-02`)
3. Implementar `putObject`, `presignGetObject` para o cliente e `presignInternalGetObject` para o worker (per `phase-03-videos/TD-05`, `phase-03-videos/TD-07`)
4. Converter `NoSuchUpload` do S3 em `VideoUploadExpiredException` (per `phase-03-videos/TD-02`)
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

1. Adicionar `findByUserId` a `ChannelsService` e `ChannelNotFoundException` (resolve DG-1)
2. Criar `src/videos/slug.util.ts` com base62 de 11 caracteres via `crypto.randomInt` (per `phase-03-videos/TD-06`)
3. Adicionar as exceções de vídeo a `domain.exception.ts` conforme `### Error Catalog`
4. Criar `VideosService.initiateUpload`: valida tamanho e tipo, cria `draft`, retenta colisão de slug e compensa removendo o rascunho se o storage falhar (per `phase-03-videos/TD-02`, `phase-03-videos/TD-08`)
5. Criar `VideosController` com `POST /videos`, `InitiateUploadDto` e respostas OpenAPI; `@SkipThrottle()` na classe, mantendo o limite neste método (per `phase-03-videos/TD-07`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `generateSlug` | Unit: tamanho, alfabeto, distribuição | `src/videos/slug.util.spec.ts` |
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

---

### SI-03.5 — Assinatura e retomada de partes

**Route:** POST /videos/:slug/upload/parts
**Test Specs:** see `nestjs-project/specs/videos.plan.md`
**Authorization:** Owner

**Description:** Entrega URLs de partes e informa o que já foi enviado, viabilizando a retomada.

**Technical actions:**

1. Implementar `VideosService.getOwnedVideo`, verificando o dono pelo canal do usuário (per `### Authorization Matrix`)
2. Implementar `signUploadParts`, recusando parte fora de `1..part_count` e vídeo fora de `draft` (per `phase-03-videos/TD-02`)
3. Implementar `listUploadedParts` (per `phase-03-videos/TD-02`)
4. Adicionar `POST` e `GET /videos/:slug/upload/parts` com `SignUploadPartsDto` e OpenAPI

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` | Unit: dono, status, faixa de partes | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: partes reais no MinIO | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.4

**Acceptance criteria:**

- `POST /videos/:slug/upload/parts` com `part_numbers: [1, 2]` retorna `200` com duas URLs
- `POST /videos/:slug/upload/parts` com `part_numbers: [999]` retorna `400` com `VIDEO_PART_OUT_OF_RANGE`
- `POST /videos/:slug/upload/parts` de outro usuário retorna `403` com `VIDEO_ACCESS_DENIED`
- `GET /videos/:slug/upload/parts` lista só as partes já enviadas, com `etag` e `size_bytes`
- Mais de 10 requisições de assinatura por minuto não retornam `429`

---

### SI-03.6 — Conclusão do upload e enfileiramento

**Route:** POST /videos/:slug/upload/complete
**Test Specs:** see `nestjs-project/specs/videos.plan.md`
**Authorization:** Owner

**Description:** Fecha o multipart, muda o status de forma atômica e publica o job; também cancela uploads.

**Technical actions:**

1. Criar `src/queue/queue.module.ts` com `BullModule.forRootAsync` e `registerQueue`, e `src/videos/video-queue.service.ts` publicando o job de `### Events/Messages` (per `phase-03-videos/TD-01`)
2. Implementar `completeUpload`: confere partes e tamanho, faz a transição `draft → processing`, completa no storage e reverte para `draft` se ele falhar (per `phase-03-videos/TD-08`)
3. Publicar o job e, se a publicação falhar, ir a `failed` com `ENQUEUE_FAILED` (per `phase-03-videos/TD-08`)
4. Implementar `cancelUpload`: aborta o multipart e remove o rascunho (per `phase-03-videos/TD-02`)
5. Adicionar `POST /videos/:slug/upload/complete` e `DELETE /videos/:slug/upload` com `CompleteUploadDto` e OpenAPI

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` | Unit: partes divergentes, reversão, `ENQUEUE_FAILED` | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: corrida de conclusão, Redis e MinIO reais | `src/videos/videos.service.integration-spec.ts` |
| `QueueModule` | Unit: compilation test | `src/queue/queue.module.spec.ts` |

**Dependencies:** SI-03.5

**Acceptance criteria:**

- `POST /videos/:slug/upload/complete` com partes corretas retorna `202` com `status: "processing"`
- O job `process-video` fica na fila com `jobId` igual ao `id` do vídeo
- Soma das partes diferente de `size_bytes` retorna `422` com `VIDEO_UPLOAD_INCOMPLETE` e o vídeo segue `draft`
- Duas conclusões simultâneas resultam em um `202` e um `409` com `VIDEO_UPLOAD_CLOSED`
- `DELETE /videos/:slug/upload` retorna `204` e o vídeo deixa de existir
- `DELETE /videos/:slug/upload` de vídeo em `processing` retorna `409` com `VIDEO_UPLOAD_CLOSED`

---

### SI-03.7 — Worker de vídeo

**Description:** Consome a fila em processo separado, extrai metadados, gera a thumbnail e fecha o ciclo de status.

**Technical actions:**

1. Criar `src/video-worker/ffmpeg.service.ts` com `spawn`, timeout, `probe` e `extractFrame` (per `phase-03-videos/TD-05`)
2. Criar `src/video-worker/video-processing.service.ts`: ignora vídeo fora de `processing`, grava metadados e thumbnail, e transiciona para `ready` (per `phase-03-videos/TD-05`, `phase-03-videos/TD-08`)
3. Criar `src/video-worker/video.processor.ts`: traduz arquivo inválido em `UnrecoverableError` e marca `failed` ao esgotar tentativas (per `phase-03-videos/TD-08`)
4. Extrair `src/database/database.module.ts` de `AppModule` para reuso no worker (per `phase-03-videos/TD-04`)
5. Criar `src/video-worker/video-worker.module.ts` e `src/worker.ts` com `NestFactory.createApplicationContext`, mais o script `start:worker` (per `phase-03-videos/TD-04`)

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
**Test Specs:** see `nestjs-project/specs/videos.plan.md`
**Authorization:** Mixed

**Description:** Expõe o vídeo pronto na URL única e redireciona o consumo de bytes ao storage.

**Technical actions:**

1. Implementar `getPublicVideo`, que só retorna vídeos `ready`, e `getVideoStatus` para o dono (per `phase-03-videos/TD-07`, `phase-03-videos/TD-08`)
2. Implementar `getStreamUrl`, `getDownloadUrl` com `Content-Disposition: attachment` e `getThumbnailUrl` (per `phase-03-videos/TD-07`)
3. Adicionar `GET /videos/:slug`, `/stream`, `/download` e `/thumbnail` com `@Public()`, e `GET /videos/:slug/status` autenticado
4. Criar os DTOs de resposta com `@ApiProperty`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` | Unit: visibilidade por status | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: URLs assinadas válidas | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.6

**Acceptance criteria:**

- `GET /videos/:slug` anônimo de vídeo `ready` retorna `200` sem expor chaves de storage
- `GET /videos/:slug` de vídeo fora de `ready` retorna `404` com `VIDEO_NOT_FOUND`
- `GET /videos/:slug/stream` retorna `302`, e a URL de destino responde `206` a uma requisição com `Range`
- `GET /videos/:slug/download` retorna `302`, e o destino responde com `Content-Disposition: attachment`
- `GET /videos/:slug/status` do dono retorna `200` em qualquer status, incluindo `failure_reason`

---

### SI-03.9 — Fluxo completo (cross-layer)

**Description:** Prova upload, fila, worker, storage e streaming juntos, contra os serviços reais do Compose.
**Test Specs:** see `nestjs-project/specs/videos.plan.md`

**Technical actions:**

1. Criar `src/test/video-fixture.ts`, gerando MP4 com `ffmpeg -f lavfi` (per `phase-03-videos/TD-10`)
2. Criar `test/videos.e2e-spec.ts` com os cenários de `nestjs-project/specs/videos.plan.md`, aguardando o `video-worker` real (per `phase-03-videos/TD-10`)
3. Regenerar `nestjs-project/openapi.json` com `npm run openapi:export`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `exportSpec` | Integration: rotas de vídeo no documento | `src/openapi-export.integration-spec.ts` |

**Dependencies:** SI-03.7, SI-03.8

**Acceptance criteria:**

- Um upload real termina em `ready` com thumbnail, sem chamar o worker diretamente
- Um arquivo inválido enviado pelo mesmo fluxo termina em `failed`
- Duas criações de vídeo geram `slug`s diferentes
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

Tabela `videos` (per `phase-03-videos/TD-03`, `phase-03-videos/TD-06`, `phase-03-videos/TD-08`).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Gerado no banco; usado na chave de storage e no `jobId` |
| `channel_id` | uuid | FK → `channels.id`, NOT NULL, indexado | Dono do vídeo |
| `slug` | varchar(11) | UNIQUE, NOT NULL | Identificador da URL única |
| `title` | varchar(255) | NOT NULL | Padrão: nome do arquivo sem extensão |
| `status` | enum `videos_status_enum` | NOT NULL, default `draft` | `draft`, `processing`, `ready`, `failed` |
| `storage_key` | varchar | NOT NULL | `videos/{id}/original{ext}` |
| `thumbnail_key` | varchar | NULL | `videos/{id}/thumbnail.jpg` |
| `upload_id` | varchar | NULL, `select: false` | Id do multipart; limpo ao concluir |
| `original_filename` | varchar(255) | NOT NULL | Usado no download |
| `content_type` | varchar(100) | NOT NULL | Declarado no pré-cadastro |
| `size_bytes` | bigint | NOT NULL | Transformado para `number` |
| `duration_seconds` | numeric(12,3) | NULL | Transformado para `number` |
| `metadata` | jsonb | NULL | `width`, `height`, `video_codec`, `audio_codec`, `bitrate`, `frame_rate`, `format_name` |
| `failure_reason` | varchar(50) | NULL | `INVALID_VIDEO_FILE`, `PROCESSING_ERROR`, `ENQUEUE_FAILED` |
| `created_at` | timestamp | NOT NULL | `@CreateDateColumn` |
| `updated_at` | timestamp | NOT NULL | `@UpdateDateColumn` |

**Status transitions** (per `phase-03-videos/TD-08`): `draft → processing → ready`; `processing → failed`; `processing → draft` apenas quando o storage recusa a conclusão.

### API Contracts

#### POST /videos (SI-03.4)

**Request body:**
- filename: string, required — até 255 caracteres
- size_bytes: integer, required — mínimo 1
- content_type: string, required — até 100 caracteres
- title: string, optional — até 255 caracteres

**Response 201:**
- id: string (uuid)
- slug: string
- status: `draft`
- part_size_bytes: integer
- part_count: integer

**Error responses:**
- 400 VALIDATION_ERROR, 401, 404 CHANNEL_NOT_FOUND, 413 VIDEO_TOO_LARGE, 415 UNSUPPORTED_VIDEO_TYPE, 429

---

#### POST /videos/:slug/upload/parts (SI-03.5)

**Request body:**
- part_numbers: integer[], required — 1 a 100 itens

**Response 200:**
- parts: `{ part_number: integer, url: string }[]`
- expires_in: integer (segundos)

**Error responses:**
- 400 VALIDATION_ERROR, 400 VIDEO_PART_OUT_OF_RANGE, 401, 403 VIDEO_ACCESS_DENIED, 404 VIDEO_NOT_FOUND, 409 VIDEO_UPLOAD_CLOSED

---

#### GET /videos/:slug/upload/parts (SI-03.5)

**Response 200:**
- parts: `{ part_number: integer, etag: string, size_bytes: integer }[]`

**Error responses:**
- 401, 403 VIDEO_ACCESS_DENIED, 404 VIDEO_NOT_FOUND, 409 VIDEO_UPLOAD_CLOSED, 409 VIDEO_UPLOAD_EXPIRED

---

#### POST /videos/:slug/upload/complete (SI-03.6)

**Request body:**
- parts: `{ part_number: integer, etag: string }[]`, required — 1 a 10.000 itens

**Response 202:**
- slug: string
- status: `processing`

**Error responses:**
- 400 VALIDATION_ERROR, 401, 403 VIDEO_ACCESS_DENIED, 404 VIDEO_NOT_FOUND, 409 VIDEO_UPLOAD_CLOSED, 409 VIDEO_UPLOAD_EXPIRED, 422 VIDEO_UPLOAD_INCOMPLETE, 503 VIDEO_PROCESSING_UNAVAILABLE

---

#### DELETE /videos/:slug/upload (SI-03.6)

**Response 204:** sem corpo.

**Error responses:**
- 401, 403 VIDEO_ACCESS_DENIED, 404 VIDEO_NOT_FOUND, 409 VIDEO_UPLOAD_CLOSED

---

#### GET /videos/:slug (SI-03.8)

**Response 200:**
- slug, title: string
- status: `ready`
- duration_seconds: number
- metadata: object
- size_bytes: integer
- created_at: string (ISO-8601)

**Error responses:**
- 404 VIDEO_NOT_FOUND

---

#### GET /videos/:slug/status (SI-03.8)

**Response 200:**
- id, slug, title: string
- status: `draft | processing | ready | failed`
- failure_reason: string | null
- duration_seconds: number | null
- has_thumbnail: boolean
- created_at, updated_at: string (ISO-8601)

**Error responses:**
- 401, 403 VIDEO_ACCESS_DENIED, 404 VIDEO_NOT_FOUND

---

#### GET /videos/:slug/stream, /download, /thumbnail (SI-03.8)

**Response 302:** header `Location` com URL assinada no storage. O storage responde `Range` com `206 Partial Content`.

**Error responses:**
- 404 VIDEO_NOT_FOUND

### Authorization Matrix

| Endpoint | Anonymous | Authenticated | Owner |
|----------|-----------|---------------|-------|
| `POST /videos` | 401 | Allowed | — |
| `POST`, `GET /videos/:slug/upload/parts` | 401 | 403 | Allowed |
| `POST /videos/:slug/upload/complete` | 401 | 403 | Allowed |
| `DELETE /videos/:slug/upload` | 401 | 403 | Allowed |
| `GET /videos/:slug/status` | 401 | 403 | Allowed |
| `GET /videos/:slug`, `/stream`, `/download`, `/thumbnail` | Allowed (`ready`) | Allowed (`ready`) | Allowed (`ready`) |

Owner é o usuário cujo canal é `videos.channel_id`.

### Error Catalog

| Scenario | errorCode | HTTP | Message |
|----------|-----------|------|---------|
| Usuário sem canal | `CHANNEL_NOT_FOUND` | 404 | Channel not found |
| Vídeo inexistente ou indisponível | `VIDEO_NOT_FOUND` | 404 | Video not found |
| Usuário não é o dono | `VIDEO_ACCESS_DENIED` | 403 | You do not own this video |
| Tamanho acima do limite | `VIDEO_TOO_LARGE` | 413 | Video exceeds the maximum allowed size |
| Tipo não é `video/*` | `UNSUPPORTED_VIDEO_TYPE` | 415 | Only video files are accepted |
| Parte fora de `1..part_count` | `VIDEO_PART_OUT_OF_RANGE` | 400 | Part number is out of range |
| Upload já encerrado | `VIDEO_UPLOAD_CLOSED` | 409 | Video upload is already closed |
| Multipart desconhecido no storage | `VIDEO_UPLOAD_EXPIRED` | 409 | Video upload no longer exists |
| Partes divergem do declarado | `VIDEO_UPLOAD_INCOMPLETE` | 422 | Uploaded parts do not match the declared file |
| Fila indisponível | `VIDEO_PROCESSING_UNAVAILABLE` | 503 | Video processing is temporarily unavailable |

Formato de erro herdado: `{ statusCode, error, message }` (per `phase-02-auth/TD-07`).

### Events/Messages

#### video-processing / process-video

**Payload:**

```json
{ "videoId": "uuid" }
```

**Producer:** `VideoQueueService` (per `phase-03-videos/TD-01`)
**Consumer:** `VideoProcessor` no serviço `video-worker` (per `phase-03-videos/TD-04`)
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
│               ├── SI-03.7 — depends on SI-03.6 (worker consome o job publicado)
│               └── SI-03.8 — depends on SI-03.6 (leitura exige vídeo processável)
│                   └── SI-03.9 — depends on SI-03.7, SI-03.8 (fluxo completo)
│                       └── SI-03.10 — depends on SI-03.9 (documenta o estado final)
└── SI-03.3 — depends on SI-03.1 (entidade nasce com a infraestrutura de testes)

---

## Deliverables

- [ ] SI-03.1 — Infraestrutura: storage, fila, worker e configuração
- [ ] SI-03.2 — Serviço de storage
- [ ] SI-03.3 — Entidade Video e migration
- [ ] SI-03.4 — Pré-cadastro e início do upload
- [ ] SI-03.5 — Assinatura e retomada de partes
- [ ] SI-03.6 — Conclusão do upload e enfileiramento
- [ ] SI-03.7 — Worker de vídeo
- [ ] SI-03.8 — Leitura pública, streaming e download
- [ ] SI-03.9 — Fluxo completo (cross-layer)
- [ ] SI-03.10 — Documentação de IA e diagrama

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test`)
- [ ] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`cd nestjs-project && docker compose exec nestjs-api npm run lint`)
