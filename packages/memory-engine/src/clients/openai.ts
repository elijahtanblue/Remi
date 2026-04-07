import type { MemoryModelClient } from './interface.js';

export function createOpenAiClient(apiKey: string, model?: string): MemoryModelClient {
  return {
    async complete(systemPrompt: string, userContent: string): Promise<string> {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
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
