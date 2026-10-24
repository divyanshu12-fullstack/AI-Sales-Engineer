import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { HttpError } from '../../http/errors.js';
import { fetchJson } from '../../lib/upstream.js';

export const embeddingModel = 'qwen/qwen3-embedding-8b';
export const dimensions = 4096;
const responseSchema = z.object({
  model: z.enum([embeddingModel, 'Qwen/Qwen3-Embedding-8B']),
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number()).length(dimensions),
    }),
  ),
});
export const queryInstruction = (question: string): string =>
  `Instruct: Given a question about AsterByte Solutions, retrieve relevant company knowledge passages that answer it.\nQuery: ${question}`;

export const embed = async (config: Env, input: string[]): Promise<number[][]> => {
  if (
    !config.EMBEDDING_API_KEY ||
    config.EMBEDDING_MODEL !== embeddingModel ||
    (config.EMBEDDING_PROVIDER && config.EMBEDDING_PROVIDER !== 'openrouter')
  ) {
    throw new HttpError(
      503,
      'INTEGRATION_UNAVAILABLE',
      'Configure OpenRouter with qwen/qwen3-embedding-8b.',
    );
  }
  const result = responseSchema.safeParse(
    await fetchJson(
      'https://openrouter.ai/api/v1/embeddings',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.EMBEDDING_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: embeddingModel,
          input,
          encoding_format: 'float',
          provider: { data_collection: 'deny' },
        }),
      },
      45_000,
    ),
  );
  if (!result.success || result.data.data.length !== input.length)
    throw new HttpError(502, 'UPSTREAM_ERROR', 'Invalid embedding response.');
  const sorted = result.data.data.toSorted((a, b) => a.index - b.index);
  if (sorted.some((row, index) => row.index !== index || !row.embedding.some((n) => n !== 0))) {
    throw new HttpError(502, 'UPSTREAM_ERROR', 'Invalid embedding indexes or zero vector.');
  }
  return sorted.map(({ embedding }) => embedding);
};
