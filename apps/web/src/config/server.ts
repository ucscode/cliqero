import { z } from "zod";

const serverConfiguration = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
});

export type ServerConfiguration = z.infer<typeof serverConfiguration>;

export function loadServerConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfiguration {
  return serverConfiguration.parse(environment);
}
