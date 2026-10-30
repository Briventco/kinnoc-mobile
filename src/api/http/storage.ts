import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

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

/** Re-encodes any picked image (HEIC, PNG…) as a JPEG within the limits. */
async function toJpeg(localUri: string, limits: ImageLimits): Promise<{ uri: string; width: number; height: number }> {
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
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Uploads images straight to Supabase Storage with the signed-in user's own session, as the API
 * expects: into `<user id>/<random name>` of the bucket (community or post media), where the
 * bucket's policies only let a user write to their own folder. The API then receives the key and
 * checks the stored object itself. No service key is involved; the anon key and the user's token
 * are all the app holds. Resolves only after storage has accepted the file.
 */
export function createImageUploader(client: SupabaseClient, bucket: string, limits: ImageLimits = MEDIA_LIMITS) {
  return async (localUri: string): Promise<PostImage> => {
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new ApiError('unauthorized', 'Sign in again to upload images.', 401);

    const jpeg = await toJpeg(localUri, limits);
    const bytes = await new File(jpeg.uri).arrayBuffer();
    if (bytes.byteLength > limits.maxBytes) {
      throw new ApiError('validation', `That image is too large. Choose one under ${Math.round(limits.maxBytes / (1024 * 1024))} MB.`);
    }

    // Random names keep public URLs unguessable.
    const key = `${userId}/${uid()}.jpg`;
    const { error } = await client.storage.from(bucket).upload(key, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) {
      const status = Number((error as { statusCode?: string | number }).statusCode) || null;
      throw new ApiError(status ? (status >= 500 ? 'server' : 'forbidden') : 'network', "That image couldn't be uploaded. Try again.", status);
    }
    return { key, url: client.storage.from(bucket).getPublicUrl(key).data.publicUrl, width: jpeg.width, height: jpeg.height };
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
