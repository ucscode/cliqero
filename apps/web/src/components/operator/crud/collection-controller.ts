import { CursorHistory } from "../ui/cursor-history";
import type { CrudPage, CrudPageReader } from "./use-collection";

/** Owns the accepted filters and cursor history for one operator collection. */
export class CrudCollectionController<TFilters, TItem> {
  private appliedFilters: TFilters;
  private history = CursorHistory.firstPage();
  private cursor: string | null = null;
  private nextCursor: string | null = null;
  private busy = false;
  private reader: CrudPageReader<TFilters, TItem>;
  private pageSize: number;
  initialized = false;
  loading = false;
  items: TItem[] = [];
  error: string | null = null;

  constructor(reader: CrudPageReader<TFilters, TItem>, initialFilters: TFilters, pageSize = 25) {
    this.reader = reader;
    this.appliedFilters = initialFilters;
    this.pageSize = pageSize;
  }

  setReader(reader: CrudPageReader<TFilters, TItem>) {
    this.reader = reader;
  }

  get hasPrevious() {
    return this.history.hasPrevious;
  }
  get hasNext() {
    return Boolean(this.nextCursor);
  }

  get nextCursorValue() {
    return this.nextCursor;
  }

  get currentPageSize() {
    return this.pageSize;
  }

  setInitialPageSize(pageSize: number) {
    if (!this.initialized && Number.isInteger(pageSize) && pageSize > 0) this.pageSize = pageSize;
  }

  async apply(filters: TFilters, pageSize = this.pageSize): Promise<boolean> {
    if (!(await this.request(filters, null, pageSize))) return false;
    this.appliedFilters = filters;
    this.pageSize = pageSize;
    this.cursor = null;
    this.history = CursorHistory.firstPage();
    return true;
  }

  async next(): Promise<boolean> {
    const target = this.nextCursor;
    if (!target || this.busy) return false;
    if (!(await this.request(this.appliedFilters, target, this.pageSize))) return false;
    this.history = this.history.afterNext(target);
    return true;
  }

  async previous(): Promise<boolean> {
    if (!this.history.hasPrevious || this.busy) return false;
    const target = this.history.previous;
    if (!(await this.request(this.appliedFilters, target, this.pageSize))) return false;
    this.history = this.history.afterPrevious();
    return true;
  }

  retry(): Promise<boolean> {
    return this.request(this.appliedFilters, this.cursor, this.pageSize);
  }

  refresh(): Promise<boolean> {
    return this.apply(this.appliedFilters);
  }

  setPageSize(pageSize: number): Promise<boolean> {
    if (!Number.isInteger(pageSize) || pageSize < 1 || this.busy) return Promise.resolve(false);
    return this.apply(this.appliedFilters, pageSize);
  }

  private async request(
    filters: TFilters,
    cursor: string | null,
    pageSize: number,
  ): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.loading = true;
    this.error = null;
    try {
      const page: CrudPage<TItem> = await this.reader(filters, cursor, pageSize);
      this.items = page.items;
      this.nextCursor = page.nextCursor;
      this.cursor = cursor;
      this.initialized = true;
      return true;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "The collection could not be loaded.";
      return false;
    } finally {
      this.loading = false;
      this.busy = false;
    }
  }
}
