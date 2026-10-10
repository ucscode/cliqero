"use client";

import { useId, type FormEventHandler, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "../ui/button";
import { OperatorLoadingState } from "../operator/ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "../operator/ui/page";
import { OperatorSection } from "../operator/ui/section";
import { FormErrorSummary } from "../form/feedback";
import { ApiClientError } from "@/lib/api-client";

export function CrudEdit({
  mode,
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  saving,
  loading = false,
  loadingLabel,
  onSubmit,
  children,
  headerActions,
  beforeFields,
  afterFields,
  sidebar,
  footer,
  error,
  errorFields,
  success,
  submitLabel,
  savingLabel,
  sectionTitle,
  sectionDescription,
  formId: requestedFormId,
  widthClassName = "max-w-4xl",
}: {
  mode: "create" | "edit";
  eyebrow?: string;
  title: string;
  description?: string;
  backHref: string;
  backLabel?: string;
  saving: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  headerActions?: ReactNode;
  beforeFields?: ReactNode;
  afterFields?: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
  error?: string | ApiClientError | null;
  errorFields?: readonly string[];
  success?: ReactNode;
  submitLabel?: string;
  savingLabel?: string;
  sectionTitle?: string;
  sectionDescription?: string;
  formId?: string;
  widthClassName?: string;
}) {
  const generatedFormId = useId();
  const formId = requestedFormId ?? generatedFormId;
  return (
    <OperatorPage className={widthClassName}>
      <OperatorPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <>
            {headerActions}
            <Button asChild type="button" variant="secondary" size="xs">
              <Link href={backHref}>{backLabel ?? "Cancel"}</Link>
            </Button>
            <Button type="submit" form={formId} disabled={saving || loading}>
              {saving
                ? (savingLabel ?? "Saving…")
                : (submitLabel ?? (mode === "create" ? "Create" : "Save changes"))}
            </Button>
          </>
        }
      />
      {error && <FormErrorSummary error={error} visibleFields={errorFields} />}
      {success}
      {loading ? (
        <OperatorLoadingState variant="section" label={loadingLabel ?? `Loading ${title}`} />
      ) : (
        <div
          className={sidebar ? "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" : "min-w-0"}
        >
          <form id={formId} onSubmit={onSubmit} className="grid min-w-0 gap-6">
            {beforeFields}
            <OperatorSection
              title={sectionTitle ?? (mode === "create" ? "New record" : "Record details")}
              description={sectionDescription}
              surface
            >
              <div className="grid gap-5">{children}</div>
            </OperatorSection>
          </form>
          {sidebar && <aside className="min-w-0">{sidebar}</aside>}
        </div>
      )}
      {!loading && afterFields}
      {footer}
    </OperatorPage>
  );
}
