import { route, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';

/**
 * File upload to Cloudinary.
 *
 * Everything below is enforced server-side. The client picker restricts what a
 * user can conveniently choose; it does not restrict what can be posted to this
 * endpoint, and this is the only place the distinction matters.
 */

/**
 * Destinations, chosen by key rather than by path.
 *
 * The folder was previously taken straight from the form body, which let a
 * caller write anywhere in the account's namespace — including over another
 * feature's assets.
 */
const FOLDERS = {
  resources: 'mba_antisocial/resources',
  avatars: 'mba_antisocial/avatars',
  resumes: 'mba_antisocial/resumes',
} as const;

type FolderKey = keyof typeof FOLDERS;

/** MIME types accepted, matched against the document and image types in use. */
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/** Avatars are images only; a PDF profile picture is a sign of confusion or abuse. */
const IMAGE_ONLY: FolderKey[] = ['avatars'];

export const POST = route({ rateLimit: 'upload' }, async ({ request, actor }) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw ApiError.badRequest('Could not read that upload.');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw ApiError.badRequest('No file provided.');
  }

  const folderKey = String(formData.get('folder') ?? 'resources') as FolderKey;
  if (!(folderKey in FOLDERS)) {
    throw ApiError.badRequest('Unknown upload destination.');
  }

  /*
   * Size is checked before the body is read into memory. The upload is
   * base64-encoded for Cloudinary, which costs roughly a third again on top of
   * the raw bytes, so an unbounded file here is an out-of-memory vector rather
   * than merely a large upload.
   */
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw ApiError.unprocessable(
      `Keep files under ${Math.round(MAX_FILE_SIZE_BYTES / 1_048_576)} MB.`
    );
  }
  if (file.size === 0) {
    throw ApiError.badRequest('That file is empty.');
  }

  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mime)) {
    throw ApiError.unprocessable('That file type is not supported.');
  }
  if (IMAGE_ONLY.includes(folderKey) && !mime.startsWith('image/')) {
    throw ApiError.unprocessable('Profile pictures must be an image.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64Str = `data:${mime};base64,${Buffer.from(arrayBuffer).toString('base64')}`;

  const result = await uploadToCloudinary(base64Str, FOLDERS[folderKey]);

  // Logged with the uploader so an abusive asset can be traced back. The
  // uploader is not in the public response, only the server's own record.
  console.info(`[upload] ${actor.id} -> ${result.public_id} (${result.bytes} bytes, ${mime})`);

  return created({
    url: result.url,
    publicId: result.public_id,
    format: result.format,
    bytes: result.bytes,
    originalFilename: file.name,
  });
});
