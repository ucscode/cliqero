"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiClientError, presentFormApiError, apiFetch, type Profile } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { CountrySelect } from "../country-select";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback;
}

export async function saveProfileSettings({
  profile,
  country,
  emailInput,
  saveProfile,
  requestEmailChange,
}: {
  profile: Profile;
  country: string;
  emailInput: string;
  saveProfile: (country: string | null) => Promise<Profile>;
  requestEmailChange: (email: string) => Promise<void>;
}) {
  const proposedEmail = emailInput.trim();
  const emailChanged = proposedEmail.toLowerCase() !== profile.email.trim().toLowerCase();
  const updatedProfile = await saveProfile(country || null);

  if (!emailChanged) {
    return {
      profile: updatedProfile,
      emailInput: updatedProfile.email,
      message: "Profile saved.",
      error: null,
    };
  }

  try {
    await requestEmailChange(proposedEmail);
    return {
      profile: updatedProfile,
      emailInput: updatedProfile.email,
      message: "Profile saved. If the email address can be used, check it for a verification link.",
      error: null,
    };
  } catch {
    return {
      profile: updatedProfile,
      emailInput,
      message: "Profile saved.",
      error:
        "Your profile was saved, but we couldn’t request email verification. Please try again.",
    };
  }
}

export function ProfileSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [country, setCountry] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await apiFetch<Profile>("/api/me/profile");
      setProfile(value);
      setCountry(value.country ?? "");
      setEmailInput(value.email);
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
    if (!profile || busy) return;
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveProfileSettings({
        profile,
        country,
        emailInput,
        saveProfile: (nextCountry) =>
          apiFetch<Profile>("/api/me/profile", {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
            },
            body: JSON.stringify({ country: nextCountry }),
          }),
        requestEmailChange: async (newEmail) => {
          const response = await authClient.changeEmail({
            newEmail,
            callbackURL: `${window.location.origin}/email-verified`,
          });
          if (response.error) throw response.error;
        },
      });
      setProfile(result.profile);
      setCountry(result.profile.country ?? "");
      setEmailInput(result.emailInput);
      setMessage(result.message);
      setError(result.error);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        const presented = presentFormApiError(cause, []);
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
      <form id="settings-profile-form" className="grid max-w-2xl gap-3" onSubmit={save}>
        <Label htmlFor="settings-username">Username</Label>
        <Input id="settings-username" value={profile.username} disabled />
        <CountrySelect
          id="settings-country"
          value={country}
          onChange={setCountry}
          required={false}
        />
        <Label htmlFor="settings-email">Email</Label>
        <Input
          id="settings-email"
          type="email"
          autoComplete="email"
          required
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
        />
        <HoneypotField />
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}
