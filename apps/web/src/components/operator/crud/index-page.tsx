import type { FormEventHandler, ReactNode } from "react";
import Link from "next/link";
import { Button } from "../../ui/button";
import { OperatorEmptyState } from "../ui/empty-state";
import { OperatorErrorState } from "../ui/error-state";
import { OperatorLoadingState } from "../ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "../ui/page";
import { OperatorPagination } from "../ui/pagination";
import { OperatorSection } from "../ui/section";
import { OperatorToolbar } from "../ui/toolbar";
import { CrudTable, type CrudColumn } from "./table";
import type { OperatorAction } from "../ui/actions-menu";

export type CrudPagination = {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  summary?: ReactNode;
};

export function CrudIndex<T>({
  eyebrow,
  title,
  description,
  headerActions,
  createAction,
  filters,
  sort,
  onFiltersSubmit,
  toolbarActions,
  toolbarClassName,
  beforeTable,
  afterTable,
  footer,
  items,
  columns,
  getRowKey,
  actions,
  actionLabel,
  loading,
  loadingLabel,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  empty,
  pagination,
  sectionTitle,
  sectionDescription,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  headerActions?: ReactNode;
  createAction?: { label: string; href: string };
  filters?: ReactNode;
  sort?: ReactNode;
  onFiltersSubmit?: FormEventHandler<HTMLFormElement>;
  toolbarActions?: ReactNode;
  toolbarClassName?: string;
  beforeTable?: ReactNode;
  afterTable?: ReactNode;
  footer?: ReactNode;
  items: readonly T[];
  columns: readonly CrudColumn<T>[];
  getRowKey: (item: T) => string;
  actions?: (item: T) => readonly OperatorAction[];
  actionLabel?: (item: T) => string;
  loading: boolean;
  loadingLabel?: string;
  error: string | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  empty?: ReactNode;
  pagination?: CrudPagination;
  sectionTitle?: string;
  sectionDescription?: string;
}) {
  const headingActions = (
    <>
      {headerActions}
      {createAction && (
        <Button asChild size="sm">
          <Link href={createAction.href}>{createAction.label}</Link>
        </Button>
      )}
    </>
  );
  const resolvedSectionTitle = sectionTitle ?? title;
  const showSectionHeading = resolvedSectionTitle !== title || Boolean(sectionDescription);
  const collectionContent =
    loading && items.length === 0 ? (
      <OperatorLoadingState
        variant="table"
        columns={columns.length + Number(Boolean(actions))}
        label={loadingLabel ?? `Loading ${title.toLowerCase()}`}
      />
    ) : items.length ? (
      <CrudTable
        items={items}
        columns={columns}
        getRowKey={getRowKey}
        actions={actions}
        actionLabel={actionLabel}
        footer={
          pagination && (
            <OperatorPagination
              hasPrevious={pagination.hasPrevious && !loading}
              hasNext={pagination.hasNext && !loading}
              onPrevious={pagination.onPrevious}
              onNext={pagination.onNext}
              summary={pagination.summary}
            />
          )
        }
      />
    ) : !error ? (
      (empty ?? (
        <OperatorEmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ))
    ) : null;

  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={headerActions || createAction ? headingActions : undefined}
      />
      {filters || sort || toolbarActions ? (
        <OperatorToolbar
          onSubmit={onFiltersSubmit}
          actions={toolbarActions}
          className={toolbarClassName}
        >
          <>
            {filters}
            {sort}
          </>
        </OperatorToolbar>
      ) : null}
      {beforeTable}
      {error && <OperatorErrorState message={error} retry={onRetry} />}
      {showSectionHeading ? (
        <OperatorSection title={resolvedSectionTitle} description={sectionDescription}>
          {collectionContent}
        </OperatorSection>
      ) : (
        <section aria-label={title} className="min-w-0">
          {collectionContent}
        </section>
      )}
      {afterTable}
      {footer}
    </OperatorPage>
  );
}
