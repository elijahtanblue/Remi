export type { IStorageAdapter } from './interface.js';
export { S3Adapter } from './s3-adapter.js';
export type { S3AdapterConfig } from './s3-adapter.js';
export { LocalAdapter } from './local-adapter.js';
export type { LocalAdapterConfig } from './local-adapter.js';

import type { IStorageAdapter } from './interface.js';
import { S3Adapter } from './s3-adapter.js';
import { LocalAdapter } from './local-adapter.js';

export function createStorageAdapter(config: {
  type: 'S3' | 'local';
  s3?: { bucket: string; region: string; prefix?: string };
  local?: { basePath?: string };
}): IStorageAdapter {
  if (config.type === 'S3') {
    if (!config.s3) {
      throw new Error('S3 config is required when type is "S3"');
    }
    return new S3Adapter(config.s3);
  }

  return new LocalAdapter(config.local);
}
