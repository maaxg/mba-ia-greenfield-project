---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.8
target_file: test/videos-stream.e2e-spec.ts
---

# Leitura de vídeos — Test Plan

## Application Overview

Expõe o vídeo pronto na URL única e redireciona streaming, download e thumbnail para URLs assinadas do storage. Exige o `video-worker` real, que leva o vídeo a `ready`.

## Test Scenarios

### 1. GET /videos/:slug

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 1.1. serve-video-anonymously

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. GET /videos/:slug sem token, com o vídeo em `ready`
    - expect: HTTP 200
    - expect: `status` igual a `ready`
    - expect: `duration_seconds` próximo da duração da fixture
    - expect: `metadata.video_codec` igual a `h264`
    - expect: corpo sem `storage_key`, `thumbnail_key`, `upload_id` e `channel`

### 2. GET /videos/:slug/thumbnail

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 2.1. serve-generated-thumbnail

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. GET /videos/:slug/thumbnail
    - expect: HTTP 302
  2. GET na URL de `Location`
    - expect: `content-type` igual a `image/jpeg`
    - expect: bytes iniciais de JPEG

### 3. GET /videos/:slug/stream

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 3.1. stream-partial-content

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. GET /videos/:slug/stream
    - expect: HTTP 302
  2. GET na URL de `Location` com `Range: bytes=0-1023`
    - expect: HTTP 206
    - expect: `content-range` coerente com o tamanho do arquivo
    - expect: `content-type` igual a `video/mp4`

### 4. GET /videos/:slug/download

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 4.1. download-as-attachment

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. GET /videos/:slug/download
    - expect: HTTP 302
  2. GET na URL de `Location`
    - expect: `content-disposition` igual a `attachment; filename="clip.mp4"`
    - expect: corpo com o tamanho completo do arquivo

### 5. Rotas públicas fora de ready

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 5.1. hide-video-that-is-not-ready

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. GET /videos/:slug com o vídeo em `draft`
    - expect: HTTP 404
    - expect: `error` igual a `VIDEO_NOT_FOUND`
  2. GET em `/stream`, `/download` e `/thumbnail`
    - expect: HTTP 404 nas três rotas

### 6. GET /videos/:slug/status

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 6.1. require-owner-on-status-route

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. GET /videos/:slug/status sem token
    - expect: HTTP 401
  2. GET /videos/:slug/status com o token do outro usuário
    - expect: HTTP 403
