import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Uploads a base64 string or local file path to Cloudinary
 */
export async function uploadToCloudinary(
  fileStr: string,
  folder: string = 'mba_antisocial'
): Promise<{ url: string; public_id: string; format: string; bytes: number }> {
  try {
    const result = await cloudinary.uploader.upload(fileStr, {
      folder: folder,
      resource_type: 'auto', // Auto-detects image, raw, video, etc.
    });

    return {
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload file to Cloudinary');
  }
}

/**
 * Deletes a file from Cloudinary by its public ID
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete file from Cloudinary');
  }
}

/**
 * Whether a URL is one this application uploaded.
 *
 * Any endpoint that fetches a caller-supplied URL server-side is a
 * server-side request forgery vector: an attacker points it at a cloud
 * metadata endpoint or an internal service and uses the server as a proxy into
 * a network it cannot otherwise reach. Pinning to the delivery host for our own
 * cloud account means only assets this app produced can be fetched.
 */
export function isOwnCloudinaryUrl(candidate: string): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  if (parsed.hostname !== 'res.cloudinary.com') return false;

  // Path is /<cloud_name>/... — reject another tenant's assets on the same host.
  const [, first] = parsed.pathname.split('/');
  return first === cloudName;
}

export default cloudinary;
