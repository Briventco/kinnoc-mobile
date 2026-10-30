import { createLikeSync, type LikeState } from '../likes';

/** A server whose answers the test releases one by one. */
function setup() {
  const server = { liked: false, likeCount: 5 };
  const pending: (() => void)[] = [];
  const shown: LikeState[] = [];
  const send = jest.fn(
    (_postId: string, liked: boolean) =>
      new Promise<{ likedByMe: boolean; likeCount: number }>((resolve) =>
        pending.push(() => {
          if (server.liked !== liked) server.likeCount += liked ? 1 : -1;
          server.liked = liked;
          resolve({ likedByMe: server.liked, likeCount: server.likeCount });
        }),
      ),
  );
  const setLiked = createLikeSync({ send, apply: (_id, s) => shown.push(s) });
  const answer = async () => {
    pending.shift()?.();
    await new Promise<void>((r) => setImmediate(() => r()));
  };
  return { server, send, setLiked, shown, answer, pending };
}

describe('createLikeSync', () => {
  it('shows a like at once and settles on the server’s count', async () => {
    const { setLiked, shown, answer, send } = setup();
    const done = setLiked('p1', { liked: false, likeCount: 5 }, true);
    expect(shown.at(-1)).toEqual({ liked: true, likeCount: 6 });
    await answer();
    await done;
    expect(send).toHaveBeenCalledTimes(1);
    expect(shown.at(-1)).toEqual({ liked: true, likeCount: 6 });
  });

  it('sends one request at a time and ends on the last of several rapid taps', async () => {
    const { setLiked, shown, answer, send, server } = setup();
    const first = setLiked('p1', { liked: false, likeCount: 5 }, true);
    setLiked('p1', shown.at(-1)!, false);
    setLiked('p1', shown.at(-1)!, true);
    setLiked('p1', shown.at(-1)!, false);
    expect(shown.at(-1)).toEqual({ liked: false, likeCount: 5 });
    expect(send).toHaveBeenCalledTimes(1);

    await answer(); // like confirmed; the last tap was "unlike", so one more request follows
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('p1', false);
    await answer();
    await first;
    expect(server).toEqual({ liked: false, likeCount: 5 });
    expect(shown.at(-1)).toEqual({ liked: false, likeCount: 5 });
  });

  it('sends nothing more when the taps cancel out before the first answer differs', async () => {
    const { setLiked, shown, answer, send } = setup();
    const run = setLiked('p1', { liked: false, likeCount: 5 }, true);
    setLiked('p1', shown.at(-1)!, false);
    setLiked('p1', shown.at(-1)!, true);
    await answer();
    await run;
    expect(send).toHaveBeenCalledTimes(1);
    expect(shown.at(-1)).toEqual({ liked: true, likeCount: 6 });
  });

  it('rolls back to the last confirmed state when the server refuses', async () => {
    const shown: LikeState[] = [];
    const setLiked = createLikeSync({
      send: () => Promise.reject(new Error('MEMBERSHIP_REQUIRED')),
      apply: (_id, s) => shown.push(s),
    });
    await expect(setLiked('p1', { liked: false, likeCount: 5 }, true)).rejects.toThrow('MEMBERSHIP_REQUIRED');
    expect(shown).toEqual([
      { liked: true, likeCount: 6 },
      { liked: false, likeCount: 5 },
    ]);
  });

  it('keeps posts independent', async () => {
    const { setLiked, send, answer } = setup();
    void setLiked('p1', { liked: false, likeCount: 5 }, true);
    void setLiked('p2', { liked: false, likeCount: 1 }, true);
    expect(send.mock.calls.map((c) => c[0])).toEqual(['p1', 'p2']);
    await answer();
    await answer();
  });
});
