---
libs:
  bullmq:
    version: "^6.5.1"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-10-30T09:50:00-03:00"
  "@nestjs/bullmq":
    version: "^12.0.0"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-10-30T09:50:00-03:00"
  "@aws-sdk/client-s3":
    version: "^3.1160.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-10-30T09:50:00-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "^3.1160.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-10-30T09:50:00-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-30T09:55:52-03:00"
---

# phase-03-videos — Library References

Documentação destilada das bibliotecas decididas nesta fase. Consultada no Context7 pela API REST pública, porque o servidor MCP não estava carregado na sessão. O projeto instalou as versões acima; o Context7 lista `bullmq` até `v6.3.11` e `aws-sdk-js-v3` até `v3.1153.0`, portanto a API foi conferida também pela compilação (`tsc`) contra os pacotes instalados.

### bullmq

**Source:** `/taskforcesh/bullmq` (Context7). Maps to `phase-03-videos/TD-01`.

- `Worker` aceita `concurrency`; `Queue.add(name, data, opts)` aceita `attempts`, `backoff: { type: 'exponential', delay }`, `jobId`, `removeOnComplete` e `removeOnFail`.
- Lançar `UnrecoverableError` move o job direto para `failed`, ignorando as tentativas restantes.
- O `jobId` identifica o job; não é reenfileirado se já existir com o mesmo id.

```typescript
import { UnrecoverableError } from 'bullmq';

throw new UnrecoverableError('Unrecoverable');
```

### @nestjs/bullmq

**Source:** `/taskforcesh/bullmq`, guia NestJS. Maps to `phase-03-videos/TD-01`.

```typescript
BullModule.forRootAsync({ inject: [...], useFactory: (cfg) => ({ connection: { host, port } }) });
BullModule.registerQueue({ name: 'video-processing' });

constructor(@InjectQueue('video-processing') private readonly queue: Queue) {}

@Processor('video-processing')
class VideoProcessor extends WorkerHost {
  async process(job: Job<ProcessVideoJob>): Promise<void> {}

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {}
}
```

### @aws-sdk/client-s3

**Source:** `/aws/aws-sdk-js-v3` (Context7). Maps to `phase-03-videos/TD-02`, `TD-03`.

- Comandos usados: `CreateMultipartUploadCommand`, `UploadPartCommand`, `ListPartsCommand`, `CompleteMultipartUploadCommand`, `AbortMultipartUploadCommand`, `GetObjectCommand`, `PutObjectCommand`, `HeadObjectCommand`.
- MinIO exige `forcePathStyle: true`.
- Limites do multipart ([AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)): até 10.000 partes; cada parte de 5 MiB a 5 GiB, exceto a última, que não tem mínimo.

### @aws-sdk/s3-request-presigner

**Source:** `/aws/aws-sdk-js-v3` (Context7). Maps to `phase-03-videos/TD-02`, `TD-05`, `TD-07`.

```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const url = await getSignedUrl(client, command, { expiresIn: 3600 });
```

`getSignedUrl` assina com o `endpoint` do cliente recebido; o host entra na assinatura. Por isso a URL entregue ao cliente sai de um `S3Client` configurado com `S3_PUBLIC_ENDPOINT` (`phase-03-videos/TD-09`).
