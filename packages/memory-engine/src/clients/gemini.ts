import type { MemoryModelClient } from './interface.js';
import { MODELS } from '../models.js';

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 5000; // 5 s — free tier allows 15 RPM, so space retries out

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  // @google/generative-ai surfaces rate limit errors with status 429
  const status = e['status'] ?? (e['response'] as Record<string, unknown> | undefined)?.['status'];
  if (status === 429) return true;
  // Also catch error messages that mention rate limit
  const msg = String(e['message'] ?? '');
  return msg.includes('429') || msg.toLowerCase().includes('resource_exhausted') || msg.toLowerCase().includes('rate limit');
}

export function createGeminiClient(apiKey: string): MemoryModelClient {
  return {
    async complete(systemPrompt: string, userContent: string): Promise<string> {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genai = new GoogleGenerativeAI(apiKey);
      const model = genai.getGenerativeModel({
        model: MODELS.STAGE1_EXTRACT,
        systemInstruction: systemPrompt,
        generationConfig: { responseMimeType: 'application/json' },
      });

      let lastError: unknown;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await model.generateContent(userContent);
          const text = result.response.text();
          if (!text) throw new Error('[gemini] Empty response from model');
          return text;
        } catch (err) {
          lastError = err;
          if (!isRateLimitError(err) || attempt === MAX_RETRIES) throw err;
          // Exponential backoff: 5s, 10s, 20s, 40s
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[gemini] Rate limited (429), retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw lastError;
    },
  };
}
