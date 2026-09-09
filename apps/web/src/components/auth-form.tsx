"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleLogoIcon } from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";
import { ApiClientError, apiFetch, presentFormApiError, safeContinuation } from "@/lib/api-client";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Eye, EyeOff } from "lucide-react";
import { CountrySelect } from "./country-select";
import { HoneypotField } from "./honeypot-field";
import { siteConfig } from "@/config/site";
import { Captcha, captchaTokenPayload, type CaptchaClientConfig } from "./captcha";
import { AuthShell } from "./auth-shell";
import { TextLink } from "./text-link";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";
import { withPendingState } from "@/lib/pending-action";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";

export function AuthForm({
  mode,
  googleEnabled,
  captcha,
}: {
  mode: "login" | "register";
  googleEnabled: boolean;
  captcha: CaptchaClientConfig;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeContinuation(searchParams.get("next"), "/dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const onCaptchaToken = useCallback((token: string | null) => setCaptchaToken(token), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    event.preventDefault();
    if (busyRef.current) {
      return;
    }
    setError(null);
    setFieldErrors({});
    try {
      await withPendingState(
        (pending) => {
          busyRef.current = pending;
          setBusy(pending);
        },
        async () => {
          const honeypot = String(new FormData(form).get(HONEYPOT_FIELD_NAME) ?? "");
          if (mode === "register" && captcha.enabled && !captchaToken) {
            setError("Please complete the CAPTCHA challenge.");
            return;
          }
          if (mode === "register") {
            // Registration provisions Better Auth and the Cliqero account as one
            // server-side operation. Only a successful provision is allowed to
            // create the browser session below.
            await apiFetch("/api/accounts", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
              },
              body: JSON.stringify({
                email,
                username,
                password,
                country: country || undefined,
                ...captchaTokenPayload(captchaToken),
              }),
            });
            const signIn = await authClient.signIn.email({
              email,
              password,
              fetchOptions: honeypot
                ? { headers: { [HONEYPOT_HEADER_NAME]: honeypot } }
                : undefined,
            });
            if (signIn.error) {
              setError("Your account was created, but we couldn’t sign you in. Please sign in.");
              return;
            }
          } else {
            const result = await authClient.signIn.email({
              email,
              password,
              fetchOptions: honeypot
                ? { headers: { [HONEYPOT_HEADER_NAME]: honeypot } }
                : undefined,
            });
            if (result.error) {
              setError(result.error.message || "Invalid email or password.");
              return;
            }
          }
          router.push(next);
          router.refresh();
        },
      );
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        const presented = presentFormApiError(cause, ["username", "email"]);
        setFieldErrors(presented.fields);
        setError(presented.message);
      } else {
        setError("Authentication failed. Please try again.");
      }
    }
  }
  async function google() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `/onboarding?next=${encodeURIComponent(next)}`,
      });
      if (result.error)
        setError(result.error.message || "Google sign-in is unavailable right now.");
    } catch {
      setError("Google sign-in is unavailable right now.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <AuthShell
      eyebrow={mode === "login" ? "Welcome back" : "Start exploring"}
      title={mode === "login" ? "Good to see you." : "Make it yours."}
      description={
        mode === "login"
          ? "Sign in to pick up where you left off."
          : `Create your ${siteConfig.name} account and discover what comes next.`
      }
    >
      {error && (
        <Alert role="alert" className="mb-5 border-red-200 bg-red-50 text-red-900">
          {error}
        </Alert>
      )}
      <form onSubmit={submit} className="grid gap-4" aria-busy={busy}>
        <HoneypotField />
        {mode === "register" && (
          <>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              required
              minLength={3}
              maxLength={32}
              autoComplete="username"
              placeholder="username"
              pattern="[a-z0-9][a-z0-9_-]{2,31}"
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? "register-username-error" : undefined}
            />
            {fieldErrors.username && (
              <p id="register-username-error" className="text-sm text-red-700">
                {fieldErrors.username}
              </p>
            )}
            <CountrySelect value={country} onChange={setCountry} />
          </>
        )}
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="register-email-error" className="text-sm text-red-700">
            {fieldErrors.email}
          </p>
        )}
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            className="pr-11"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-8 w-8"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {mode === "register" && <Captcha config={captcha} onToken={onCaptchaToken} />}
        <Button type="submit" disabled={busy}>
          {busy
            ? mode === "login"
              ? "Signing in…"
              : "Creating account…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>
      <div className="mt-6 grid gap-4 border-t border-slate-200 pt-6">
        {mode === "login" && (
          <TextLink className="text-sm" href={`/forgot-password?next=${encodeURIComponent(next)}`}>
            Forgot password?
          </TextLink>
        )}
        {googleEnabled && (
          <>
            <div className="my-1 flex items-center gap-3 text-xs text-slate-500">
              <Separator className="flex-1" />
              <span>or continue with</span>
              <Separator className="flex-1" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full bg-white font-medium text-slate-700"
              onClick={google}
              disabled={busy}
            >
              <GoogleLogoIcon className="h-4 w-4" weight="bold" aria-hidden="true" />
              Google
            </Button>
          </>
        )}
        <p className="text-center text-sm text-slate-500">
          {mode === "login" ? `New to ${siteConfig.name}?` : "Already have an account?"}{" "}
          <a
            href={
              mode === "login"
                ? `/register?next=${encodeURIComponent(next)}`
                : `/login?next=${encodeURIComponent(next)}`
            }
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
