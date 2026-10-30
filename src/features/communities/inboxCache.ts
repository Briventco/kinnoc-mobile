import type { InboxEntry, Message } from '@/api/types';

/**
 * Applies a live message to the cached inbox: it becomes the row's last message, counts as unread
 * when someone else sent it, and the row moves to the top. A message the row already shows (same
 * or older `seq`) changes nothing, so a repeated event is not counted twice.
 */
export function withLiveMessage(entries: InboxEntry[] | undefined, communityId: string, message: Message): InboxEntry[] | undefined {
  if (!entries) return entries;
  const index = entries.findIndex((e) => e.community.id === communityId);
  if (index < 0 || message.deletedAt) return entries;
  const entry = entries[index];
  const shownSeq = entry.lastMessage?.seq;
  if (message.seq !== null && shownSeq != null && message.seq <= shownSeq) return entries;

  const updated: InboxEntry = {
    ...entry,
    lastMessage: {
      seq: message.seq,
      senderName: message.isMine ? 'You' : (message.sender?.displayName.split(' ')[0] ?? 'Former member'),
      isMine: message.isMine,
      text: message.text,
      kind: message.attachments.length && !message.text ? 'photo' : 'text',
      sentAt: message.sentAt,
    },
    unreadCount: message.isMine ? entry.unreadCount : entry.unreadCount + 1,
    // Their message has arrived, so they have stopped typing.
    typing: entry.typing.filter((name) => name !== message.sender?.displayName.split(' ')[0]),
  };
  const rest = entries.filter((_, i) => i !== index);
  // Pinned rows stay first; the updated row leads the rest.
  const pinned = rest.filter((e) => e.isPinned);
  const others = rest.filter((e) => !e.isPinned);
  return updated.isPinned ? [updated, ...pinned, ...others] : [...pinned, updated, ...others];
}
