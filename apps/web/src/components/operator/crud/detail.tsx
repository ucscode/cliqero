import type { ReactNode } from "react";
import { OperatorErrorState } from "../ui/error-state";
import { OperatorLoadingState } from "../ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "../ui/page";
import { OperatorSection } from "../ui/section";

export type CrudField = { label: ReactNode; value: ReactNode; className?: string };

export function CrudDetails({ fields }: { fields: readonly CrudField[] }) {
  return (
    <dl className="grid min-w-0 gap-x-6 gap-y-4 sm:grid-cols-2">
      {fields.map((field, index) => (
        <div
          key={`${index}`}
          className="grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)] sm:items-start"
        >
          <dt className="text-sm text-slate-500">{field.label}</dt>
          <dd
            className={`min-w-0 break-words text-sm font-medium text-slate-900 ${field.className ?? ""}`}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CrudDetail({
  eyebrow,
  title,
  description,
  headerActions,
  summary,
  fields,
  fieldsTitle = "Details",
  beforeDetails,
  afterDetails,
  sidebar,
  sections,
  footer,
  loading = false,
  error,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  headerActions?: ReactNode;
  summary?: ReactNode;
  fields?: readonly CrudField[];
  fieldsTitle?: string;
  beforeDetails?: ReactNode;
  afterDetails?: ReactNode;
  sidebar?: ReactNode;
  sections?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  error?: { title?: string; message: string; retry?: () => void };
}) {
  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={headerActions}
      />
      {loading ? (
        <OperatorLoadingState variant="section" label={`Loading ${title}`} />
      ) : error ? (
        <OperatorErrorState
          title={error.title ?? "Record unavailable"}
          message={error.message}
          retry={error.retry}
        />
      ) : (
        <>
          {summary}
          <div
            className={
              sidebar ? "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" : "min-w-0"
            }
          >
            <div className="min-w-0 space-y-6">
              {beforeDetails}
              {fields && (
                <OperatorSection title={fieldsTitle} surface>
                  <CrudDetails fields={fields} />
                </OperatorSection>
              )}
              {afterDetails}
              {sections}
            </div>
            {sidebar && <aside className="min-w-0">{sidebar}</aside>}
          </div>
          {footer}
        </>
      )}
    </OperatorPage>
  );
}
