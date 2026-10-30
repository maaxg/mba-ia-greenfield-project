# Videos — Test Plan

**Last sync:** 2026-10-30
**Source:** `docs/phases/phase-03-videos/phase-03-videos.md` (SI-03.4, SI-03.5, SI-03.6, SI-03.8, SI-03.9)
**Target:** `nestjs-project/test/videos.e2e-spec.ts`

## Preconditions

- Stack do Compose no ar, incluindo `video-worker`.
- Usuário confirmado autenticado por token real; um segundo usuário para os casos de dono.
- MP4 pequeno gerado com `ffmpeg -f lavfi`.

## Scenarios

### 1. Pré-cadastro — POST /videos

1. Com dados válidos: `201`, `slug` de 11 caracteres, `status: "draft"`, `part_count` coerente.
2. Sem token: `401`.
3. Acima do limite: `413 VIDEO_TOO_LARGE`.
4. Tipo não suportado: `415 UNSUPPORTED_VIDEO_TYPE`.
5. Corpo inválido: `400 VALIDATION_ERROR`.
6. Duas criações: `slug`s diferentes.

### 2. Partes — /videos/:slug/upload/parts

1. Assinatura válida: `200` com uma URL por parte.
2. Parte fora da faixa: `400 VIDEO_PART_OUT_OF_RANGE`.
3. Outro usuário: `403 VIDEO_ACCESS_DENIED`.
4. Vídeo inexistente: `404 VIDEO_NOT_FOUND`.
5. Corpo inválido: `400 VALIDATION_ERROR`.
6. Retomada: após enviar a parte 1, `GET` a lista com `etag` e tamanho.
7. Doze assinaturas seguidas: nenhuma retorna `429`.

### 3. Conclusão — /videos/:slug/upload/complete

1. Partes incompletas: `422 VIDEO_UPLOAD_INCOMPLETE`, vídeo segue em `draft`.
2. Corpo inválido: `400 VALIDATION_ERROR`.
3. Outro usuário: `403 VIDEO_ACCESS_DENIED`.
4. Segunda conclusão: `409 VIDEO_UPLOAD_CLOSED`.

### 4. Cancelamento — DELETE /videos/:slug/upload

1. Rascunho: `204`, e o status passa a `404`.
2. Vídeo em `processing`: `409 VIDEO_UPLOAD_CLOSED`.

### 5. Fluxo completo com worker real

1. Upload real, conclusão `202`, polling em `/status` até `ready`.
2. `GET /videos/:slug` anônimo: `200`, duração e metadados, sem chaves de storage.
3. `/thumbnail`: `302`, destino é JPEG.
4. `/stream`: `302`, destino responde `206` com `Range`.
5. `/download`: `302`, destino responde `attachment`.
6. Vídeo fora de `ready`: `/stream` e `GET /videos/:slug` retornam `404`.

### 6. Falha de processamento com worker real

1. Upload de bytes que não são vídeo, polling até `failed`.
2. `/status` do dono retorna `failure_reason: "INVALID_VIDEO_FILE"`.
3. `GET /videos/:slug` retorna `404`.
