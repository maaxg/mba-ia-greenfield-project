---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.6
target_file: test/videos-upload-complete.e2e-spec.ts
---

# Conclusão e cancelamento do upload — Test Plan

## Application Overview

Fecha o multipart e publica o job de processamento, ou cancela o upload e remove o rascunho.

## Test Scenarios

### 1. POST /videos/:slug/upload/complete

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 1.1. reject-parts-that-do-not-cover-file

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/complete com uma parte menor que `size_bytes`
    - expect: HTTP 422
    - expect: `error` igual a `VIDEO_UPLOAD_INCOMPLETE`
  2. GET /videos/:slug/status
    - expect: `status` continua `draft`

#### 1.2. validate-request-body

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/complete com `part_number` não numérico e sem `etag`
    - expect: HTTP 400
    - expect: `error` igual a `VALIDATION_ERROR`

#### 1.3. deny-another-user

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/complete com o token do outro usuário
    - expect: HTTP 403
    - expect: `error` igual a `VIDEO_ACCESS_DENIED`

#### 1.4. refuse-second-completion

**Covers AC:** #1, #9
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/complete com as partes corretas
    - expect: HTTP 202
  2. POST /videos/:slug/upload/complete de novo
    - expect: HTTP 409
    - expect: `error` igual a `VIDEO_UPLOAD_CLOSED`

### 2. DELETE /videos/:slug/upload

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 2.1. cancel-draft

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. DELETE /videos/:slug/upload
    - expect: HTTP 204
  2. GET /videos/:slug/status
    - expect: HTTP 404

#### 2.2. refuse-to-cancel-video-in-processing

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. Definir `status` como `processing` direto no banco, sem publicar job
    - expect: o worker não altera o vídeo durante o teste
  2. DELETE /videos/:slug/upload
    - expect: HTTP 409
    - expect: `error` igual a `VIDEO_UPLOAD_CLOSED`
  3. GET /videos/:slug/status
    - expect: `status` continua `processing`
