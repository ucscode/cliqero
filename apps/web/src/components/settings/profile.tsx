"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiClientError, presentFormApiError, apiFetch, type Profile } from "@/lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback;
}

export function ProfileSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await apiFetch<Profile>("/api/me/profile");
      setProfile(value);
      setUsername(value.username);
      setCountry(value.country ?? "");
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t load your profile."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    setBusy(true);
    setError(null);
    setMessage(null);
    setUsernameError(null);
    try {
      const value = await apiFetch<Profile>("/api/me/profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
        },
        body: JSON.stringify({ username, country: country || null }),
      });
      setProfile(value);
      setUsername(value.username);
      setCountry(value.country ?? "");
      setMessage("Profile saved.");
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        const presented = presentFormApiError(cause, ["username"]);
        setUsernameError(presented.fields.username ?? null);
        setError(presented.message);
      } else setError("We couldn’t save your profile.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Card className="p-5">Loading profile…</Card>;
  if (!profile)
    return (
      <Card className="p-5">
        <EmptyState title="Profile unavailable" description={error ?? "Try again."} />
      </Card>
    );
  return (
    <Card className="grid gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Profile</p>
          <h3>Your public account details</h3>
        </div>
        <Badge variant="default">Cliqero identity</Badge>
      </div>
      {error && <Toast>{error}</Toast>}
      {message && <Toast tone="success">{message}</Toast>}
      <form className="grid max-w-2xl gap-3" onSubmit={save}>
        <Label htmlFor="settings-username">Username</Label>
        <Input
          id="settings-username"
          value={username}
          pattern="[a-z0-9][a-z0-9_-]{2,31}"
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          minLength={3}
          maxLength={32}
          autoComplete="username"
          required
          aria-describedby={usernameError ? "settings-username-error" : undefined}
          aria-invalid={Boolean(usernameError)}
        />
        {usernameError && (
          <p id="settings-username-error" className="text-sm text-red-700">
            {usernameError}
          </p>
        )}
        <p className="text-xs leading-relaxed text-slate-500">
          Lowercase letters, numbers, underscores, and hyphens. Usernames are unique.
        </p>
        <Label htmlFor="settings-country">
          Country <span>(optional)</span>
        </Label>
        <Input
          id="settings-country"
          value={country}
          onChange={(event) => setCountry(event.target.value.toUpperCase())}
          maxLength={2}
          placeholder="NG"
        />
        <Label htmlFor="settings-email">Email</Label>
        <Input
          id="settings-email"
          value={profile.email}
          readOnly
          aria-describedby="settings-email-help"
        />
        <p id="settings-email-help" className="text-xs leading-relaxed text-slate-500">
          Email changes are managed by the authentication provider.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
        <HoneypotField />
      </form>
    </Card>
  );
}
