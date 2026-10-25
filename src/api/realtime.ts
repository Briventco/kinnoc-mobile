import type { ID, Message, Reaction } from './types';

/** Events a community conversation can receive while it is open. */
export type ConversationEvent =
  | { type: 'message'; message: Message }
  | { type: 'deleted'; messageId: ID }
  | { type: 'reactions'; messageId: ID; reactions: Reaction[] }
  | { type: 'typing'; communityId: ID; names: string[] }
  /** The viewer's own read position changed (for example on another device). */
  | { type: 'read'; communityId: ID; lastReadSeq: number }
  /**
   * The subscription is (re)established. `lastSeq` is the newest message on the server; anything
   * newer than what the client holds must be fetched (missed while disconnected).
   */
  | { type: 'subscribed'; lastSeq: number }
  /** The viewer left or was removed: no more events will arrive. */
  | { type: 'ended' }
  /** The server refused the subscription (for example, no longer a member). */
  | { type: 'error'; code: string | null };

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'offline';

/**
 * Realtime transport for community conversations. The UI subscribes through
 * `useConversationEvents`, which merges events into the query cache, so swapping the
 * transport needs no screen changes.
 */
export interface RealtimeClient {
  /** True when events are pushed live. When false, screens refresh by polling. */
  readonly live: boolean;
  subscribe(communityId: ID, onEvent: (event: ConversationEvent) => void): () => void;
  sendTyping(communityId: ID): void;
  status(): RealtimeStatus;
  onStatus(listener: (status: RealtimeStatus) => void): () => void;
  /** Closes the connection and forgets every subscription (sign-out). */
  reset(): void;
}

/** Used when no realtime transport is configured: conversations update on refetch only. */
export const noopRealtime: RealtimeClient = {
  live: false,
  subscribe: () => () => {},
  sendTyping: () => {},
  status: () => 'idle',
  onStatus: () => () => {},
  reset: () => {},
};
