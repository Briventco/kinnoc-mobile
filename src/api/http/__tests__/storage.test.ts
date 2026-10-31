import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import {
  AVATAR_BUCKET,
  AVATAR_LIMITS,
  createImageRemover,
  createImageUploader,
  detectImageFormat,
  POST_MEDIA_BUCKET,
  processCanvas,
} from '../storage';

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

jest.mock('heic2any', () => ({
  __esModule: true,
  default: jest.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })),
}));

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

describe('detectImageFormat', () => {
  it('identifies JPEG magic bytes', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageFormat(bytes)).toBe('jpeg');
  });

  it('identifies PNG magic bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageFormat(bytes)).toBe('png');
  });

  it('identifies WebP magic bytes', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]);
    expect(detectImageFormat(bytes)).toBe('webp');
  });

  it('identifies HEIC/HEIF ftyp container brand', () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x68, 0x65, 0x69, 0x63, // 'heic'
      0x00, 0x00, 0x00, 0x00,
    ]);
    expect(detectImageFormat(bytes)).toBe('heic');
  });

  it('returns unknown for non-image files such as PDF', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]); // '%PDF-1.5'
    expect(detectImageFormat(bytes)).toBe('unknown');
  });

  it('returns unknown for short byte sequences under 4 bytes', () => {
    const bytes = new Uint8Array([0xff, 0xd8]);
    expect(detectImageFormat(bytes)).toBe('unknown');
  });
});

describe('createImageUploader (native)', () => {
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

  it('fails, and returns no key, when storage refuses the upload with 403', async () => {
    const { client } = supabase({ uploadError: { statusCode: 403, message: 'new row violates row-level security policy' } });
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('file:///a.jpg')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('reports 413 payload too large as validation error', async () => {
    const { client } = supabase({ uploadError: { statusCode: 413, message: 'Payload too large' } });
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('file:///a.jpg')).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('5 MB'),
    });
  });

  it('reports server errors when status >= 500', async () => {
    const { client } = supabase({ uploadError: { statusCode: 500, message: 'Internal server error' } });
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('file:///a.jpg')).rejects.toMatchObject({
      code: 'server',
      message: expect.stringContaining('Storage server error'),
    });
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

describe('profile photos (native)', () => {
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

describe('processCanvas (HTML5 canvas processing)', () => {
  it('crops non-square image to square and scales to maxEdge', async () => {
    const drawImageMock = jest.fn();
    const mockBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    const toBlobMock = jest.fn((callback: (b: Blob) => void) => callback(mockBlob));

    const origDocument = globalThis.document;
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ({
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        drawImage: drawImageMock,
      })),
      toBlob: toBlobMock,
    };

    Object.defineProperty(globalThis, 'document', {
      value: { createElement: jest.fn(() => mockCanvas) },
      configurable: true,
      writable: true,
    });

    const mockImg = {
      naturalWidth: 1600,
      naturalHeight: 900,
      width: 1600,
      height: 900,
    } as unknown as HTMLImageElement;

    const result = await processCanvas(mockImg, AVATAR_LIMITS);
    expect(mockCanvas.width).toBe(512);
    expect(mockCanvas.height).toBe(512);
    // Source crop: center 900x900 square: originX = (1600-900)/2 = 350, originY = 0
    expect(drawImageMock).toHaveBeenCalledWith(mockImg, 350, 0, 900, 900, 0, 0, 512, 512);
    expect(toBlobMock).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);

    Object.defineProperty(globalThis, 'document', { value: origDocument, configurable: true, writable: true });
  });
});

describe('web image uploads', () => {
  const originalPlatform = Platform.OS;
  const originalFetch = globalThis.fetch;
  const revokeObjectURLMock = jest.fn();

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    Object.defineProperty(globalThis, 'URL', {
      value: { ...globalThis.URL, revokeObjectURL: revokeObjectURLMock },
      configurable: true,
      writable: true,
    });
    revokeObjectURLMock.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
    globalThis.fetch = originalFetch;
  });

  it('reads bytes using browser fetch for JPEG blob URIs and uploads to Supabase', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(996).fill(0)]);
    const mockBlob = new Blob([jpegBytes], { type: 'image/jpeg' });
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => mockBlob,
      arrayBuffer: async () => mockBlob.arrayBuffer(),
    })) as never;

    const { client, upload } = supabase();
    const result = await createImageUploader(client, POST_MEDIA_BUCKET)('blob:http://localhost:8081/abc-123');

    expect(globalThis.fetch).toHaveBeenCalledWith('blob:http://localhost:8081/abc-123');
    expect(upload).toHaveBeenCalledWith('user-1/random-name.jpg', expect.any(ArrayBuffer), { contentType: 'image/jpeg', upsert: false });
    expect(result.key).toBe('user-1/random-name.jpg');
  });

  it('reads PNG blob URIs and uploads to Supabase', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(996).fill(0)]);
    const mockBlob = new Blob([pngBytes], { type: 'image/png' });
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => mockBlob,
      arrayBuffer: async () => mockBlob.arrayBuffer(),
    })) as never;

    const { client, upload } = supabase();
    const result = await createImageUploader(client, AVATAR_BUCKET, AVATAR_LIMITS)('blob:http://localhost:8081/avatar.png');

    expect(upload).toHaveBeenCalledWith('user-1/random-name.jpg', expect.any(ArrayBuffer), { contentType: 'image/jpeg', upsert: false });
    expect(result.key).toBe('user-1/random-name.jpg');
  });

  it('handles HEIC blob URIs and converts before upload', async () => {
    const heicBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, ...new Array(988).fill(0)]);
    const mockBlob = new Blob([heicBytes], { type: 'image/heic' });
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => mockBlob,
      arrayBuffer: async () => mockBlob.arrayBuffer(),
    })) as never;

    const { client, upload } = supabase();
    const result = await createImageUploader(client, AVATAR_BUCKET, AVATAR_LIMITS)('blob:http://localhost:8081/photo.heic');

    expect(upload).toHaveBeenCalledWith('user-1/random-name.jpg', expect.any(ArrayBuffer), { contentType: 'image/jpeg', upsert: false });
    expect(result.key).toBe('user-1/random-name.jpg');
  });

  it('rejects unsupported image formats such as PDF with validation error', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
    const mockBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => mockBlob,
      arrayBuffer: async () => mockBlob.arrayBuffer(),
    })) as never;

    const { client } = supabase();
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('blob:http://localhost:8081/doc.pdf')).rejects.toMatchObject({
      code: 'validation',
      message: 'Unsupported image format. Please choose a JPEG, PNG, or HEIC image.',
    });
  });

  it('reports network error when image cannot be fetched on web', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
    })) as never;

    const { client } = supabase();
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('blob:http://localhost:8081/corrupt')).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('reports validation error when image file is empty (0 bytes)', async () => {
    const mockBlob = new Blob([]);
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => mockBlob,
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as never;

    const { client } = supabase();
    await expect(createImageUploader(client, POST_MEDIA_BUCKET)('blob:http://localhost:8081/empty')).rejects.toMatchObject({
      code: 'validation',
      message: 'The image file is corrupted or could not be decoded.',
    });
  });
});
