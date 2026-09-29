import { CursorHistory } from "./cursor-history";
import { validateCrudMaxRows } from "./max-rows";
import type { CrudPage, CrudPageReader } from "./use-collection";

/** Owns the accepted filters and cursor history for one CRUD collection. */
export class CrudCollectionController<TFilters, TItem> {
  private appliedFilters: TFilters;
  private history = CursorHistory.firstPage();
  private cursor: string | null = null;
  private nextCursor: string | null = null;
  private busy = false;
  private initialization: Promise<boolean> | null = null;
  private reader: CrudPageReader<TFilters, TItem>;
  readonly maxRows: number;
  initialized = false;
  loading = false;
  items: TItem[] = [];
  error: string | null = null;

  constructor(reader: CrudPageReader<TFilters, TItem>, initialFilters: TFilters, maxRows = 50) {
    this.reader = reader;
    this.appliedFilters = initialFilters;
    this.maxRows = validateCrudMaxRows(maxRows);
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

  initialize(filters: TFilters): Promise<boolean> {
    // React Strict Mode replays mount effects in development. Share the first
    // request so the replay does not race the controller's busy guard.
    this.initialization ??= this.apply(filters);
    return this.initialization;
  }

  async apply(filters: TFilters): Promise<boolean> {
    if (!(await this.request(filters, null))) return false;
    this.appliedFilters = filters;
    this.cursor = null;
    this.history = CursorHistory.firstPage();
    return true;
  }

  async next(): Promise<boolean> {
    const target = this.nextCursor;
    if (!target || this.busy) return false;
    if (!(await this.request(this.appliedFilters, target))) return false;
    this.history = this.history.afterNext(target);
    return true;
  }

  async previous(): Promise<boolean> {
    if (!this.history.hasPrevious || this.busy) return false;
    const target = this.history.previous;
    if (!(await this.request(this.appliedFilters, target))) return false;
    this.history = this.history.afterPrevious();
    return true;
  }

  retry(): Promise<boolean> {
    return this.request(this.appliedFilters, this.cursor);
  }

  refresh(): Promise<boolean> {
    return this.apply(this.appliedFilters);
  }

  private async request(filters: TFilters, cursor: string | null): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.loading = true;
    this.error = null;
    try {
      const page: CrudPage<TItem> = await this.reader(filters, cursor, this.maxRows);
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
