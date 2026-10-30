import type { InfiniteData } from '@tanstack/react-query';

import type { Message, Page } from '@/api/types';

/** Conversation history as cached: pages newest first, each page newest first. */
export type MessagePages = InfiniteData<Page<Message>, string | null>;

const same = (a: Message, b: Message) =>
  a.id === b.id || (!!a.clientId && a.clientId === b.clientId && a.isMine === b.isMine) || (a.seq !== null && a.seq === b.seq);

/** Unsent messages (no `seq`) first, then by `seq`, newest first. */
const newestFirst = (a: Message, b: Message) => {
  if (a.seq === null || b.seq === null) {
    if (a.seq === b.seq) return b.sentAt.localeCompare(a.sentAt);
    return a.seq === null ? -1 : 1;
  }
  return b.seq - a.seq;
};

/** A deleted message stays deleted, even if an older copy of it arrives later. */
function reconcile(current: Message, incoming: Message): Message {
  if (current.deletedAt && !incoming.deletedAt) return current;
  return incoming;
}

/**
 * Merges messages from any source (send response, live event, catch-up page) into the cache.
 * A message already present (same ID, same client ID from the same sender, or same `seq`) is
 * replaced in place, so an optimistic bubble becomes the server's copy and a message that
 * arrives both live and through catch-up appears once. New messages go to the newest page.
 */
export function mergeMessages(data: MessagePages | undefined, incoming: Message[]): MessagePages | undefined {
  if (!data || !incoming.length) return data;
  let pages = data.pages;
  const fresh: Message[] = [];
  for (const message of incoming) {
    let found = false;
    pages = pages.map((page) => {
      if (!page.items.some((m) => same(m, message))) return page;
      found = true;
      return { ...page, items: page.items.map((m) => (same(m, message) ? reconcile(m, message) : m)) };
    });
    if (!found && !fresh.some((m) => same(m, message))) fresh.push(message);
  }
  const [first, ...rest] = pages;
  const firstItems = [...fresh, ...(first?.items ?? [])].sort(newestFirst);
  return { ...data, pages: [{ nextCursor: first?.nextCursor ?? null, items: firstItems }, ...rest] };
}

/** Applies a change to one message, found by ID or client ID. */
export function patchMessage(data: MessagePages | undefined, id: string, fn: (m: Message) => Message): MessagePages | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === id || m.clientId === id ? fn(m) : m)) })) };
}

export const markDeleted = (data: MessagePages | undefined, id: string, at = new Date().toISOString()) =>
  patchMessage(data, id, (m) => ({ ...m, text: '', attachments: [], link: null, reactions: [], deletedAt: m.deletedAt ?? at }));

/** The highest `seq` the cache holds, or null when it holds none. */
export function maxSeq(data: MessagePages | undefined): number | null {
  let max: number | null = null;
  for (const page of data?.pages ?? []) {
    for (const m of page.items) if (m.seq !== null && (max === null || m.seq > max)) max = m.seq;
  }
  return max;
}
