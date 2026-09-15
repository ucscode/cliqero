export class TronProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TronProtocolError";
  }
}
