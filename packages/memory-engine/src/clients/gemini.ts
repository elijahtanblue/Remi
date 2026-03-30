import { GoogleGenerativeAI } from '@google/generative-ai';
import type { MemoryModelClient } from './interface.js';
import { MODELS } from '../models.js';

export function createGeminiClient(apiKey: string): MemoryModelClient {
  const genai = new GoogleGenerativeAI(apiKey);

  return {
    async complete(systemPrompt: string, userContent: string): Promise<string> {
      const model = genai.getGenerativeModel({
        model: MODELS.STAGE1_EXTRACT,
        systemInstruction: systemPrompt,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const result = await model.generateContent(userContent);
      const text = result.response.text();

      if (!text) throw new Error('[gemini] Empty response from model');
      return text;
    },
  };
}
