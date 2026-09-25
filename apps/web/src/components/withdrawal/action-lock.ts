export class ActionLock {
  private running = false;

  async run(action: () => Promise<void>): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      await action();
      return true;
    } finally {
      this.running = false;
    }
  }
}
