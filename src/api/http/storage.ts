import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { uid } from '@/lib/format';

import { ApiError } from '../errors';
import type { UploadedImage } from '../types';

/** The API's default community image bucket (`SUPABASE_COMMUNITY_MEDIA_BUCKET`). */
export const COMMUNITY_MEDIA_BUCKET = 'community-media';
/** Storage refuses larger files. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Longest edge after resizing: enough for a cover on a large phone, small enough to upload quickly. */
const MAX_EDGE = 1600;

/** Re-encodes any picked image (HEIC, PNG…) as a JPEG no larger than MAX_EDGE. */
async function toJpeg(localUri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(localUri).renderAsync();
  const longest = Math.max(original.width, original.height);
  const image =
    longest > MAX_EDGE
      ? await ImageManipulator.manipulate(localUri)
          .resize(original.width >= original.height ? { width: MAX_EDGE, height: null } : { width: null, height: MAX_EDGE })
          .renderAsync()
      : original;
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return saved.uri;
}

/**
 * Uploads community images straight to Supabase Storage with the signed-in user's own session,
 * as the API expects: into `<user id>/<random name>` of the community media bucket, where the
 * bucket's policies only let a user write to their own folder. The API then receives the key.
 * No service key is involved; the anon key and the user's token are all the app holds.
 */
export function createCommunityImageUploader(client: SupabaseClient, bucket = COMMUNITY_MEDIA_BUCKET) {
  return async (localUri: string): Promise<UploadedImage> => {
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new ApiError('unauthorized', 'Sign in again to upload images.', 401);

    const jpeg = await toJpeg(localUri);
    const bytes = await new File(jpeg).arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) throw new ApiError('validation', 'That image is too large. Choose one under 5 MB.');

    // Random names keep public URLs unguessable.
    const key = `${userId}/${uid()}.jpg`;
    const { error } = await client.storage.from(bucket).upload(key, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) {
      const status = Number((error as { statusCode?: string | number }).statusCode) || null;
      throw new ApiError(status ? (status >= 500 ? 'server' : 'forbidden') : 'network', "That image couldn't be uploaded. Try again.", status);
    }
    return { key, url: client.storage.from(bucket).getPublicUrl(key).data.publicUrl };
  };
}
