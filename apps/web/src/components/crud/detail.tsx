import type { ReactNode } from "react";
import { OperatorErrorState } from "../operator/ui/error-state";
import { OperatorLoadingState } from "../operator/ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "../operator/ui/page";
import { OperatorSection } from "../operator/ui/section";
import { CrudFieldList, type CrudField } from "./field-list";

export type { CrudField } from "./field-list";

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
                  <CrudFieldList fields={fields} />
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
