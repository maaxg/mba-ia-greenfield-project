---
kind: phase
name: phase-03-videos
status: clean
issue_count: 0
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-10-30T09:55:52-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-30T09:55:52-03:00"
issues:
  - id: AMB-1
    status: resolved
    summary: "Vídeo ready é acessível por URL antes do fluxo de publicação da Fase 04?"
    resolved_by: "phase-03-videos/TD-07"
  - id: AMB-2
    status: resolved
    summary: "status draft da Fase 03 confunde-se com rascunho editorial da Fase 04"
    resolved_by: "phase-03-videos/TD-08"
  - id: MD-1
    status: resolved
    summary: "Destino de uploads abandonados não está decidido"
    resolved_by: "phase-03-videos/TD-02"
  - id: MD-2
    status: resolved
    summary: "Provisionamento do bucket não está decidido"
    resolved_by: "phase-03-videos/TD-03"
  - id: DG-1
    status: resolved
    summary: "ChannelsService não expõe busca de canal por usuário"
    resolved_by: "action: SI do pré-cadastro adiciona findByUserId"
  - id: DG-2
    status: resolved
    summary: "Dockerfile.dev não instala FFmpeg, exigido por TD-04, TD-05 e TD-10"
    resolved_by: "phase-03-videos/TD-04"
  - id: DG-3
    status: resolved
    summary: "API e worker colidem em dist/ com deleteOutDir no modo watch"
    resolved_by: "phase-03-videos/TD-04"
  - id: ICC-1
    status: resolved
    summary: "Throttler global (10/min) bloqueia assinatura de partes e streaming"
    resolved_by: "phase-03-videos/TD-07"
  - id: ICC-2
    status: resolved
    summary: "S3_PUBLIC_ENDPOINT=localhost contraria a regra de Docker Networking"
    resolved_by: "phase-03-videos/TD-09"
  - id: ICC-3
    status: resolved
    summary: "Channel.videos quebra ALL_ENTITIES e cleanAllTables das specs da Fase 02"
    resolved_by: "phase-03-videos/TD-10"
  - id: OQ-1
    status: resolved
    summary: "TD-01 pending — fila"
    resolved_by: "phase-03-videos/TD-01"
  - id: OQ-2
    status: resolved
    summary: "TD-02 pending — upload de até 10GB"
    resolved_by: "phase-03-videos/TD-02"
  - id: OQ-3
    status: resolved
    summary: "TD-03 pending — storage"
    resolved_by: "phase-03-videos/TD-03"
  - id: OQ-4
    status: resolved
    summary: "TD-04 pending — execução do worker"
    resolved_by: "phase-03-videos/TD-04"
  - id: OQ-5
    status: resolved
    summary: "TD-05 pending — metadados e thumbnail"
    resolved_by: "phase-03-videos/TD-05"
  - id: OQ-6
    status: resolved
    summary: "TD-06 pending — URL única"
    resolved_by: "phase-03-videos/TD-06"
  - id: OQ-7
    status: resolved
    summary: "TD-07 pending — streaming e download"
    resolved_by: "phase-03-videos/TD-07"
  - id: OQ-8
    status: resolved
    summary: "TD-08 pending — ciclo de status"
    resolved_by: "phase-03-videos/TD-08"
  - id: OQ-9
    status: resolved
    summary: "TD-09 pending — chaves de ambiente e limites"
    resolved_by: "phase-03-videos/TD-09"
  - id: OQ-10
    status: resolved
    summary: "TD-10 pending — teste do fluxo assíncrono"
    resolved_by: "phase-03-videos/TD-10"
advisories: []
---

# phase-03-videos — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._

### Dependency Gaps

_None._

### Inherited Constraint Conflicts

_None._

### Unresolved Open Questions

_None._

### UI Coverage Gaps

_None._

## Resolved Issues

- **AMB-1** _(resolved_by phase-03-videos/TD-07)_ — Vídeo ready é acessível por URL antes do fluxo de publicação da Fase 04?.
- **AMB-2** _(resolved_by phase-03-videos/TD-08)_ — status draft da Fase 03 confunde-se com rascunho editorial da Fase 04.
- **MD-1** _(resolved_by phase-03-videos/TD-02)_ — Destino de uploads abandonados não está decidido.
- **MD-2** _(resolved_by phase-03-videos/TD-03)_ — Provisionamento do bucket não está decidido.
- **DG-1** _(resolved_by action: SI do pré-cadastro adiciona findByUserId)_ — ChannelsService não expõe busca de canal por usuário.
- **DG-2** _(resolved_by phase-03-videos/TD-04)_ — Dockerfile.dev não instala FFmpeg, exigido por TD-04, TD-05 e TD-10.
- **DG-3** _(resolved_by phase-03-videos/TD-04)_ — API e worker colidem em dist/ com deleteOutDir no modo watch.
- **ICC-1** _(resolved_by phase-03-videos/TD-07)_ — Throttler global (10/min) bloqueia assinatura de partes e streaming.
- **ICC-2** _(resolved_by phase-03-videos/TD-09)_ — S3_PUBLIC_ENDPOINT=localhost contraria a regra de Docker Networking.
- **ICC-3** _(resolved_by phase-03-videos/TD-10)_ — Channel.videos quebra ALL_ENTITIES e cleanAllTables das specs da Fase 02.
- **OQ-1** _(resolved_by phase-03-videos/TD-01)_ — TD-01 pending — fila.
- **OQ-2** _(resolved_by phase-03-videos/TD-02)_ — TD-02 pending — upload de até 10GB.
- **OQ-3** _(resolved_by phase-03-videos/TD-03)_ — TD-03 pending — storage.
- **OQ-4** _(resolved_by phase-03-videos/TD-04)_ — TD-04 pending — execução do worker.
- **OQ-5** _(resolved_by phase-03-videos/TD-05)_ — TD-05 pending — metadados e thumbnail.
- **OQ-6** _(resolved_by phase-03-videos/TD-06)_ — TD-06 pending — URL única.
- **OQ-7** _(resolved_by phase-03-videos/TD-07)_ — TD-07 pending — streaming e download.
- **OQ-8** _(resolved_by phase-03-videos/TD-08)_ — TD-08 pending — ciclo de status.
- **OQ-9** _(resolved_by phase-03-videos/TD-09)_ — TD-09 pending — chaves de ambiente e limites.
- **OQ-10** _(resolved_by phase-03-videos/TD-10)_ — TD-10 pending — teste do fluxo assíncrono.
