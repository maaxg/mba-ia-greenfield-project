---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.9
target_file: test/videos-processing-flow.e2e-spec.ts
---

# Fluxo de processamento com o worker real — Test Plan

## Application Overview

Prova upload, fila, worker e storage juntos: o vídeo sai de `processing` pelo `video-worker` do Compose, sem chamada direta ao worker.

## Test Scenarios

### 1. Vídeo válido

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 1.1. take-uploaded-video-to-ready

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. Upload real, POST /videos/:slug/upload/complete e polling em GET /videos/:slug/status
    - expect: `status` chega a `ready`
    - expect: `has_thumbnail` igual a `true`
    - expect: `failure_reason` igual a `null`

#### 1.2. persist-what-worker-extracted

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. Upload real até `ready` e leitura da linha em `videos`
    - expect: `thumbnail_key` igual a `videos/{id}/thumbnail.jpg`
    - expect: `metadata.width` igual à largura da fixture

### 2. Arquivo inválido

**Setup:** `setupVideosE2e` (`test/videos-e2e.helper.ts`) sobe o `AppModule` com `Test.createTestingModule`; o `beforeEach` limpa as tabelas e cria dois usuários confirmados e autenticados.

#### 2.1. fail-invalid-file-without-thumbnail

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. Upload de bytes que não são vídeo e polling até `failed`
    - expect: `status` igual a `failed`
    - expect: `has_thumbnail` igual a `false`

#### 2.2. report-failure-reason-to-owner

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. Upload de bytes que não são vídeo e polling até `failed`
    - expect: `failure_reason` igual a `INVALID_VIDEO_FILE`

#### 2.3. hide-failed-video-from-public-routes

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-30T17:25:47Z

**Steps:**
  1. GET /videos/:slug de um vídeo `failed`
    - expect: HTTP 404
