"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "./ui/alert";

export type CaptchaClientConfig = {
  enabled: boolean;
  provider: "turnstile" | "hcaptcha" | "recaptcha";
  siteKey: string;
};

type CaptchaApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string | number;
  reset?: (widget?: string | number) => void;
};

const scriptUrls = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
  recaptcha: "https://www.google.com/recaptcha/api.js?render=explicit",
} as const;

function globalApi(provider: CaptchaClientConfig["provider"]): CaptchaApi | undefined {
  const key =
    provider === "turnstile" ? "turnstile" : provider === "hcaptcha" ? "hcaptcha" : "grecaptcha";
  return (window as unknown as Record<string, unknown>)[key] as CaptchaApi | undefined;
}

function loadProviderScript(provider: CaptchaClientConfig["provider"]) {
  const selector = `script[data-cliqero-captcha="${provider}"]`;
  const existing = document.querySelector<HTMLScriptElement>(selector);
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.src = scriptUrls[provider];
    script.async = true;
    script.defer = true;
    script.dataset.cliqeroCaptcha = provider;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("CAPTCHA provider failed to load")));
    if (!existing) document.head.appendChild(script);
  });
}

export function Captcha({
  config,
  onToken,
}: {
  config: CaptchaClientConfig;
  onToken: (token: string | null) => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!config.enabled) return;
    if (!config.siteKey) {
      onToken(null);
      return;
    }
    let cancelled = false;
    onToken(null);
    void loadProviderScript(config.provider)
      .then(() => {
        if (cancelled || !elementRef.current) return;
        const api = globalApi(config.provider);
        if (!api) throw new Error("CAPTCHA provider is unavailable");
        widgetRef.current = api.render(elementRef.current, {
          sitekey: config.siteKey,
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => {
            onToken(null);
            setError("CAPTCHA could not be completed. Please try again.");
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          onToken(null);
          setError("CAPTCHA could not be loaded. Please try again.");
        }
      });
    const element = elementRef.current;
    return () => {
      cancelled = true;
      onToken(null);
      element?.replaceChildren();
    };
  }, [config.enabled, config.provider, config.siteKey, onToken]);
  if (!config.enabled) return null;
  const visibleError =
    error ?? (!config.siteKey ? "CAPTCHA is enabled but no public site key is configured." : null);
  return (
    <div className="grid gap-2" aria-label="Security verification">
      <div ref={elementRef} />
      {visibleError && <Alert role="alert">{visibleError}</Alert>}
    </div>
  );
}
