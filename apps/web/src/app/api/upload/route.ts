import { route, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import { container } from '@/server/container';

/**
 * File upload through the storage port (Cloudinary, or local disk).
 *
 * Everything below is enforced server-side. The client picker restricts what a
 * user can conveniently choose; it does not restrict what can be posted here.
 */

/** Destinations, chosen by key rather than by path, so a caller cannot write anywhere. */
const FOLDERS = ['resources', 'avatars', 'resumes', 'posts', 'hub', 'marketplace', 'events', 'clubs', 'teams'] as const;
type FolderKey = (typeof FOLDERS)[number];

const DOCUMENT_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
]);
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Which kinds of file each destination accepts. */
const ACCEPTS: Record<FolderKey, 'image' | 'document' | 'any'> = {
  resources: 'document',
  avatars: 'image',
  resumes: 'document',
  posts: 'image',
  hub: 'any',
  marketplace: 'image',
  events: 'image',
  clubs: 'any',
  teams: 'any',
};

/** Magic bytes for the types where a lying Content-Type is most dangerous. */
function sniff(data: Buffer): string | null {
  if (data.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (data[0] === 0x89 && data.subarray(1, 4).toString() === 'PNG') return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (data.subarray(0, 3).toString() === 'GIF') return 'image/gif';
  return null;
}

export const POST = route({ rateLimit: 'upload' }, async ({ request, actor }) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw ApiError.badRequest('Could not read that upload.');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) throw ApiError.badRequest('No file provided.');

  const folder = String(formData.get('folder') ?? 'resources') as FolderKey;
  if (!FOLDERS.includes(folder)) throw ApiError.badRequest('Unknown upload destination.');

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw ApiError.unprocessable(`Keep files under ${Math.round(MAX_FILE_SIZE_BYTES / 1_048_576)} MB.`);
  }
  if (file.size === 0) throw ApiError.badRequest('That file is empty.');

  const declared = file.type || 'application/octet-stream';
  const accepts = ACCEPTS[folder];
  const allowed =
    (accepts !== 'document' && IMAGE_MIME.has(declared)) || (accepts !== 'image' && DOCUMENT_MIME.has(declared));
  if (!allowed) throw ApiError.unprocessable('That file type is not supported here.');

  const data = Buffer.from(await file.arrayBuffer());
  // A file claiming to be a PDF or an image has to actually be one.
  const sniffed = sniff(data);
  if ((declared === 'application/pdf' || IMAGE_MIME.has(declared)) && sniffed !== declared) {
    throw ApiError.unprocessable('That file does not match its type.');
  }

  const stored = await container().storage.put({ data, mime: declared, filename: file.name, folder });
  console.info(`[upload] ${actor.id} -> ${stored.key} (${stored.bytes} bytes, ${declared})`);

  return created({
    url: stored.url,
    publicId: stored.key,
    format: file.name.split('.').pop() ?? '',
    bytes: stored.bytes,
    originalFilename: file.name,
    mime: declared,
  });
});
