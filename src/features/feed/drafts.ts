import type { KinnocApi } from '@/api/contract';
import { ApiError } from '@/api/errors';
import type { Post, PostImage } from '@/api/types';
import { uid } from '@/lib/format';

/** API limits (kinnoc-api docs/api-contract.md). */
export const POST_MAX_LENGTH = 5000;
export const COMMENT_MAX_LENGTH = 2000;
export const MAX_POST_IMAGES = 4;
const LINK_MAX_LENGTH = 2048;

/**
 * Checks an optional link the way the API does: one absolute http(s) URL, at most 2048
 * characters, without embedded credentials. A bare domain gets `https://`. Returns the URL to
 * send (null when empty) or a message to show. Written without `URL`, whose React Native
 * implementation is incomplete.
 */
export function validateLink(input: string): { url: string | null } | { error: string } {
  const value = input.trim();
  if (!value) return { url: null };
  if (/\s/.test(value)) return { error: 'Links can’t contain spaces.' };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  if (hasScheme && !/^https?:\/\//i.test(value)) return { error: 'Use a link that starts with http:// or https://.' };
  const url = hasScheme ? value : `https://${value}`;
  const authority = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
  if (authority.includes('@')) return { error: 'Links can’t include a username or password.' };
  const host = authority.replace(/:\d+$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) && !/^\[[0-9a-f:]+\]$/i.test(host)) return { error: 'That doesn’t look like a web address.' };
  if (url.length > LINK_MAX_LENGTH) return { error: 'That link is too long.' };
  return { url };
}

/**
 * The idempotency key for one logical request. While the content stays the same, retries reuse
 * the key, so a request whose response was lost is not repeated on the server. Changed content is
 * a new request and gets a new key; so does anything after `reset` (a successful send).
 */
export function createIdempotencyKey() {
  let current: { signature: string; id: string } | null = null;
  return {
    for(signature: string) {
      if (current?.signature !== signature) current = { signature, id: uid() };
      return current.id;
    },
    reset() {
      current = null;
    },
  };
}

export interface PostDraft {
  text: string;
  communityId: string | null;
  /** Local image URIs, in order. */
  photos: string[];
  /** As typed; validated before sending. */
  link: string;
}

/**
 * Publishes one post from the composer. Images are uploaded first and the post is created only
 * with keys storage has accepted; an upload that fails fails the post. Uploaded images are kept
 * per local URI, so a retry uploads only what is missing, and the post's `clientId` is kept while
 * the draft is unchanged, so a retry after a lost response returns the original post.
 */
export function createPostPublisher(api: Pick<KinnocApi, 'feed' | 'media'>) {
  const key = createIdempotencyKey();
  const uploads = new Map<string, PostImage>();

  return async (draft: PostDraft): Promise<Post> => {
    const text = draft.text.trim();
    const link = validateLink(draft.link);
    if ('error' in link) throw new ApiError('validation', link.error, null, { link: link.error });
    const photos = draft.photos.slice(0, MAX_POST_IMAGES);

    const results = await Promise.allSettled(
      photos.map(async (uri) => {
        const done = uploads.get(uri);
        if (done) return done;
        const image = await api.media.uploadPostImage(uri);
        uploads.set(uri, image);
        return image;
      }),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
    const media = results.map((r) => (r as PromiseFulfilledResult<PostImage>).value);

    const clientId = key.for(JSON.stringify([text, draft.communityId, photos, link.url]));
    const post = await api.feed.create({ clientId, text, communityId: draft.communityId, media, link: link.url });
    key.reset();
    return post;
  };
}
