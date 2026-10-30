import type { SupabaseClient } from '@supabase/supabase-js';

import { AVATAR_BUCKET, AVATAR_LIMITS, createImageRemover, createImageUploader, POST_MEDIA_BUCKET } from '../storage';

let mockByteLength = 1000;
const mockSize = { width: 1600, height: 900 };
const mockOps: unknown[] = [];

jest.mock('expo-image-manipulator', () => {
  const render = () => ({
    width: mockSize.width,
    height: mockSize.height,
    saveAsync: async () => ({ uri: 'file:///tmp/out.jpg', width: mockSize.width, height: mockSize.height }),
  });
  const chain = {
    crop: (rect: unknown) => (mockOps.push({ crop: rect }), chain),
    resize: (size: unknown) => (mockOps.push({ resize: size }), chain),
    renderAsync: async () => render(),
  };
  return { ImageManipulator: { manipulate: () => chain }, SaveFormat: { JPEG: 'jpeg' } };
});

jest.mock('expo-file-system', () => ({
  File: class {
    async arrayBuffer() {
      return new ArrayBuffer(mockByteLength);
    }
  },
}));

jest.mock('@/lib/format', () => ({ uid: () => 'random-name' }));

function supabase({ userId = 'user-1' as string | null, uploadError = null as null | { statusCode?: number; message: string } } = {}) {
  const upload = jest.fn(async () => ({ data: uploadError ? null : { path: 'x' }, error: uploadError }));
  const remove = jest.fn(async (_keys: string[]) => ({ data: [], error: null as null | { message: string } }));
  const client = {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
    storage: {
      from: jest.fn(() => ({
        upload,
        remove,
        getPublicUrl: (key: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/post-media/${key}` } }),
      })),
    },
  };
  return { client: client as unknown as SupabaseClient, upload, remove, from: client.storage.from };
}

beforeEach(() => {
  mockByteLength = 1000;
  mockOps.length = 0;
});

describe('createImageUploader', () => {
  it('uploads a JPEG into the user’s own folder and returns its key, URL and size', async () => {
    const { client, upload, from } = supabase();
    const image = await createImageUploader(client, POST_MEDIA_BUCKET)('file:///picked.heic');
    expect(from).toHaveBeenCalledWith('post-media');
    expect(upload).toHaveBeenCalledWith('user-1/random-name.jpg', expect.any(ArrayBuffer), { contentType: 'image/jpeg', upsert: false });
    expect(image).toEqual({
      key: 'user-1/random-name.jpg',
      url: 'https://x.supabase.co/storage/v1/object/public/post-media/user-1/random-name.jpg',
      width: 1600,
      height: 900,
    });
  });

  it('refuses images over 5 MB without uploading them', async () => {
    mockByteLength = 5 * 1024 * 1024 + 1;
    const { client, upload } = supabase();
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('file:///big.jpg')).rejects.toMatchObject({ code: 'validation' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('fails, and returns no key, when storage refuses the upload', async () => {
    const { client } = supabase({ uploadError: { statusCode: 403, message: 'new row violates row-level security policy' } });
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('file:///a.jpg')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('reports a network failure as retryable', async () => {
    const { client } = supabase({ uploadError: { message: 'Network request failed' } });
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('file:///a.jpg')).rejects.toMatchObject({ code: 'network', retryable: true });
  });

  it('needs a signed-in session', async () => {
    const { client, upload } = supabase({ userId: null });
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('file:///a.jpg')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('profile photos', () => {
  it('centre-crops to a square, shrinks to 512 px and uploads to the avatars bucket', async () => {
    const { client, upload, from } = supabase();
    await createImageUploader(client, AVATAR_BUCKET, AVATAR_LIMITS)('file:///wide.jpg');
    expect(mockOps).toEqual([{ crop: { originX: 350, originY: 0, width: 900, height: 900 } }, { resize: { width: 512, height: null } }]);
    expect(from).toHaveBeenCalledWith('avatars');
    expect(upload).toHaveBeenCalledWith('user-1/random-name.jpg', expect.any(ArrayBuffer), { contentType: 'image/jpeg', upsert: false });
  });

  it('refuses photos over 2 MB without uploading them', async () => {
    mockByteLength = 2 * 1024 * 1024 + 1;
    const { client, upload } = supabase();
    await expect(createImageUploader(client, AVATAR_BUCKET, AVATAR_LIMITS)('file:///a.jpg')).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('2 MB'),
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('removes only files inside the signed-in user’s folder', async () => {
    const { client, remove } = supabase();
    const removeFile = createImageRemover(client, AVATAR_BUCKET);
    await removeFile('user-1/old.jpg');
    await removeFile('user-2/theirs.jpg');
    await removeFile('user-1/../user-2/theirs.jpg');
    expect(remove.mock.calls).toEqual([[['user-1/old.jpg']]]);
  });
});
