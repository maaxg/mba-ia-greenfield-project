---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-10-30
scope_description: "Upload de até 10GB, fila e worker de vídeo, thumbnail, URL única, streaming e download sobre object storage S3-compatível"
---

# Technical Decisions — Fase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — recebe o módulo de vídeos, o worker, a infraestrutura de storage e fila, a migration e os testes.
- `next-frontend/` — sem decisão aberta: a interface de vídeo está fora do escopo do desafio desta fase. Os contratos de TD-02 e TD-07 são `Cross-layer` porque o cliente futuro os consumirá, mas nenhum arquivo do frontend é alterado.

_Autoria das decisões:_ o usuário delegou as escolhas ao agente na etapa de `plan-resolve` ("vai fundo"); todas seguem a recomendação registrada em cada TD.

_Fontes consultadas:_ documentação via Context7 (`/taskforcesh/bullmq`, `/aws/aws-sdk-js-v3`, `/minio/minio`, `/minio/mc`), [limites de multipart do S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html), [página npm do fluent-ffmpeg](https://npmjs.com/package/fluent-ffmpeg) e verificação direta de disponibilidade de imagens com `docker pull`.

---

## TD-01: Tecnologia da fila de processamento

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** O `docs/project-plan.md` e o `CLAUDE.md` deixam a fila como "TBD". É a principal decisão de stack da fase: define um serviço novo no Compose, a biblioteca e a semântica de retry que TD-08 usa.

**Options:**

### Option A: BullMQ + Redis
- Fila sobre Redis com integração oficial `@nestjs/bullmq` (`@Processor`, `WorkerHost`, `@OnWorkerEvent`).
- **Pros:** retries com backoff, `UnrecoverableError`, detecção de jobs travados e deduplicação por `jobId` já prontos; mesma linguagem e mesmo DI do projeto; Redis servirá a outras fases.
- **Cons:** adiciona um serviço; o Redis precisa de `maxmemory-policy noeviction`, senão jobs podem ser descartados.

### Option B: pg-boss (PostgreSQL)
- Usa o Postgres já existente como fila via `SKIP LOCKED`.
- **Pros:** nenhum serviço novo; enfileiramento pode entrar na mesma transação do banco.
- **Cons:** sem integração oficial com NestJS; acopla a carga da fila ao banco principal; integração e DI próprios para escrever e testar.

### Option C: RabbitMQ
- Broker AMQP dedicado, via `@nestjs/microservices` ou `amqplib`.
- **Pros:** roteamento rico, padrão consolidado para múltiplos consumidores.
- **Cons:** retry com backoff exige exchanges de atraso/DLQ manuais; mais infraestrutura para um único tipo de job.

**Recommendation:** Option A (BullMQ + Redis) — a fase tem um único tipo de job, e o que importa é retry, backoff e falha terminal, que o BullMQ entrega prontos com integração oficial NestJS 11; pg-boss evitaria um container, mas custaria DI manual e misturaria fila e dados no mesmo Postgres. O que se perde é a atomicidade entre banco e fila, tratada em TD-08.

**Decision:** A (BullMQ + Redis)


**Note:** Redis roda com `maxmemory-policy noeviction` e sem porta publicada no host: só a rede Compose o acessa.

**Libraries:** `bullmq@^6.5.1`, `@nestjs/bullmq@^11.0.5`, `ioredis@^5`

**Revisions:**
- 2026-10-30 — `@nestjs/bullmq` fixado em `^11.0.5` em vez de `^12.0.0`. Rationale: a linha 12 é publicada só em ESM e o Jest do projeto, em CommonJS, não a carrega; a 11 é a linha do Nest 11 instalado e aceita `bullmq` 6.
- 2026-10-30 — `ioredis` adicionado como dependência direta. Rationale: no `bullmq` 6 ele é opcional e sem ele nenhuma conexão com Redis abre.
---

## TD-02: Estratégia de upload de arquivos de até 10GB

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** Passar 10GB pela API seguraria conexões e memória, e é reprovação automática no desafio. O `docs/project-plan.md` (Pontos de Atenção) também pede retomada após falha de conexão. Afeta os dois lados porque o handshake vive no cliente e na API.

**Options:**

### Option A: Multipart S3 direto ao storage com URLs pré-assinadas
- A API abre o multipart e assina URLs por parte; o cliente faz `PUT` de cada parte no storage e confirma com a lista de `ETag`s.
- **Pros:** bytes nunca passam pela API; retomada nativa via `ListParts`; paralelismo por parte; funciona igual em MinIO e S3.
- **Cons:** handshake de vários passos; o cliente precisa ler o `ETag` (CORS); o tamanho real só é verificável na confirmação.

### Option B: Protocolo tus (`@tus/server`)
- Servidor tus recebe chunks e grava no S3.
- **Pros:** protocolo padrão de retomada, com clientes prontos.
- **Cons:** os bytes passam por um servidor nosso, o que preserva o gargalo; mais um componente.

### Option C: Streaming pela API até o S3
- A API faz pipe do corpo da requisição para `Upload` do S3.
- **Pros:** cliente trivial (`POST` único).
- **Cons:** uma conexão presa por upload, sem retomada; é o caminho que o enunciado descarta.

**Recommendation:** Option A (Multipart pré-assinado) — é a única opção em que a API nunca vê os bytes, e a retomada vem de `ListParts` sem estado adicional. Perde-se simplicidade no cliente: são quatro chamadas em vez de uma. Limites: 10.000 partes e mínimo de 5 MiB por parte, exceto a última.

**Decision:** A (Multipart S3 direto ao storage com URLs pré-assinadas)


**Note:** Resolve MD-1: `DELETE /videos/:slug/upload` aborta o multipart e remove o rascunho; se o storage não conhecer mais o upload, a API responde `409 VIDEO_UPLOAD_EXPIRED`. Limpeza automática de uploads abandonados fica fora desta fase.

**Libraries:** `@aws-sdk/client-s3@^3.1160.0`, `@aws-sdk/s3-request-presigner@^3.1160.0`
---

## TD-03: Organização do object storage

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** O storage é dado (S3/MinIO); falta decidir como usá-lo. Verificado em 2026-10-30: `minio/minio` não existe mais no Docker Hub e `quay.io/minio/*` não respondeu; o repositório community foi arquivado em fevereiro de 2026. O fork `pgsty/minio` publica imagens e mantém a mesma API S3.

**Options:**

### Option A: Bucket único privado com prefixo por vídeo
- `S3_BUCKET` privado com chaves `videos/{videoId}/original{ext}` e `videos/{videoId}/thumbnail.jpg`; todo acesso por URL assinada.
- **Pros:** apagar um vídeo é apagar um prefixo; uma política só; uma variável só.
- **Cons:** uma política de ciclo de vida não diferencia original e thumbnail sem filtro por sufixo.

### Option B: Dois buckets (`videos` e `thumbnails`)
- Originais privados; thumbnails com leitura pública.
- **Pros:** thumbnail servida sem assinatura, cacheável em CDN.
- **Cons:** duas políticas; thumbnail de vídeo em rascunho ficaria pública; duas chaves para sincronizar ao apagar.

**Recommendation:** Option A (Bucket único privado) — na Fase 03 não há tráfego que justifique CDN, e privado por padrão evita expor conteúdo de rascunho antes da Fase 04 definir visibilidade. Perde-se a thumbnail cacheável sem assinatura.

**Decision:** A (Bucket único privado com prefixo por vídeo)


**Note:** Resolve MD-2: o serviço one-shot `minio-init` cria o bucket com `mc` antes da API e do worker subirem. Imagens fixadas: `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` e `pgsty/mc:RELEASE.2026-10-26T00-00-00Z`.

**Libraries:** —
---

## TD-04: Como o worker de vídeo roda

**Scope:** Repo-wide

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** O diagrama de arquitetura trata o Video Worker como container próprio. Decide-se onde está o código e como o processo sobe.

**Options:**

### Option A: Container separado, mesmo código-fonte
- Serviço `video-worker` no Compose, com entrypoint próprio (`src/worker.ts`) usando `NestFactory.createApplicationContext` e um módulo só de worker.
- **Pros:** reaproveita entidades, config e storage; sem HTTP nem guards; escala independente da API.
- **Cons:** a imagem de desenvolvimento precisa de FFmpeg; o build compartilha dependências com a API.

### Option B: Pacote/projeto separado
- Novo subprojeto `video-worker/` com `package.json` próprio.
- **Pros:** imagem mínima e isolamento total.
- **Cons:** duplica entidade e config, ou exige monorepo de pacotes, decisão que o projeto ainda não tomou.

### Option C: Processador dentro da API
- `@Processor` registrado no `AppModule`.
- **Pros:** nenhum container novo.
- **Cons:** FFmpeg concorre com requisições HTTP; contraria o requisito de worker separado.

**Recommendation:** Option A (Container separado, mesmo código) — mantém uma fonte única de `Video` e `StorageService`, respeita o isolamento pedido pelo diagrama e evita inventar um monorepo. Perde-se imagem mínima, aceitável porque a imagem de produção só existe na Fase 07.

**Decision:** A (Container separado, mesmo código-fonte)


**Note:** Resolve DG-2: FFmpeg entra no `Dockerfile.dev`, compartilhado por `nestjs-api` e `video-worker`, porque a fixture de TD-10 é gerada no container do Jest. Resolve DG-3: o worker roda com `ts-node` em `npm run start:worker`, sem `nest start --watch`, para não disputar `dist/` com a API.

**Libraries:** —
---

## TD-05: Extração de metadados e geração de thumbnail

**Scope:** Backend

**Capability:** Transversal — covers: Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** Baixar 10GB para o disco do worker a cada job é caro. `ffprobe` e `ffmpeg` leem HTTP com Range. A biblioteca `fluent-ffmpeg` está marcada como descontinuada no npm.

**Options:**

### Option A: `child_process.spawn` de ffprobe/ffmpeg lendo URL assinada
- O worker gera uma URL GET assinada e passa como entrada. O `ffprobe` devolve JSON; o `ffmpeg` extrai um frame e o resultado vai ao storage.
- **Pros:** sem biblioteca descontinuada; lê só os trechos necessários; sem arquivo de 10GB em disco.
- **Cons:** é preciso tratar códigos de saída, timeout e stderr manualmente.

### Option B: `fluent-ffmpeg`
- Wrapper fluente sobre os binários.
- **Pros:** API conhecida.
- **Cons:** descontinuado no npm; não resolve a questão de leitura remota.

### Option C: Baixar para disco temporário e processar
- Copia o objeto para `/tmp` e roda FFmpeg local.
- **Pros:** imune a instabilidade de rede durante a leitura.
- **Cons:** exige disco do tamanho do maior vídeo por job concorrente.

**Recommendation:** Option A (spawn com URL assinada) — zero dependência morta e custo de disco constante mesmo para 10GB; a fragilidade de rede é coberta pelos retries de TD-08. Perde-se a conveniência de um wrapper. Frame da thumbnail: 10% da duração, para evitar a tela preta inicial comum.

**Decision:** A (`child_process.spawn` de ffprobe/ffmpeg lendo URL assinada)


**Libraries:** —
---

## TD-06: Estratégia de URL única

**Scope:** Cross-layer

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** O `docs/project-plan.md` pede URL curta que nunca conflite. O identificador aparece na URL pública consumida pelo frontend.

**Options:**

### Option A: Slug aleatório base62 de 11 caracteres
- Gerado com `crypto.randomInt` no pré-cadastro, com constraint `UNIQUE` e nova tentativa em colisão.
- **Pros:** curto; não enumerável (62^11 ≈ 5,2 × 10^19); sem dependência; a constraint garante a unicidade.
- **Cons:** não descreve o conteúdo; precisa de retry.

### Option B: UUID na URL
- Reusa o `id` da tabela.
- **Pros:** zero código.
- **Cons:** não é uma URL curta, contrariando o plano.

### Option C: Slug derivado do título + sufixo
- `meu-video-a1b2`.
- **Pros:** legível, com ganho de SEO.
- **Cons:** o título é editável na Fase 04, o que quebraria links ou desalinharia URL e conteúdo.

**Recommendation:** Option A (base62 de 11 caracteres) — atende "curta e sem conflito" com a garantia no banco, e não depende de título editável. Perde-se legibilidade na URL.

**Decision:** A (Slug aleatório base62 de 11 caracteres)


**Note:** Todas as rotas de vídeo usam o slug como identificador externo; o UUID fica interno.

**Libraries:** —
---

## TD-07: Streaming e download

**Scope:** Cross-layer

**Capability:** Transversal — covers: Reprodução via streaming (sem necessidade de download completo); Download do vídeo pelo usuário

**Context:** O diagrama define `Frontend → Object Storage: Streams`. O S3 e o MinIO já respondem `Range` com `206 Partial Content`.

**Options:**

### Option A: Redirect 302 para URL assinada
- `GET /videos/:slug/stream` responde 302 para um GET assinado; o player segue e faz Range direto no storage. O download usa o mesmo fluxo com `response-content-disposition: attachment`.
- **Pros:** segue o diagrama; a API não carrega os bytes; 206 nativo.
- **Cons:** a URL assinada tem validade; a resposta 206 vem do storage, não da API.

### Option B: Proxy na API com Range manual
- A API repassa `Range` ao storage e transmite o corpo.
- **Pros:** URL do storage fica oculta; controle total.
- **Cons:** cada espectador consome conexão e banda da API, o oposto do que TD-02 evita.

### Option C: HLS com transcodificação
- O worker gera segmentos e playlists.
- **Pros:** bitrate adaptativo.
- **Cons:** multiplica o custo de CPU e armazenamento; a fase pede extração de metadados, não transcodificação.

**Recommendation:** Option A (302 para URL assinada) — alinhada ao diagrama e sem custo de banda na API, com Range entregue pelo próprio storage. Perde-se a ocultação da URL do storage e o bitrate adaptativo, que nenhum requisito da fase exige.

**Decision:** A (Redirect 302 para URL assinada)


**Note:** Resolve AMB-1: nesta fase, vídeo `ready` é acessível a qualquer pessoa com a URL, inclusive anônimos, e não há listagem. Visibilidade fica para a Fase 04. Resolve ICC-1: `VideosController` usa `@SkipThrottle()`, e só `POST /videos` mantém o limite padrão.

**Libraries:** —
---

## TD-08: Ciclo de status e tratamento de falhas

**Scope:** Cross-layer

**Capability:** Transversal — covers: Pré-cadastro automático do vídeo como rascunho ao iniciar o upload; Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** Depende de TD-01. O status aparece na API e o worker o altera de forma assíncrona. Precisa definir o que ocorre com falha de processamento e com a perda de atomicidade entre banco e fila.

**Options:**

### Option A: Quatro estados com transições condicionais
- `draft → processing → ready | failed`. Transições via `UPDATE ... WHERE status = <esperado>`. Três tentativas com backoff exponencial; arquivo inválido falha sem retry; esgotadas as tentativas, `failed` com `failure_reason`.
- **Pros:** poucos estados, alinhados ao enunciado; idempotente com reentrega de job; corrida de `complete` resolvida no banco.
- **Cons:** "upload em andamento" e "rascunho" são o mesmo estado; `failed` é terminal nesta fase.

### Option B: Estados granulares
- `draft`, `uploading`, `uploaded`, `queued`, `processing`, `ready`, `failed`.
- **Pros:** observabilidade fina.
- **Cons:** mais transições a proteger sem requisito que as consuma.

### Option C: Outbox transacional
- Option A com tabela de outbox e publicador para eliminar a janela entre banco e fila.
- **Pros:** nenhum job perdido em queda entre `UPDATE` e enfileiramento.
- **Cons:** tabela e processo novos para uma janela de milissegundos; falha do Redis já é detectável na chamada.

**Recommendation:** Option A (Quatro estados com transições condicionais) — é o ciclo pedido e a condição no `UPDATE` resolve concorrência sem lock. Se o enfileiramento falhar, o vídeo vai a `failed` com motivo. Perde-se a garantia de entrega do outbox; aceitável porque a falha é observável, não silenciosa.

**Decision:** A (Quatro estados com transições condicionais)


**Note:** Resolve AMB-2: `status` descreve o ciclo técnico do arquivo. `draft` significa "aguardando conclusão do upload"; a publicação editorial da Fase 04 será um campo próprio, sem alterar este ciclo.

**Libraries:** —
---

## TD-09: Chaves de ambiente e limites de upload

**Scope:** Repo-wide

**Capability:** Transversal — covers: Serviço de armazenamento de arquivos (vídeos e thumbnails); Serviço de processamento em segundo plano (filas); Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** As chaves são citadas no Joi, no `.env.example`, no `compose.yaml` e nos serviços, portanto são contrato entre componentes. Regra do projeto: sempre o nome do serviço Compose como host. Porém a URL assinada é consumida fora da rede Docker, e a assinatura SigV4 inclui o host.

**Options:**

### Option A: Dois endpoints S3 e limites configuráveis
- `S3_ENDPOINT=http://minio:9000` para chamadas de servidor e `S3_PUBLIC_ENDPOINT` só para assinar URLs. Limites: `VIDEO_MAX_SIZE_BYTES` (10 GiB) e `VIDEO_PART_SIZE_BYTES` (64 MiB).
- **Pros:** respeita a regra de Docker para tráfego interno e gera URLs válidas para o cliente; troca para S3 real só por ambiente.
- **Cons:** duas variáveis parecidas; testes dentro do container precisam assinar com host alcançável.

### Option B: Endpoint único com alias de rede
- Fazer `minio` resolver também no host.
- **Pros:** uma variável.
- **Cons:** exige editar `/etc/hosts` de cada máquina.

**Recommendation:** Option A (Dois endpoints) — mantém a regra do projeto no tráfego interno e não exige configuração na máquina do desenvolvedor. Parte de 64 MiB gera cerca de 160 partes para 10 GiB, longe do limite de 10.000. Perde-se a simplicidade de uma variável só.

**Decision:** A (Dois endpoints S3 e limites configuráveis)


**Note:** Resolve ICC-2: `S3_PUBLIC_ENDPOINT` é a exceção documentada à regra de Docker Networking, porque é consumido pelo cliente, fora da rede Compose. Os testes rodam dentro do container e usam o valor de `S3_ENDPOINT` para assinar.

**Libraries:** —
---

## TD-10: Estratégia de teste do fluxo assíncrono

**Scope:** Repo-wide

**Capability:** Transversal — covers: Serviço de processamento em segundo plano (filas); Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** Regra do desafio: não simular o que dá para rodar na infra do Compose. O e2e precisa provar upload, fila, worker e storage juntos, com um vídeo real e pequeno.

**Options:**

### Option A: E2E contra o worker real do Compose, com fixture gerada por FFmpeg
- A suíte gera um MP4 curto com `ffmpeg -f lavfi`, faz upload real e aguarda o status mudar pelo serviço `video-worker`.
- **Pros:** exercita a integração de verdade; sem binário no repositório.
- **Cons:** depende do worker estar no ar e atualizado; polling alonga a suíte.

### Option B: Worker embutido no processo de teste
- O e2e sobe o módulo do worker dentro do Jest.
- **Pros:** não depende do container.
- **Cons:** não prova o container; concorre com o worker real pela mesma fila.

**Recommendation:** Option A (Worker real do Compose) — é o único formato que prova que os serviços sobem e conversam. Testes de integração chamam o serviço de processamento direto para cobrir ramos de falha sem fila. Perde-se autonomia do teste em relação ao Compose.

**Decision:** A (E2E contra o worker real do Compose, com fixture gerada por FFmpeg)


**Note:** Resolve ICC-3: o SI da entidade adiciona `Video` a todos os `ALL_ENTITIES`, a `cleanAllTables` e ao spec de migrations.

**Libraries:** —
---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Backend | Tecnologia da fila | BullMQ + Redis | A |
| TD-02 | Cross-layer | Upload de até 10GB | Multipart pré-assinado direto ao storage | A |
| TD-03 | Backend | Organização do storage | Bucket único privado com prefixo por vídeo | A |
| TD-04 | Repo-wide | Execução do worker | Container separado, mesmo código | A |
| TD-05 | Backend | Metadados e thumbnail | spawn de ffprobe/ffmpeg com URL assinada | A |
| TD-06 | Cross-layer | URL única | Slug base62 de 11 caracteres | A |
| TD-07 | Cross-layer | Streaming e download | 302 para URL assinada | A |
| TD-08 | Cross-layer | Ciclo de status e falhas | Quatro estados com transições condicionais | A |
| TD-09 | Repo-wide | Chaves de ambiente e limites | Dois endpoints S3, limites configuráveis | A |
| TD-10 | Repo-wide | Teste do fluxo assíncrono | E2E contra o worker real do Compose | A |
