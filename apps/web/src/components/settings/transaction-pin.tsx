"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type PinStatus = { configured: boolean };
type Action = "set" | "change" | "request_recovery" | "recover";

export function TransactionPinSettings() {
  const [status, setStatus] = useState<PinStatus | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<PinStatus>("/internal/me/transaction-pin")
      .then(setStatus)
      .catch(() => setError("Transaction PIN status could not be loaded."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action: Action = recovering ? "recover" : status?.configured ? "change" : "set";
    await perform(action);
  }

  async function perform(action: Action) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body =
        action === "set" || action === "recover"
          ? { action, pin, ...(action === "recover" ? { code } : {}) }
          : action === "change"
            ? { action, current_pin: currentPin, pin }
            : { action };
      const result = await apiFetch<PinStatus & { success: boolean }>(
        "/internal/me/transaction-pin",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setStatus(result);
      setCurrentPin("");
      setPin("");
      setCode("");
      setMessage(
        action === "request_recovery"
          ? "If your verified email can receive messages, a recovery code has been sent."
          : "Transaction PIN updated.",
      );
      if (action === "recover") setRecovering(false);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Transaction PIN could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="grid max-w-2xl gap-4 p-5 sm:p-6">
      <div>
        <p className="eyebrow">Transaction security</p>
        <h3 className="text-lg font-semibold tracking-tight">Transaction PIN</h3>
        <p className="mt-1 text-sm text-slate-600">
          A separate six-digit PIN protects withdrawals and wallet transfers. Your email must be
          verified.
        </p>
      </div>
      {status && (
        <p className="text-sm">Status: {status.configured ? "Configured" : "Not configured"}</p>
      )}
      {message && <Alert>{message}</Alert>}
      {error && <Alert>{error}</Alert>}
      <form className="grid gap-3" onSubmit={submit}>
        {status?.configured && !recovering && (
          <>
            <Label htmlFor="transaction-pin-current">Current PIN</Label>
            <Input
              id="transaction-pin-current"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={currentPin}
              onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </>
        )}
        {recovering && (
          <>
            <Label htmlFor="transaction-pin-recovery-code">Email recovery code</Label>
            <Input
              id="transaction-pin-recovery-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </>
        )}
        <Label htmlFor="transaction-pin-new">
          {recovering ? "New PIN" : status?.configured ? "New PIN" : "Six-digit PIN"}
        </Label>
        <Input
          id="transaction-pin-new"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          required
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !status}>
            {busy
              ? "Saving…"
              : recovering
                ? "Reset PIN"
                : status?.configured
                  ? "Change PIN"
                  : "Set PIN"}
          </Button>
          {status?.configured && !recovering && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setRecovering(true)}
            >
              Forgot PIN
            </Button>
          )}
          {recovering && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void perform("request_recovery")}
            >
              Send recovery code
            </Button>
          )}
          {recovering && (
            <Button type="button" variant="ghost" onClick={() => setRecovering(false)}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
