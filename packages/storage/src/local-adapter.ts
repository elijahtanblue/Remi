import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { IStorageAdapter } from './interface.js';

export interface LocalAdapterConfig {
  basePath?: string;
}

export class LocalAdapter implements IStorageAdapter {
  private readonly basePath: string;

  constructor(config: LocalAdapterConfig = {}) {
    this.basePath = config.basePath ?? '.local-storage';
  }

  private resolvePath(key: string): string {
    return path.join(this.basePath, key);
  }

  async put(key: string, data: Buffer | string, _contentType?: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolvePath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    return `file://${this.resolvePath(key)}`;
  }
}
