"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch, formatMinorAmount, type FundingStatus } from "@/lib/api-client";
import {
  canSubmitBankTransferEvidence,
  hasBankTransferEvidence,
} from "@/providers/payment/bank-transfer/ui-policy";
import {
  initializeFundingStatus,
  PaymentComponent,
  type PaymentProviderProps,
} from "../shared/status";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Toast } from "../../toast";
import { Money } from "../../money";
import { CopyValue } from "../../copy-value";

type BankStatusField = { key: string; label: string; value: string; copyable?: boolean };
export type BankTransferEvidenceRow = { label: string; value: string };

export function bankTransferEvidenceRows(
  evidence: FundingStatus["evidence"],
): BankTransferEvidenceRow[] {
  if (!evidence) return [];
  return [
    ...(evidence.transfer_reference
      ? [{ label: "Transfer reference", value: evidence.transfer_reference }]
      : []),
    ...(evidence.proof
      ? [
          {
            label: "Proof file",
            value: evidence.proof.original_filename ?? "Uploaded file",
          },
        ]
      : []),
    ...(evidence.customer_note ? [{ label: "Note", value: evidence.customer_note }] : []),
  ];
}

export function snapshotFields(value: unknown): BankStatusField[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const fields = (value as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (field): field is BankStatusField =>
      Boolean(field) &&
      typeof field === "object" &&
      typeof (field as BankStatusField).key === "string" &&
      typeof (field as BankStatusField).label === "string" &&
      typeof (field as BankStatusField).value === "string",
  );
}
export function snapshotInstruction(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const instruction = (value as { instruction?: unknown }).instruction;
  return typeof instruction === "string" && instruction.trim() ? instruction : null;
}

export function bankStatusFieldRows(fields: readonly BankStatusField[]) {
  return [...fields];
}

export function BankTransferPayment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  const attemptedFundingId = useRef<string | null>(null);
  const { funding, onError, onFundingChange } = props;
  const [transferReference, setTransferReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields = snapshotFields(funding.provider_account_snapshot);
  const instruction = snapshotInstruction(funding.provider_account_snapshot);
  const evidenceAllowed = canSubmitBankTransferEvidence(funding) && !funding.evidence;
  useEffect(() => {
    if (funding.state !== "initialization_pending") return;
    if (attemptedFundingId.current === funding.id) return;
    attemptedFundingId.current = funding.id;
    void initializeFundingStatus(funding.id)
      .then((latest) => {
        onFundingChange(latest);
        onError("");
      })
      .catch((cause) => {
        onError(
          cause instanceof Error ? cause.message : "Bank-transfer funding could not be prepared.",
        );
      });
  }, [funding.id, funding.state, onError, onFundingChange]);
  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reference = transferReference.trim();
    const note = customerNote.trim();
    if (!hasBankTransferEvidence(reference, Boolean(proofFile))) {
      setError("Add a transfer reference or proof file before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("transfer_reference", reference);
      body.set("customer_note", note);
      if (proofFile) body.set("proof_file", proofFile);
      await apiFetch(`/api/wallet/fund/${props.funding.id}/evidence`, { method: "POST", body });
      props.onFundingChange(await apiFetch<FundingStatus>(`/api/wallet/fund/${props.funding.id}`));
      setTransferReference("");
      setProofFile(null);
      setCustomerNote("");
      setMessage("Evidence submitted. Your bank transfer is awaiting manual verification.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Evidence could not be submitted. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <PaymentComponent
      {...props}
      sessionExpired={false}
      currentTime={currentTime}
      showInitializationStatus={false}
    >
      <div className="grid gap-1 border-t border-slate-200 pt-3">
        <span className="text-slate-600">Transfer amount</span>
        <CopyValue
          label="transfer amount"
          value={formatMinorAmount(props.funding.collection_amount_minor)}
          displayValue={
            <strong>
              <Money
                minor={props.funding.collection_amount_minor}
                currency={props.funding.collection_currency}
              />
            </strong>
          }
        />
      </div>
      {fields.length > 0 ? (
        <div className="grid gap-4 border-t border-slate-200 pt-3">
          <strong>Receiving bank details</strong>
          {fields.map((field) => (
            <div
              className="grid gap-1 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:items-center sm:gap-3"
              key={field.key}
            >
              <span className="text-slate-600">{field.label}</span>
              <div className="min-w-0">
                {field.copyable ? (
                  <CopyValue
                    label={field.label}
                    value={field.value}
                    displayValue={<strong className="break-all">{field.value}</strong>}
                  />
                ) : (
                  <strong className="block break-all">{field.value}</strong>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-t border-amber-200 pt-3 text-sm text-amber-900" role="status">
          Bank details are unavailable for this saved funding attempt. Do not transfer until
          receiving details are shown.
        </p>
      )}
      {instruction && (
        <div className="grid gap-1 border-t border-slate-200 pt-3">
          <span className="text-slate-600">Transfer instruction</span>
          <strong className="whitespace-pre-line">{instruction}</strong>
        </div>
      )}
      {props.funding.evidence && (
        <div className="grid gap-1 border-t border-slate-200 pt-4 text-sm" role="status">
          <strong>Evidence submitted</strong>
          <span className="text-slate-600">
            Your bank transfer is awaiting manual verification.
          </span>
          <dl className="grid gap-2">
            {bankTransferEvidenceRows(props.funding.evidence).map((row) => (
              <div className="grid gap-1" key={row.label}>
                <dt className="text-slate-600">{row.label}</dt>
                <dd className="break-all whitespace-pre-line font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {evidenceAllowed && (
        <form className="grid gap-3 border-t border-slate-200 pt-4" onSubmit={submitEvidence}>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Submit transfer evidence</h3>
            <p className="text-sm text-slate-600">
              Add a transfer reference or proof file. You can include an optional note for our
              review team. This helps us review your transfer, but it does not confirm payment or
              add funds to your wallet.
            </p>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="bank-transfer-reference">Transfer reference</Label>
            <Input
              id="bank-transfer-reference"
              value={transferReference}
              onChange={(event) => setTransferReference(event.target.value)}
              maxLength={200}
              disabled={submitting}
              placeholder="Bank transfer reference"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="bank-proof-file">Transaction proof file</Label>
            <Input
              id="bank-proof-file"
              name="proof_file"
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
              disabled={submitting}
            />
            <p className="text-xs text-slate-500">PNG, JPEG, WEBP, GIF, or PDF up to 10 MB.</p>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="bank-customer-note">Note (optional)</Label>
            <Textarea
              id="bank-customer-note"
              value={customerNote}
              onChange={(event) => setCustomerNote(event.target.value)}
              maxLength={2000}
              disabled={submitting}
              placeholder="Optional note for our review team"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit transfer evidence"}
          </Button>
          {error && <Toast>{error}</Toast>}
        </form>
      )}
      {message && (
        <p className="text-sm font-medium text-emerald-800" role="status">
          {message}
        </p>
      )}
    </PaymentComponent>
  );
}
