import type { SavedItem } from '@/api/types';
import { DiscoverRow } from '@/features/discover/DiscoverRows';
import { PostRow } from '@/features/feed/PostRow';

/** A saved post or Discover item. Its bookmark button removes it from Saved. */
export function SavedRow({ item }: { item: SavedItem }) {
  return item.kind === 'post' ? <PostRow post={item.post} /> : <DiscoverRow item={item.item} />;
}

export const savedKey = (item: SavedItem) => (item.kind === 'post' ? `post:${item.post.id}` : `discover:${item.item.id}`);
