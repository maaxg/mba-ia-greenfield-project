---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.4
target_file: test/videos.e2e-spec.ts
---

# POST /videos — Test Plan

## Application Overview

Registra o vídeo como rascunho, gera a URL única e abre o multipart no storage, sem receber nenhum byte do arquivo.

## Test Scenarios

### 1. POST /videos

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 1.1. register-draft-with-unique-slug

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos com `filename`, `size_bytes` de 100 MiB e `content_type: video/mp4`
    - expect: HTTP 201
    - expect: `slug` com 11 caracteres base62
    - expect: `status` igual a `draft`
    - expect: `part_size_bytes` igual a 67108864 e `part_count` igual a 2

#### 1.2. accept-10-gib-limit

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos com `size_bytes` de 10737418240
    - expect: HTTP 201
    - expect: `part_count` igual a 160

#### 1.3. require-authentication

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos sem token
    - expect: HTTP 401

#### 1.4. reject-file-above-limit

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos com `size_bytes` de 10737418241
    - expect: HTTP 413
    - expect: `error` igual a `VIDEO_TOO_LARGE`

#### 1.5. reject-non-video-file

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos com `content_type: text/plain`
    - expect: HTTP 415
    - expect: `error` igual a `UNSUPPORTED_VIDEO_TYPE`

#### 1.6. validate-request-body

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos só com `filename`
    - expect: HTTP 400
    - expect: `error` igual a `VALIDATION_ERROR`

#### 1.7. generate-different-slugs

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. POST /videos duas vezes com o mesmo corpo
    - expect: os dois `slug`s são diferentes
