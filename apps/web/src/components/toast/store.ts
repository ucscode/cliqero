export type ToastKind = "success" | "error" | "info";
export type ToastMessage = { id: number; kind: ToastKind; message: string };

/** Owns transient notification state and auto-dismiss timers for one application shell. */
export class ToastStore {
  private listeners = new Set<() => void>();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private sequence = 0;
  private messages: ToastMessage[] = [];

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.messages;

  push(kind: ToastKind, message: string) {
    const id = ++this.sequence;
    this.messages = [...this.messages, { id, kind, message }];
    const duration = kind === "success" ? 4000 : kind === "info" ? 5000 : 6000;
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), duration),
    );
    this.emit();
    return id;
  }

  dismiss(id: number) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    const next = this.messages.filter((message) => message.id !== id);
    if (next.length === this.messages.length) return;
    this.messages = next;
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
