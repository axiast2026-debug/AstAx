import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * File storage (docs/adattatori.md «File (S3)»): Amazon S3 in the cloud,
 * SeaweedFS in development (ADR 0003), memory in tests. Agencies never get a
 * direct link: their documents pass through the API, which adds the
 * watermark (VIS-10, phase 4). Keys are opaque identifiers, never names or
 * other personal data (CLAUDE.md rule 8).
 */
export interface ObjectStoragePort {
  put(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  signedDownloadUrl(
    key: string,
    opts: { expiresInSeconds: number; fileName?: string },
  ): Promise<string>;
  delete(key: string): Promise<void>;
}

export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** SeaweedFS and other local servers need path-style URLs. */
  forcePathStyle?: boolean;
  /** Development only: create the bucket on the first write. In the cloud Terraform creates it. */
  createBucketIfMissing?: boolean;
}

function attachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export class S3ObjectStorage implements ObjectStoragePort {
  readonly #client: S3Client;
  #bucketReady: Promise<void> | null = null;

  constructor(private readonly config: S3StorageConfig) {
    this.#client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  /** Development only: creates the bucket when missing. In the cloud Terraform creates it. */
  ensureBucket(): Promise<void> {
    this.#bucketReady ??= (async () => {
      try {
        await this.#client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      } catch {
        await this.#client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
      }
    })().catch((error: unknown) => {
      // A failed attempt is not remembered: the next call tries again.
      this.#bucketReady = null;
      throw error;
    });
    return this.#bucketReady;
  }

  async put(input: { key: string; body: Uint8Array; contentType: string }): Promise<void> {
    if (this.config.createBucketIfMissing) await this.ensureBucket();
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      if (!result.Body) throw new ObjectNotFoundError(key);
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchKey") throw new ObjectNotFoundError(key);
      throw error;
    }
  }

  async signedDownloadUrl(
    key: string,
    opts: { expiresInSeconds: number; fileName?: string },
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentDisposition: opts.fileName ? attachment(opts.fileName) : undefined,
    });
    return getSignedUrl(this.#client, command, { expiresIn: opts.expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

/** Tests: objects in memory. */
export class InMemoryObjectStorage implements ObjectStoragePort {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(input: { key: string; body: Uint8Array; contentType: string }): Promise<void> {
    this.objects.set(input.key, {
      body: new Uint8Array(input.body),
      contentType: input.contentType,
    });
  }

  async get(key: string): Promise<Uint8Array> {
    const object = this.objects.get(key);
    if (!object) throw new ObjectNotFoundError(key);
    return new Uint8Array(object.body);
  }

  async signedDownloadUrl(key: string, opts: { expiresInSeconds: number }): Promise<string> {
    if (!this.objects.has(key)) throw new ObjectNotFoundError(key);
    return `memory://${encodeURIComponent(key)}?expiresIn=${opts.expiresInSeconds}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
