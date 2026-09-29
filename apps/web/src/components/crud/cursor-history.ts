/** Immutable cursor stack for previous/next navigation over keyset pages. */
export class CursorHistory {
  private constructor(private readonly cursors: readonly (string | null)[]) {}

  static firstPage() {
    return new CursorHistory([null]);
  }

  get current(): string | null {
    return this.cursors.at(-1) ?? null;
  }

  get hasPrevious(): boolean {
    return this.cursors.length > 1;
  }

  get previous(): string | null {
    return this.hasPrevious ? (this.cursors.at(-2) ?? null) : null;
  }

  afterNext(cursor: string): CursorHistory {
    return new CursorHistory([...this.cursors, cursor]);
  }

  afterPrevious(): CursorHistory {
    return this.hasPrevious ? new CursorHistory(this.cursors.slice(0, -1)) : this;
  }
}
