import type { ID, Message, Reaction } from './types';

/** Events a community conversation can receive while it is open. */
export type ConversationEvent =
  | { type: 'message'; message: Message }
  | { type: 'reactions'; messageId: ID; reactions: Reaction[] }
  | { type: 'typing'; communityId: ID; names: string[] }
  | { type: 'read'; communityId: ID; upToMessageId: ID };

/**
 * Realtime transport for community conversations. The UI subscribes through
 * `useConversationEvents`, which merges events into the query cache, so swapping the
 * transport (Supabase Realtime, WebSocket, SSE) needs no screen changes.
 */
export interface RealtimeClient {
  subscribe(communityId: ID, onEvent: (event: ConversationEvent) => void): () => void;
  sendTyping(communityId: ID): void;
}

/** Used until a realtime transport is configured: conversations update on refetch only. */
export const noopRealtime: RealtimeClient = {
  subscribe: () => () => {},
  sendTyping: () => {},
};
