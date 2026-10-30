# phase-03-videos — Progress

**Status:** completed
**SIs:** 10/10 completed

**Definition of Done:** `npm test` 246/246; `npm run test:e2e` 95/95, em três rodadas, 43 deles de vídeo; `npx tsc --noEmit` código 0; `npm run lint` com 0 erros e 64 avisos; `npm run build` gera `dist/main.js` e `dist/worker.js`. Tudo em ambiente recriado do zero (`docker compose down -v`, sem `node_modules`, `.env` copiado do `.env.example`).

**Verificação manual a partir do host:** upload real de 10 GiB em 160 partes, direto no storage por `localhost:9000`, concluído em 263 s com a memória da API entre 590 e 690 MiB. O vídeo chegou a `ready`. Em leitura no mesmo arquivo, `Range` no byte 5.000.000.000 e no último KiB retornou `206`, o download veio como `attachment` e a thumbnail como `image/jpeg`. Com o Redis parado, a conclusão retornou `503 VIDEO_PROCESSING_UNAVAILABLE` e o vídeo ficou `failed` com `ENQUEUE_FAILED`. O arquivo de teste era um MP4 curto seguido de zeros, portanto a duração reflete o trecho real de 3 s. Um MP4 real de 30 s também foi reproduzido em navegador, com salto servido por `Range`.

### SI-03.1 — Infraestrutura: storage, fila, worker e configuração
- **Status:** completed
- **Tests:** 8 passing (env.validation.integration-spec.ts, 4 novos)
- **Observations:**
  - `src/worker.ts` nasceu como placeholder neste SI, com o script `start:worker`, para o serviço `video-worker` subir antes de SI-03.7 (commit `9f98579`).
  - `minio/minio` não pode mais ser baixada do Docker Hub e `quay.io/minio/*` não respondeu; a fase usa `pgsty/minio` e `pgsty/mc`, com versão fixada (registrado em `phase-03-videos/TD-03`).
  - A primeira versão do `video-worker` rodava `npm ci` ao subir e colidia com o `npm install` do desenvolvedor, apagando `node_modules`. O teste em ambiente limpo revelou o problema; o serviço agora só aguarda as dependências.
  - As portas `5432` e `3000` estavam ocupadas nesta máquina por outros projetos. Foram remapeadas por um `compose.override.yaml` local, fora do Git.

### SI-03.2 — Serviço de storage
- **Status:** completed
- **Tests:** 9 passing (storage.service.integration-spec.ts: 8; storage.module.spec.ts: 1)
- **Observations:**
  - Os clientes S3 usam `requestChecksumCalculation: 'WHEN_REQUIRED'` para as URLs de parte não exigirem headers de checksum do cliente.
  - As rejeições `EntityTooSmall`, `InvalidPart` e `InvalidPartOrder` do storage viram `VIDEO_UPLOAD_INCOMPLETE`. O plano original não previa isso e foi corrigido depois.
  - Os specs passaram a remover do bucket o que criam, por chave exata, depois que uma revisão das rules achou resíduos no MinIO. O bucket é o mesmo do ambiente de desenvolvimento, então nada é apagado por prefixo. Os objetos deixados antes dessa correção continuam lá.
  - As 10 exceções de `### Error Catalog` entraram aqui, junto com o storage, e não em SI-03.4 como o plano original dizia.

### SI-03.3 — Entidade Video e migration
- **Status:** completed
- **Tests:** 11 passing (video.entity.integration-spec.ts: 9; migrations.integration-spec.ts: 2)
- **Observations:**
  - `Video` entrou nos 10 `ALL_ENTITIES` existentes por causa da relação inversa em `Channel`.
  - O spec de migrations falhava em cerca de metade das execuções por deadlock: os `DROP TABLE` rodavam em paralelo e a nova FK agravou isso. Agora são sequenciais, com 10/10 execuções passando.

### SI-03.4 — Pré-cadastro e início do upload
- **Status:** completed
- **Tests:** 30 passing (videos.service.spec.ts `initiateUpload`: 11; videos.service.integration-spec.ts `initiateUpload`: 4; slug.util.spec.ts: 2; storage-key.util.spec.ts: 3; channels.service.integration-spec.ts `findByUserId`: 2; test/videos.e2e-spec.ts: 8)
- **Observations:**
  - `isPgUniqueViolationOnColumn` foi movido de `channels.service.ts` para `src/database/pg-errors.ts`, para reuso.
  - O tamanho da parte cresce automaticamente se a configuração ultrapassar 10.000 partes.

### SI-03.5 — Assinatura e retomada de partes
- **Status:** completed
- **Tests:** 18 passing (videos.service.spec.ts `signUploadParts`: 5; videos.service.integration-spec.ts `upload parts`: 1; test/videos-upload-parts.e2e-spec.ts: 12)
- **Observations:** none

### SI-03.6 — Conclusão do upload e enfileiramento
- **Status:** completed
- **Tests:** 33 passing (videos.service.spec.ts `completeUpload` e `cancelUpload`: 12; videos.service.integration-spec.ts `completeUpload` e `cancelUpload`: 8; queue.module.spec.ts: 1; videos.module.spec.ts: 1; test/videos-upload-complete.e2e-spec.ts: 11)
- **Observations:**
  - `@nestjs/bullmq` foi fixado em `^11.0.5`: a linha 12 é só ESM e não carrega no Jest. `ioredis` virou dependência direta porque o `bullmq` 6 o trata como opcional. Ambos estão em `**Revisions:**` de `phase-03-videos/TD-01`.
  - A fila é registrada em `VideosModule` com `enableOfflineQueue: false`, para responder `503` em vez de segurar a requisição com o Redis fora.
  - Os testes de integração usam fila própria, para o `video-worker` real não consumir seus jobs.
  - `videos.module.spec.ts` foi adicionado depois do fechamento da fase, por exigência do guia de testes para módulos com imports configurados.
  - A reversão para `draft`, o `ENQUEUE_FAILED` e o upload expirado ganharam testes de integração, e as rotas de upload ganharam casos de `401` e `403`, depois de uma revisão das rules do projeto.
  - O cenário de cancelamento em `processing` prepara o status direto no banco, sem publicar job, para não disputar com o worker real.

### SI-03.7 — Worker de vídeo
- **Status:** completed
- **Tests:** 21 passing (ffmpeg.service.integration-spec.ts: 5; video-processing.service.integration-spec.ts: 7; video.processor.spec.ts: 8; video-worker.module.spec.ts: 1)
- **Observations:**
  - O stderr do FFmpeg repetia a URL assinada, que ia parar nos logs. A verificação manual revelou isso; a URL agora é removida da mensagem.
  - `src/database/database.module.ts` foi extraído de `AppModule` para reuso no worker.

### SI-03.8 — Leitura pública, streaming e download
- **Status:** completed
- **Tests:** 15 passing (videos.service.spec.ts `reading`: 6; videos.service.integration-spec.ts `reading a ready video`: 2; test/videos-stream.e2e-spec.ts: 7)
- **Observations:**
  - O e2e deste SI leva o vídeo a `ready`, por isso a dependência de SI-03.7 foi adicionada ao plano.

### SI-03.9 — Fluxo completo de upload a processamento
- **Status:** completed
- **Tests:** 6 passing (test/videos-processing-flow.e2e-spec.ts: 5; openapi-export.integration-spec.ts, caso das rotas de vídeo: 1)
- **Observations:**
  - O e2e assina URLs com o host interno, então o caminho do cliente por `localhost:9000` foi verificado à parte, na verificação manual acima.
  - `openapi.json` regenerado com 10 operações de vídeo em 9 caminhos.
  - Os e2e de vídeo nasceram em um arquivo só e foram divididos em cinco, um por SI com `**Test Specs:**`, cada um com um `describe` único. As contagens de SI-03.4, SI-03.5, SI-03.6 e SI-03.8 incluem os arquivos correspondentes.

### SI-03.10 — Documentação de IA e diagrama
- **Status:** completed
- **Tests:** no tests
- **Observations:**
  - `CLAUDE.md`, `nestjs-project/CLAUDE.md`, `README.md`, `api.http` e o diagrama de arquitetura atualizados; o diagrama agora mostra o upload saindo do cliente para o storage.
  - Pendência conhecida (`phase-03-videos/TD-11`): o MinIO está configurado para expirar uploads multipart abandonados em 24h, mas essa remoção não foi observada, e a linha `draft` fica no banco.
