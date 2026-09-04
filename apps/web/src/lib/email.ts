import nodemailer from "nodemailer";
import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";
import { siteConfig } from "@/config/site";

export type AuthEmail = {
  user: { email: string; name?: string | null };
  url: string;
  token: string;
};

const emailSchema = z.object({
  provider: z.literal("smtp").default("smtp"),
  smtp: z
    .object({
      host: z.string().optional(),
      port: z.coerce.number().int().positive().default(1025),
      secure: z.boolean().default(false),
      user: z.string().optional(),
      password: z.string().optional(),
      from: z.string().optional(),
    })
    .default({ port: 1025, secure: false }),
});

function loadEmailConfiguration() {
  const raw = loadYamlConfiguration("config/modules/email.yaml");
  return raw === null
    ? { provider: "smtp" as const, smtp: { port: 1025, secure: false } }
    : emailSchema.parse(raw);
}

export async function sendAuthEmail(kind: "verification" | "reset", message: AuthEmail) {
  // Authentication integration tests intentionally do not deliver mail. Keep
  // this guard before YAML placeholder resolution so a local SMTP placeholder
  // never becomes a test-only required environment variable.
  if (process.env.NODE_ENV === "test" && !process.env.SMTP_HOST) return;
  const configuration = loadEmailConfiguration();
  const smtp = configuration.smtp;
  const host = smtp.host?.trim() || process.env.SMTP_HOST?.trim();
  if (!host) {
    throw new Error("SMTP_HOST is required for authentication email delivery");
  }
  const transporter = nodemailer.createTransport({
    host,
    port: smtp.port ?? Number(process.env.SMTP_PORT ?? 1025),
    secure: smtp.secure ?? process.env.SMTP_SECURE === "true",
    auth:
      smtp.user || process.env.SMTP_USER
        ? {
            user: smtp.user || process.env.SMTP_USER,
            pass: smtp.password ?? process.env.SMTP_PASSWORD ?? "",
          }
        : undefined,
  });
  const subject =
    kind === "verification" ? `Verify your ${siteConfig.name} email` : "Reset your password";
  await transporter.sendMail({
    from: smtp.from ?? process.env.SMTP_FROM ?? `${siteConfig.name} <no-reply@localhost>`,
    to: message.user.email,
    subject,
    text: `${kind === "verification" ? "Verify your email" : "Reset your password"}: ${message.url}`,
    html: `<p><a href="${message.url}">${kind === "verification" ? "Verify your email" : "Reset your password"}</a></p>`,
  });
}
