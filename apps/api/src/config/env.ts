import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    APP_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    APPLICATION_EMAIL: z.string().default(''),
    APPLICATION_PASSWORD: z.string().default(''),
    CSRF_SECRET: z
      .string()
      .regex(/^[a-f0-9]{64}$/, 'Generate a local key using setup:env'),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(?:\+srv)?:\/\//)
      .default(
        'mongodb://127.0.0.1:27017/sallty?replicaSet=rs0&directConnection=true',
      ),
  })
  .superRefine((value, context) => {
    let origin: URL;
    try {
      origin = new URL(value.APP_ORIGIN);
    } catch {
      return;
    }
    if (
      origin.origin !== value.APP_ORIGIN ||
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      (value.NODE_ENV === 'production' && origin.protocol !== 'https:')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'Use an exact HTTP origin; production requires HTTPS',
      });
    }
  });

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error('Invalid environment fields: ' + fields.join(', '));
  }
  return result.data;
}
export const environment = parseEnvironment(process.env);
