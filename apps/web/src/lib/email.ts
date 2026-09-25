import nodemailer from "nodemailer";
import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";
import { siteConfig } from "@/config/site";

export type AuthEmail = {
  user: { email: string; name?: string | null };
  url: string;
  token: string;
};

export type AuthenticationEmailPurpose =
  "signup-verification" | "email-change" | "verification" | "reset";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function authenticationEmailContent(purpose: AuthenticationEmailPurpose, url: string) {
  const content = {
    "signup-verification": {
      subject: `Verify your ${siteConfig.name} email`,
      title: "Verify your email",
      intro: `Verify your email address to finish setting up your ${siteConfig.name} account.`,
      action: "Verify email",
      safety: "If you did not create this account, you can safely ignore this email.",
    },
    "email-change": {
      subject: `Confirm your new ${siteConfig.name} email`,
      title: "Confirm your new email",
      intro: `You requested to use this email address for your ${siteConfig.name} account. Confirm it to complete the email change.`,
      action: "Confirm email",
      safety:
        "If you did not request this change, you can safely ignore this email. Your current email will remain unchanged.",
    },
    verification: {
      subject: `Verify your ${siteConfig.name} email`,
      title: "Verify your email",
      intro: `Verify your email address for your ${siteConfig.name} account.`,
      action: "Verify email",
      safety: "If you did not request email verification, you can safely ignore this email.",
    },
    reset: {
      subject: `${siteConfig.name}: reset your password`,
      title: "Reset your password",
      intro: `We received a request to reset the password for your ${siteConfig.name} account.`,
      action: "Choose a new password",
      safety:
        "If you did not request a password reset, you can safely ignore this email. This link is only usable once and may expire.",
    },
  }[purpose];
  const escapedUrl = escapeHtml(url);
  return {
    subject: content.subject,
    text: `${content.title}\n\n${content.intro}\n\n${content.action}: ${url}\n\n${content.safety}`,
    html: `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:560px;margin:32px auto;padding:32px;background:#ffffff"><h1 style="margin:0 0 16px;font-size:24px">${escapeHtml(content.title)}</h1><p style="line-height:1.6">${escapeHtml(content.intro)}</p><p style="margin:28px 0"><a href="${escapedUrl}" style="display:inline-block;background:#166534;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(content.action)}</a></p><p style="line-height:1.6">${escapeHtml(content.safety)}</p><p style="font-size:14px;line-height:1.5;color:#475569">If the button does not work, copy and paste this link into your browser:<br><a href="${escapedUrl}">${escapedUrl}</a></p></main></body></html>`,
  };
}

export async function sendAuthEmail(purpose: AuthenticationEmailPurpose, message: AuthEmail) {
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
  const content = authenticationEmailContent(purpose, message.url);
  await transporter.sendMail({
    from: smtp.from ?? `${siteConfig.name} <no-reply@localhost>`,
    to: message.user.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}
