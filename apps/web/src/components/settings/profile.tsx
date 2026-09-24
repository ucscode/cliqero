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

export function ProfileSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [country, setCountry] = useState("");
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailChangeBusy, setEmailChangeBusy] = useState(false);
  const [emailChangeMessage, setEmailChangeMessage] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
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
    try {
      const value = await apiFetch<Profile>("/api/me/profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
        },
        body: JSON.stringify({ country: country || null }),
      });
      setProfile(value);
      setCountry(value.country ?? "");
      setMessage("Profile saved.");
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        const presented = presentFormApiError(cause, []);
        setError(presented.message);
      } else setError("We couldn’t save your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || emailChangeBusy) return;
    setEmailChangeBusy(true);
    setEmailChangeError(null);
    setEmailChangeMessage(null);
    const proposedEmail = newEmail.trim();
    if (proposedEmail.toLowerCase() === profile.email.toLowerCase()) {
      setEmailChangeError("Enter an email address different from your current one.");
      setEmailChangeBusy(false);
      return;
    }
    try {
      const result = await authClient.changeEmail({
        newEmail: proposedEmail,
        callbackURL: `${window.location.origin}/email-verified`,
      });
      if (result.error) throw result.error;
      setEmailChangeMessage(`Verification email sent to ${proposedEmail}.`);
      setEmailChangeOpen(false);
      setNewEmail("");
    } catch (cause) {
      setEmailChangeError(
        cause instanceof Error ? cause.message : "We couldn’t send the verification email.",
      );
    } finally {
      setEmailChangeBusy(false);
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
        <Input id="settings-username" value={profile.username} readOnly />
        <CountrySelect
          id="settings-country"
          value={country}
          onChange={setCountry}
          required={false}
        />
        <HoneypotField />
      </form>
      <div className="grid max-w-2xl gap-3">
        <Label htmlFor="settings-email">Email</Label>
        <Input id="settings-email" value={profile.email} readOnly />
        <Button
          type="button"
          variant="secondary"
          className="w-fit"
          onClick={() => {
            setEmailChangeOpen((open) => !open);
            setEmailChangeError(null);
            setEmailChangeMessage(null);
          }}
        >
          {emailChangeOpen ? "Cancel email change" : "Change email"}
        </Button>
        {emailChangeMessage && <Toast tone="success">{emailChangeMessage}</Toast>}
        {emailChangeError && <Toast>{emailChangeError}</Toast>}
        {emailChangeOpen && (
          <form className="grid gap-3" onSubmit={requestEmailChange}>
            <Label htmlFor="settings-new-email">New email</Label>
            <Input
              id="settings-new-email"
              type="email"
              autoComplete="email"
              required
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
            <Button type="submit" disabled={emailChangeBusy}>
              {emailChangeBusy ? "Sending…" : "Send verification"}
            </Button>
          </form>
        )}
      </div>
      <Button type="submit" form="settings-profile-form" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </Button>
    </Card>
  );
}
