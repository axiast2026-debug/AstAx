import { Injectable } from "@nestjs/common";

/** What changed, never the data itself: the page reads it again from the API (ADR 0008). */
export interface RealtimeEvent {
  type: "AUCTION_CHANGED" | "REQUEST_CHANGED";
  requestId: string;
}

type Listener = (event: RealtimeEvent) => void;

/**
 * The changes to forward to the browsers that follow them: from the API's own
 * use cases and, through Redis, from the worker. The Socket.IO gateway listens.
 */
@Injectable()
export class RealtimeHub {
  readonly #listeners = new Set<Listener>();

  listen(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(event: RealtimeEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  async auctionChanged(requestId: string): Promise<void> {
    this.emit({ type: "AUCTION_CHANGED", requestId });
  }
}
