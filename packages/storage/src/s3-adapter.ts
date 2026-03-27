import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { IStorageAdapter } from './interface.js';

export interface S3AdapterConfig {
  bucket: string;
  region: string;
  prefix?: string;
}

export class S3Adapter implements IStorageAdapter {
  private readonly client: S3Client;
  private readonly config: S3AdapterConfig;

  constructor(config: S3AdapterConfig) {
    this.config = config;
    this.client = new S3Client({ region: config.region });
  }

  private buildKey(key: string): string {
    return this.config.prefix ? `${this.config.prefix}/${key}` : key;
  }

  async put(key: string, data: Buffer | string, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.buildKey(key),
        Body: data,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.buildKey(key),
      }),
    );

    const stream = response.Body as Readable;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.buildKey(key),
        }),
      );
      return true;
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        error.name === 'NoSuchKey' ||
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw err;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: this.buildKey(key),
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
