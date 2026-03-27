import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

await import('./index.js');
