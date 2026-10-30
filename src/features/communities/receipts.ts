import type { DeliveryStatus, Message, Receipts } from '@/api/types';

/**
 * Combines the receipts held for a conversation with newer ones from a page, the subscribe
 * acknowledgement or a live event. The aggregates only rise while membership is stable, and a
 * page requested before a live event can arrive after it, so each position keeps its highest
 * value instead of trusting whichever answer came last.
 */
export function mergeReceipts(current: Receipts | null | undefined, next: Receipts | null | undefined): Receipts | null {
  if (!next) return current ?? null;
  if (!current) return next;
  const deliveredSeq = Math.max(current.deliveredSeq, next.deliveredSeq);
  const readSeq = Math.max(current.readSeq, next.readSeq);
  return deliveredSeq === current.deliveredSeq && readSeq === current.readSeq ? current : { deliveredSeq, readSeq };
}

/** The tick for one of the viewer's messages already on the server. */
export function statusForSeq(seq: number, receipts: Receipts | null | undefined): 'sent' | 'delivered' | 'read' {
  if (!receipts) return 'sent';
  if (seq <= receipts.readSeq) return 'read';
  if (seq <= receipts.deliveredSeq) return 'delivered';
  return 'sent';
}

/**
 * What the delivery line under one of the viewer's own messages shows. Sending and failed sends
 * keep their local state. Without receipts the message's own status stands (one tick for a server
 * copy). Other people's messages never show a status.
 */
export function deliveryStatus(message: Message, receipts: Receipts | null | undefined): DeliveryStatus {
  if (!message.isMine || message.seq === null || message.status === 'sending' || message.status === 'failed') return message.status;
  return receipts ? statusForSeq(message.seq, receipts) : message.status;
}
