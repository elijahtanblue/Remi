import OpenAI from 'openai';
import type { MemoryModelClient } from './interface.js';

export function createOpenAiClient(apiKey: string, model?: string): MemoryModelClient {
  const client = new OpenAI({ apiKey });

  return {
    async complete(systemPrompt: string, userContent: string): Promise<string> {
      const response = await client.chat.completions.create({
        model: model ?? 'gpt-5.4-nano',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('[openai] Empty response from model');
      return text;
    },
  };
}
