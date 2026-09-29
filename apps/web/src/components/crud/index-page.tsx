import { useState, type FormEventHandler, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "../ui/button";
import { OperatorEmptyState } from "../operator/ui/empty-state";
import { OperatorErrorState } from "../operator/ui/error-state";
import { OperatorLoadingState } from "../operator/ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "../operator/ui/page";
import { OperatorPagination } from "../operator/ui/pagination";
import { OperatorSection } from "../operator/ui/section";
import { OperatorToolbar } from "../operator/ui/toolbar";
import { CrudTable, type CrudColumn } from "./table";
import { CrudBulkActions, type CrudBulkAction } from "./bulk-actions";
import type { OperatorAction } from "../operator/ui/actions-menu";

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
  onFiltersReset,
  filtersDirty,
  resetLabel,
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
  initialized,
  loadingLabel,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  empty,
  pagination,
  selection,
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
  onFiltersReset?: () => boolean | void | Promise<boolean | void>;
  filtersDirty?: boolean;
  resetLabel?: string;
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
  initialized?: boolean;
  loadingLabel?: string;
  error: string | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  empty?: ReactNode;
  pagination?: CrudPagination;
  selection?: {
    labelForItem: (item: T) => string;
    bulkActions: readonly CrudBulkAction<T>[];
  };
  sectionTitle?: string;
  sectionDescription?: string;
}) {
  const collectionInitialized = initialized ?? !loading;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const clearSelection = () => setSelectedKeys(new Set());
  const selectedItems = items.filter((item) => selectedKeys.has(getRowKey(item)));
  const handleFilterSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    clearSelection();
    onFiltersSubmit?.(event);
  };
  async function resetFilters() {
    if (!onFiltersReset) return;
    const completed = await onFiltersReset();
    if (completed !== false) clearSelection();
  }
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
    !collectionInitialized && loading ? (
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
        selection={
          selection?.bulkActions.length
            ? { selectedKeys, onChange: setSelectedKeys, labelForItem: selection.labelForItem }
            : undefined
        }
        footer={
          pagination && (
            <OperatorPagination
              hasPrevious={pagination.hasPrevious && !loading}
              hasNext={pagination.hasNext && !loading}
              onPrevious={() => {
                clearSelection();
                pagination.onPrevious();
              }}
              onNext={() => {
                clearSelection();
                pagination.onNext();
              }}
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
      {filters || sort || toolbarActions || onFiltersReset ? (
        <OperatorToolbar
          onSubmit={handleFilterSubmit}
          actions={
            <>
              {toolbarActions}
              {onFiltersReset && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || !filtersDirty}
                  onClick={() => void resetFilters()}
                >
                  {resetLabel ?? "Clear"}
                </Button>
              )}
            </>
          }
          className={toolbarClassName}
        >
          <>
            {filters}
            {sort}
          </>
        </OperatorToolbar>
      ) : null}
      {beforeTable}
      {collectionInitialized && loading && (
        <p role="status" className="text-sm text-slate-500" aria-live="polite">
          Updating {title.toLowerCase()}…
        </p>
      )}
      {error && <OperatorErrorState message={error} retry={onRetry} />}
      {selection?.bulkActions.length ? (
        <CrudBulkActions
          items={selectedItems}
          actions={selection.bulkActions}
          onComplete={clearSelection}
        />
      ) : null}
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
