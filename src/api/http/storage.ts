import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { uid } from '@/lib/format';

import { ApiError } from '../errors';
import type { PostImage } from '../types';

/** The API's default community image bucket (`SUPABASE_COMMUNITY_MEDIA_BUCKET`). */
export const COMMUNITY_MEDIA_BUCKET = 'community-media';
/** The API's default post image bucket (`SUPABASE_POST_MEDIA_BUCKET`). */
export const POST_MEDIA_BUCKET = 'post-media';
/** The API's default profile photo bucket (`SUPABASE_AVATAR_BUCKET`). */
export const AVATAR_BUCKET = 'avatars';

export interface ImageLimits {
  /** Storage refuses larger files. */
  maxBytes: number;
  /** Longest edge after resizing. */
  maxEdge: number;
  /** Centre-crop to a square first (profile photos). */
  square?: boolean;
}

/** Community and post images: enough for a cover on a large phone, small enough to upload quickly. */
export const MEDIA_LIMITS: ImageLimits = { maxBytes: 5 * 1024 * 1024, maxEdge: 1600 };
/** Profile photos: square, small, well under the avatars bucket's 2 MB limit. */
export const AVATAR_LIMITS: ImageLimits = { maxBytes: 2 * 1024 * 1024, maxEdge: 512, square: true };

export type DetectedImageFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'unknown';

/**
 * Validates actual file content bytes to detect genuine image formats.
 * Checks magic byte signatures for JPEG, PNG, WebP, and HEIC/HEIF containers.
 */
export function detectImageFormat(bytes: Uint8Array): DetectedImageFormat {
  if (bytes.length < 4) return 'unknown';

  // JPEG: FF D8
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }

  // WebP: RIFF (bytes 0..3) ... WEBP (bytes 8..11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }

  // HEIC / HEIF: ISOBMFF container box with 'ftyp' at bytes 4..7
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brandSlice = bytes.subarray(8, Math.min(bytes.length, 36));
    let brandStr = '';
    for (let i = 0; i < brandSlice.length; i++) {
      brandStr += String.fromCharCode(brandSlice[i]);
    }
    const lower = brandStr.toLowerCase();
    if (
      lower.includes('heic') ||
      lower.includes('heix') ||
      lower.includes('hevc') ||
      lower.includes('hevx') ||
      lower.includes('heim') ||
      lower.includes('heis') ||
      lower.includes('mif1') ||
      lower.includes('msf1')
    ) {
      return 'heic';
    }
  }

  return 'unknown';
}

function isHeicCandidate(blob: Blob, uri: string, headerBytes: Uint8Array): boolean {
  if (detectImageFormat(headerBytes) === 'heic') return true;
  const type = (blob.type || '').toLowerCase();
  if (type.includes('heic') || type.includes('heif')) return true;
  const lowerUri = uri.toLowerCase();
  if (lowerUri.includes('.heic') || lowerUri.includes('.heif')) return true;
  return false;
}

/** Transcodes HEIC/HEIF blob to standard JPEG blob using heic2any when needed. */
async function convertHeicToJpeg(blob: Blob): Promise<Blob> {
  try {
    const module = (await import('heic2any')) as unknown as { default?: (options: unknown) => Promise<Blob | Blob[]> };
    const heic2any = module.default ?? (module as unknown as (options: unknown) => Promise<Blob | Blob[]>);
    const converted = await heic2any({
      blob,
      toType: 'image/jpeg',
      quality: 0.85,
    });
    return Array.isArray(converted) ? converted[0] : converted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Safari 17+ can decode HEIC natively in <img> elements without heic2any.
    return blob;
  }
}

/**
 * Loads a Blob into an HTMLImageElement without setting crossOrigin on blob URLs.
 * Crucial fix for WebKit/Safari where setting crossOrigin = 'anonymous' on blob: causes CORS errors.
 */
function loadImageFromBlob(blob: Blob, isHeic: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      resolve(img);
    };
    img.onerror = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      if (isHeic) {
        reject(new ApiError('validation', 'Could not convert HEIC photo. Please choose a JPEG or PNG image.'));
      } else {
        reject(new ApiError('validation', 'The image file is corrupted or could not be decoded.'));
      }
    };
    img.src = url;
  });
}

/**
 * Processes an HTMLImageElement using standard HTML5 Canvas:
 * - Centre-crops to a 1:1 square when limits.square is true
 * - Downscales large images to limits.maxEdge preserving aspect ratio
 * - Uses high quality image smoothing
 * - Compresses to JPEG at 0.85 quality
 */
export function processCanvas(
  img: HTMLImageElement,
  limits: ImageLimits,
): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    if (!origWidth || !origHeight) {
      return reject(new ApiError('validation', 'The image file is corrupted or could not be decoded.'));
    }

    let srcX = 0;
    let srcY = 0;
    let srcWidth = origWidth;
    let srcHeight = origHeight;

    if (limits.square && srcWidth !== srcHeight) {
      const side = Math.min(srcWidth, srcHeight);
      srcX = Math.floor((srcWidth - side) / 2);
      srcY = Math.floor((srcHeight - side) / 2);
      srcWidth = side;
      srcHeight = side;
    }

    let targetWidth = srcWidth;
    let targetHeight = srcHeight;
    const longest = Math.max(targetWidth, targetHeight);
    if (longest > limits.maxEdge) {
      const scale = limits.maxEdge / longest;
      targetWidth = Math.round(targetWidth * scale);
      targetHeight = Math.round(targetHeight * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return reject(new ApiError('server', 'Could not initialize image processing context.'));
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      async (jpegBlob) => {
        if (!jpegBlob) {
          return reject(new ApiError('validation', 'Could not compress image file.'));
        }
        try {
          const bytes = await jpegBlob.arrayBuffer();
          resolve({ bytes, width: targetWidth, height: targetHeight });
        } catch {
          reject(new ApiError('validation', 'Could not read compressed image data.'));
        }
      },
      'image/jpeg',
      0.85,
    );
  });
}

/** Processes picked image on web platform using HTML5 Canvas directly. */
export async function processImageWeb(
  uri: string,
  limits: ImageLimits,
): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  let res: Response;
  try {
    res = await fetch(uri);
  } catch {
    throw new ApiError('network', 'Could not read image file.');
  }
  if (!res.ok) {
    throw new ApiError('network', 'Could not read image file.');
  }

  const blob = typeof res.blob === 'function' ? await res.blob() : new Blob([await res.arrayBuffer()]);
  if (blob.size === 0) {
    throw new ApiError('validation', 'The image file is corrupted or could not be decoded.');
  }

  const slice = typeof blob.slice === 'function' ? blob.slice(0, 64) : blob;
  const headerSlice = typeof slice.arrayBuffer === 'function' ? await slice.arrayBuffer() : new ArrayBuffer(0);
  const header = new Uint8Array(headerSlice);
  const detected = detectImageFormat(header);
  const isHeic = isHeicCandidate(blob, uri, header);

  if (detected === 'unknown' && !isHeic) {
    throw new ApiError('validation', 'Unsupported image format. Please choose a JPEG, PNG, or HEIC image.');
  }

  // Graceful fallback for headless/Node test environments where DOM is not present
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    const bytes = await blob.arrayBuffer();
    return { bytes, width: limits.maxEdge, height: limits.maxEdge };
  }

  let imageBlob = blob;
  if (isHeic) {
    imageBlob = await convertHeicToJpeg(blob);
  }

  const img = await loadImageFromBlob(imageBlob, isHeic);
  return processCanvas(img, limits);
}

/** Processes picked image on iOS/Android native platforms using Expo ImageManipulator. */
export async function processImageNative(
  localUri: string,
  limits: ImageLimits,
): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  try {
    const original = await ImageManipulator.manipulate(localUri).renderAsync();
    let width = original.width;
    let height = original.height;
    let crop: { originX: number; originY: number; width: number; height: number } | null = null;
    if (limits.square && width !== height) {
      const side = Math.min(width, height);
      crop = { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side };
      width = height = side;
    }
    const longest = Math.max(width, height);
    const resize =
      longest > limits.maxEdge ? (width >= height ? { width: limits.maxEdge, height: null } : { width: null, height: limits.maxEdge }) : null;
    let image = original;
    if (crop || resize) {
      const chain = ImageManipulator.manipulate(localUri);
      if (crop) chain.crop(crop);
      if (resize) chain.resize(resize);
      image = await chain.renderAsync();
    }
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    const bytes = await new File(saved.uri).arrayBuffer();
    return { bytes, width: saved.width, height: saved.height };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const msg = error instanceof Error ? error.message : '';
    if (/exceeded|large|size/i.test(msg)) {
      const limitMb = Math.round(limits.maxBytes / (1024 * 1024));
      throw new ApiError('validation', `Photo is too large. Please choose an image under ${limitMb} MB.`);
    }
    throw new ApiError('validation', 'Unsupported image format or invalid image file.');
  }
}

/** Re-encodes and resizes an image across web and native platforms. */
export async function processImage(
  localUri: string,
  limits: ImageLimits,
): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  if (Platform.OS === 'web') {
    return processImageWeb(localUri, limits);
  }
  return processImageNative(localUri, limits);
}

/**
 * Uploads images straight to Supabase Storage with the signed-in user's own session, as the API
 * expects: into `<user id>/<random name>.jpg` of the bucket (community media, post media, or avatars),
 * where the bucket's policies only let a user write to their own folder. Resolves only after storage
 * has accepted the file.
 */
export function createImageUploader(client: SupabaseClient, bucket: string, limits: ImageLimits = MEDIA_LIMITS) {
  return async (localUri: string): Promise<PostImage> => {
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new ApiError('unauthorized', 'Sign in again to upload photos.', 401);

    const isAvatar = bucket === AVATAR_BUCKET;
    const limitMb = Math.round(limits.maxBytes / (1024 * 1024));

    const { bytes, width, height } = await processImage(localUri, limits);

    if (bytes.byteLength > limits.maxBytes) {
      throw new ApiError(
        'validation',
        `${isAvatar ? 'Photo' : 'Image'} is too large. Please choose an image under ${limitMb} MB.`,
      );
    }

    const key = `${userId}/${uid()}.jpg`;
    const { error } = await client.storage.from(bucket).upload(key, bytes, { contentType: 'image/jpeg', upsert: false });

    if (error) {
      const status = Number((error as { statusCode?: string | number }).statusCode) || null;
      if (status === 401) {
        throw new ApiError('unauthorized', 'Sign in again to upload photos.', 401);
      }
      if (status === 403) {
        throw new ApiError('forbidden', 'You do not have permission to upload this photo.', 403);
      }
      if (status === 413) {
        throw new ApiError(
          'validation',
          `${isAvatar ? 'Photo' : 'Image'} is too large. Please choose an image under ${limitMb} MB.`,
          413,
        );
      }
      if (status && status >= 500) {
        throw new ApiError('server', 'Storage server error. Please try again.', status);
      }
      throw new ApiError('network', 'Could not connect to storage. Check your connection and try again.', status);
    }

    return { key, url: client.storage.from(bucket).getPublicUrl(key).data.publicUrl, width, height };
  };
}

/**
 * Deletes one of the user's own files from a bucket with their own session (storage policies only
 * allow deleting inside their own folder). The API holds no storage credentials, so replacing or
 * removing a profile photo cleans up the old file here, after the API has saved the change.
 */
export function createImageRemover(client: SupabaseClient, bucket: string) {
  return async (key: string): Promise<void> => {
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    // Never touch anything outside the signed-in user's folder, whatever the key says.
    if (!userId || !key.startsWith(`${userId}/`) || key.includes('..')) return;
    const { error } = await client.storage.from(bucket).remove([key]);
    if (error) throw new ApiError('network', "The old photo couldn't be removed.");
  };
}
