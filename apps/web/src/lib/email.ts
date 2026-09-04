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

export function loadEmailConfiguration(path = "config/modules/email.yaml") {
  const raw = loadYamlConfiguration(path);
  return raw === null
    ? { provider: "smtp" as const, smtp: { port: 1025, secure: false } }
    : emailSchema.parse(raw);
}

export async function sendAuthEmail(kind: "verification" | "reset", message: AuthEmail) {
  // Authentication integration tests intentionally do not deliver mail.
  if (process.env.NODE_ENV === "test") return;
  const configuration = loadEmailConfiguration();
  const smtp = configuration.smtp;
  const host = smtp.host?.trim();
  if (!host) {
    throw new Error("config/modules/email.yaml must define smtp.host");
  }
  const transporter = nodemailer.createTransport({
    host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user
      ? {
          user: smtp.user,
          pass: smtp.password ?? "",
        }
      : undefined,
  });
  const subject =
    kind === "verification" ? `Verify your ${siteConfig.name} email` : "Reset your password";
  await transporter.sendMail({
    from: smtp.from ?? `${siteConfig.name} <no-reply@localhost>`,
    to: message.user.email,
    subject,
    text: `${kind === "verification" ? "Verify your email" : "Reset your password"}: ${message.url}`,
    html: `<p><a href="${message.url}">${kind === "verification" ? "Verify your email" : "Reset your password"}</a></p>`,
  });
}
