import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("postgres://mock:mock@localhost:5432/mock_interview"),
  JWT_SECRET: z.string().default("dev-secret-change-me"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  STT_PROVIDER: z.enum(["mock", "alibaba", "openai"]).default("mock"),
  TTS_PROVIDER: z.enum(["mock", "alibaba"]).default("mock"),
  ALIYUN_DASHSCOPE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("recordings"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  PUBLIC_URL: z.string().default("http://localhost:5173")
});

export type AppEnv = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[config] invalid environment:", parsed.error.flatten());
  process.exit(1);
}

export const env = parsed.data;