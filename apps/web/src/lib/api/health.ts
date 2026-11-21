import 'server-only';
import { z } from 'zod';

const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('sallty-api'),
});
const readySchema = z.object({
  status: z.literal('ready'),
  database: z.literal('connected'),
  transactions: z.literal('supported'),
});

async function probe(path: string, schema: z.ZodType): Promise<boolean> {
  const origin = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
  try {
    const response = await fetch(origin + path, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    });
    return response.ok && schema.safeParse(await response.json()).success;
  } catch {
    return false;
  }
}

export async function getSystemStatus() {
  const [apiOnline, databaseReady] = await Promise.all([
    probe('/health', healthSchema),
    probe('/ready', readySchema),
  ]);
  return { apiOnline, databaseReady };
}
