---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.5
target_file: test/videos-upload-parts.e2e-spec.ts
---

# /videos/:slug/upload/parts — Test Plan

## Application Overview

Entrega URLs assinadas por parte e lista o que o storage já recebeu, o que permite retomar um upload interrompido.

## Test Scenarios

### 1. POST /videos/:slug/upload/parts

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 1.1. sign-url-per-part

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/parts com `part_numbers: [1]`
    - expect: HTTP 200
    - expect: `parts` com um item
    - expect: `expires_in` igual a 3600

#### 1.2. reject-part-out-of-range

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/parts com `part_numbers: [999]`
    - expect: HTTP 400
    - expect: `error` igual a `VIDEO_PART_OUT_OF_RANGE`

#### 1.3. deny-another-user

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/parts com o token do outro usuário
    - expect: HTTP 403
    - expect: `error` igual a `VIDEO_ACCESS_DENIED`

#### 1.4. report-unknown-video

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/unknownslug/upload/parts
    - expect: HTTP 404
    - expect: `error` igual a `VIDEO_NOT_FOUND`

#### 1.5. validate-request-body

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/parts com `part_numbers: []`
    - expect: HTTP 400
    - expect: `error` igual a `VALIDATION_ERROR`

#### 1.6. do-not-rate-limit-signing

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos/:slug/upload/parts 12 vezes seguidas
    - expect: todas respondem HTTP 200

#### 1.7. require-token-to-sign-parts

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-30T18:41:07Z

**Steps:**
  1. POST /videos/:slug/upload/parts sem token
    - expect: HTTP 401

#### 1.8. reject-invalid-token-when-signing

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-30T18:41:07Z

**Steps:**
  1. POST /videos/:slug/upload/parts com um token inválido
    - expect: HTTP 401

### 2. GET /videos/:slug/upload/parts

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 2.1. list-uploaded-parts-to-resume

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. PUT da parte 1 na URL assinada
    - expect: storage responde 200 com `ETag`
  2. GET /videos/:slug/upload/parts
    - expect: HTTP 200
    - expect: `parts` traz `part_number`, `etag` e `size_bytes` da parte enviada

#### 2.2. require-token-to-list-parts

**Covers AC:** #9
**Source:** auto
**Last sync:** 2026-10-30T18:41:07Z

**Steps:**
  1. GET /videos/:slug/upload/parts sem token
    - expect: HTTP 401

#### 2.3. reject-invalid-token-when-listing

**Covers AC:** #9
**Source:** auto
**Last sync:** 2026-10-30T18:41:07Z

**Steps:**
  1. GET /videos/:slug/upload/parts com um token inválido
    - expect: HTTP 401

#### 2.4. deny-another-user-the-list

**Covers AC:** #10
**Source:** auto
**Last sync:** 2026-10-30T18:41:07Z

**Steps:**
  1. GET /videos/:slug/upload/parts com o token do outro usuário
    - expect: HTTP 403
    - expect: `error` igual a `VIDEO_ACCESS_DENIED`
