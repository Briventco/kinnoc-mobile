export interface LikeState {
  liked: boolean;
  likeCount: number;
}

interface LikeSyncOptions {
  /** Sets the post's like on the server (idempotent) and returns the server's state. */
  send: (postId: string, liked: boolean) => Promise<{ likedByMe: boolean; likeCount: number }>;
  /** Shows a like state on screen. */
  apply: (postId: string, state: LikeState) => void;
}

/**
 * Keeps likes correct under rapid taps. Each tap shows its result at once; requests for one post
 * go one at a time, and when the last answer differs from the latest tap, one more request
 * follows. So any burst of taps ends in the state of the last tap, confirmed by the server. When
 * a request fails, the post returns to the last state the server confirmed and the error is
 * passed to the caller.
 */
export function createLikeSync({ send, apply }: LikeSyncOptions) {
  const posts = new Map<string, { confirmed: LikeState; desired: boolean; run: Promise<void> | null }>();

  const shown = (confirmed: LikeState, desired: boolean): LikeState => ({
    liked: desired,
    likeCount: Math.max(0, confirmed.likeCount + (desired === confirmed.liked ? 0 : desired ? 1 : -1)),
  });

  async function sync(postId: string) {
    const entry = posts.get(postId)!;
    try {
      while (entry.desired !== entry.confirmed.liked) {
        const result = await send(postId, entry.desired);
        entry.confirmed = { liked: result.likedByMe, likeCount: result.likeCount };
      }
      apply(postId, entry.confirmed);
    } catch (error) {
      apply(postId, entry.confirmed);
      throw error;
    } finally {
      posts.delete(postId);
    }
  }

  /**
   * Shows `liked` at once and makes the server agree. `current` is what the screen shows now; it
   * is the server's state whenever nothing is in flight for this post. Every call made during one
   * burst resolves (or rejects) together.
   */
  return function setLiked(postId: string, current: LikeState, liked: boolean): Promise<void> {
    let entry = posts.get(postId);
    if (!entry) {
      entry = { confirmed: current, desired: liked, run: null };
      posts.set(postId, entry);
    }
    entry.desired = liked;
    apply(postId, shown(entry.confirmed, liked));
    entry.run ??= sync(postId);
    return entry.run;
  };
}
