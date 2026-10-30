---
kind: phase
name: phase-03-videos
status: dirty
issue_count: 20
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-10-30T09:53:51-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-30T09:53:29-03:00"
issues:
  - id: AMB-1
    status: open
    summary: "Vídeo ready é acessível por URL antes do fluxo de publicação da Fase 04?"
  - id: AMB-2
    status: open
    summary: "status draft da Fase 03 confunde-se com rascunho editorial da Fase 04"
  - id: MD-1
    status: open
    summary: "Destino de uploads abandonados não está decidido"
  - id: MD-2
    status: open
    summary: "Provisionamento do bucket não está decidido"
  - id: DG-1
    status: open
    summary: "ChannelsService não expõe busca de canal por usuário"
  - id: DG-2
    status: open
    summary: "Dockerfile.dev não instala FFmpeg, exigido por TD-04, TD-05 e TD-10"
  - id: DG-3
    status: open
    summary: "API e worker colidem em dist/ com deleteOutDir no modo watch"
  - id: ICC-1
    status: open
    summary: "Throttler global (10/min) bloqueia assinatura de partes e streaming"
  - id: ICC-2
    status: open
    summary: "S3_PUBLIC_ENDPOINT=localhost contraria a regra de Docker Networking"
  - id: ICC-3
    status: open
    summary: "Channel.videos quebra ALL_ENTITIES e cleanAllTables das specs da Fase 02"
  - id: OQ-1
    status: open
    summary: "TD-01 pending — tecnologia da fila"
  - id: OQ-2
    status: open
    summary: "TD-02 pending — upload de até 10GB"
  - id: OQ-3
    status: open
    summary: "TD-03 pending — organização do storage"
  - id: OQ-4
    status: open
    summary: "TD-04 pending — execução do worker"
  - id: OQ-5
    status: open
    summary: "TD-05 pending — metadados e thumbnail"
  - id: OQ-6
    status: open
    summary: "TD-06 pending — URL única"
  - id: OQ-7
    status: open
    summary: "TD-07 pending — streaming e download"
  - id: OQ-8
    status: open
    summary: "TD-08 pending — ciclo de status"
  - id: OQ-9
    status: open
    summary: "TD-09 pending — chaves de ambiente e limites"
  - id: OQ-10
    status: open
    summary: "TD-10 pending — teste do fluxo assíncrono"
advisories: []
---

# phase-03-videos — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

- **AMB-1** — "Reprodução via streaming" e "URL única" não dizem quem acessa um vídeo pronto, e o "Fluxo de rascunho → publicação" só chega na Fase 04. Explicit choice: definir o acesso a vídeos `ready` nesta fase sem antecipar a Fase 04.
- **AMB-2** — "Pré-cadastro automático do vídeo como rascunho" (Fase 03) e "Fluxo de rascunho → publicação" (Fase 04) usam a mesma palavra. Se `status` carregar os dois sentidos, a Fase 04 terá de reescrever o ciclo. Explicit choice: delimitar o que `draft` significa em TD-08.

### Missing Decisions

- **MD-1** — TD-02 cobre a retomada, mas não o que acontece com multipart abandonado. A documentação consultada não confirma limpeza automática no MinIO. Explicit choice: definir como o cliente cancela e como a API reage a um upload que não existe mais no storage.
- **MD-2** — TD-03 define um bucket, mas ninguém o cria. Explicit choice: decidir entre serviço de inicialização no Compose e criação pela aplicação.

### Dependency Gaps

- **DG-1** — `src/channels/channels.service.ts` só tem `createChannel`, e o JWT carrega `sub` e `email`. O pré-cadastro precisa do canal do usuário. Explicit choice: adicionar a busca por usuário em `ChannelsService`, dono da entidade `Channel`.
- **DG-2** — `Dockerfile.dev` instala apenas `procps` e `curl`. Explicit choice: decidir onde o FFmpeg é instalado, considerando que TD-10 gera a fixture dentro do container onde o Jest roda.
- **DG-3** — `nest-cli.json` usa `deleteOutDir: true`. Dois processos `nest start --watch` no mesmo volume apagam o `dist/` um do outro. Explicit choice: definir como o worker é executado em desenvolvimento.

### Inherited Constraint Conflicts

- **ICC-1** — `phase-02-auth/TD-08` registra `ThrottlerGuard` via `APP_GUARD`, portanto global, com 10 req/min. Upload de 10GB exige lotes de assinatura e cada espectador gera redirects, o que resultaria em 429. Explicit choice: definir quais rotas de vídeo são isentas.
- **ICC-2** — TD-09 sugere `S3_PUBLIC_ENDPOINT` com `localhost`, e o `CLAUDE.md` proíbe `localhost` como host de serviço. Explicit choice: registrar a exceção e como os testes dentro do container alcançam a URL assinada.
- **ICC-3** — `@OneToMany` em `Channel`, exigido por `nestjs-entities.md`, torna `Video` obrigatória em todos os `ALL_ENTITIES`, e a FK impede o `DELETE FROM channels` de `cleanAllTables`. Explicit choice: atualizar as specs existentes no SI da entidade.

### Unresolved Open Questions

- **OQ-1** — TD-01 pending — tecnologia da fila. Resolution: fill the **Decision:** field of TD-01, then re-run /plan-validate phase-03-videos.
- **OQ-2** — TD-02 pending — upload de até 10GB. Resolution: fill the **Decision:** field of TD-02, then re-run /plan-validate phase-03-videos.
- **OQ-3** — TD-03 pending — organização do storage. Resolution: fill the **Decision:** field of TD-03, then re-run /plan-validate phase-03-videos.
- **OQ-4** — TD-04 pending — execução do worker. Resolution: fill the **Decision:** field of TD-04, then re-run /plan-validate phase-03-videos.
- **OQ-5** — TD-05 pending — metadados e thumbnail. Resolution: fill the **Decision:** field of TD-05, then re-run /plan-validate phase-03-videos.
- **OQ-6** — TD-06 pending — URL única. Resolution: fill the **Decision:** field of TD-06, then re-run /plan-validate phase-03-videos.
- **OQ-7** — TD-07 pending — streaming e download. Resolution: fill the **Decision:** field of TD-07, then re-run /plan-validate phase-03-videos.
- **OQ-8** — TD-08 pending — ciclo de status. Resolution: fill the **Decision:** field of TD-08, then re-run /plan-validate phase-03-videos.
- **OQ-9** — TD-09 pending — chaves de ambiente e limites. Resolution: fill the **Decision:** field of TD-09, then re-run /plan-validate phase-03-videos.
- **OQ-10** — TD-10 pending — teste do fluxo assíncrono. Resolution: fill the **Decision:** field of TD-10, then re-run /plan-validate phase-03-videos.

### UI Coverage Gaps

_None._

## Resolved Issues

_No issues resolved yet._
