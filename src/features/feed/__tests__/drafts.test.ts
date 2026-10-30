import { ApiError } from '@/api/errors';
import type { CreatePostInput, PostImage } from '@/api/types';

import { createIdempotencyKey, createPostPublisher, validateLink } from '../drafts';

jest.mock('@/lib/format', () => {
  let n = 0;
  return { uid: () => `id-${++n}` };
});

describe('validateLink', () => {
  it('accepts http(s) links and adds https:// to a bare domain', () => {
    expect(validateLink('')).toEqual({ url: null });
    expect(validateLink('  ')).toEqual({ url: null });
    expect(validateLink('https://kinnoc.com/jobs/42?ref=feed#top')).toEqual({ url: 'https://kinnoc.com/jobs/42?ref=feed#top' });
    expect(validateLink('http://localhost.test:8080/x')).toEqual({ url: 'http://localhost.test:8080/x' });
    expect(validateLink('kinnoc.com/jobs')).toEqual({ url: 'https://kinnoc.com/jobs' });
  });

  it('refuses what the API refuses', () => {
    expect(validateLink('ftp://kinnoc.com')).toHaveProperty('error');
    expect(validateLink('javascript:alert(1)')).toHaveProperty('error');
    expect(validateLink('https://user:pass@kinnoc.com')).toHaveProperty('error');
    expect(validateLink('https://kinnoc com')).toHaveProperty('error');
    expect(validateLink('not a link')).toHaveProperty('error');
    expect(validateLink('https://nodot')).toHaveProperty('error');
    expect(validateLink(`https://kinnoc.com/${'a'.repeat(2048)}`)).toHaveProperty('error');
  });
});

describe('createIdempotencyKey', () => {
  it('keeps the key while the content is unchanged, and makes a new one otherwise', () => {
    const key = createIdempotencyKey();
    const a = key.for('hello');
    expect(key.for('hello')).toBe(a);
    const b = key.for('hello!');
    expect(b).not.toBe(a);
    key.reset();
    expect(key.for('hello!')).not.toBe(b);
  });
});

function setup() {
  const uploaded: string[] = [];
  const failOnce = new Set<string>();
  const uploadPostImage = jest.fn(async (uri: string): Promise<PostImage> => {
    if (failOnce.delete(uri)) throw new ApiError('network', 'Upload failed');
    uploaded.push(uri);
    return { key: `u1/${uri}.jpg`, url: `https://x/${uri}.jpg`, width: 800, height: 600 };
  });
  const create = jest.fn(async (input: CreatePostInput) => ({ id: 'p1', ...input }) as never);
  const publish = createPostPublisher({ feed: { create } as never, media: { uploadPostImage } as never });
  return { publish, create, uploadPostImage, uploaded, failOnce };
}

const draft = { text: ' Hello ', communityId: 'c1', photos: ['a', 'b'], link: 'kinnoc.com' };

describe('createPostPublisher', () => {
  it('uploads the photos, then creates the post with their keys, a client ID and the normalised link', async () => {
    const { publish, create } = setup();
    await publish(draft);
    expect(create).toHaveBeenCalledWith({
      clientId: expect.any(String),
      text: 'Hello',
      communityId: 'c1',
      media: [
        { key: 'u1/a.jpg', url: 'https://x/a.jpg', width: 800, height: 600 },
        { key: 'u1/b.jpg', url: 'https://x/b.jpg', width: 800, height: 600 },
      ],
      link: 'https://kinnoc.com',
    });
  });

  it('does not create the post when an upload fails, and uploads only what is missing on retry', async () => {
    const { publish, create, uploadPostImage, failOnce } = setup();
    failOnce.add('b');
    await expect(publish(draft)).rejects.toMatchObject({ code: 'network' });
    expect(create).not.toHaveBeenCalled();
    await publish(draft);
    expect(uploadPostImage.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'b']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('retries a failed create with the same client ID', async () => {
    const { publish, create } = setup();
    create.mockRejectedValueOnce(new ApiError('timeout', 'Timed out'));
    await expect(publish(draft)).rejects.toMatchObject({ code: 'timeout' });
    await publish(draft);
    expect(create.mock.calls[0][0].clientId).toBe(create.mock.calls[1][0].clientId);
  });

  it('uses a new client ID once the draft changes, and for the next post', async () => {
    const { publish, create } = setup();
    create.mockRejectedValueOnce(new ApiError('network', 'Offline'));
    await expect(publish(draft)).rejects.toBeTruthy();
    await publish({ ...draft, text: 'Hello again' });
    await publish({ ...draft, text: 'Hello again' });
    const ids = create.mock.calls.map((c) => c[0].clientId);
    expect(new Set(ids).size).toBe(3);
  });

  it('refuses an invalid link before uploading anything', async () => {
    const { publish, uploadPostImage, create } = setup();
    await expect(publish({ ...draft, link: 'ftp://x.com' })).rejects.toMatchObject({ code: 'validation' });
    expect(uploadPostImage).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('sends at most four photos', async () => {
    const { publish, create } = setup();
    await publish({ ...draft, photos: ['a', 'b', 'c', 'd', 'e'] });
    expect(create.mock.calls[0][0].media).toHaveLength(4);
  });
});
