import { v2 as cloudinary } from 'cloudinary';
import type { FileStorage, PutFileInput, StoredFile } from '../../ports/storage';

export class CloudinaryStorage implements FileStorage {
  readonly id = 'cloudinary';

  constructor(
    private readonly cloudName: string,
    apiKey: string,
    apiSecret: string
  ) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  }

  async put(input: PutFileInput): Promise<StoredFile> {
    const dataUri = `data:${input.mime};base64,${input.data.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `mba_antisocial/${input.folder}`,
      resource_type: 'auto',
    });
    return {
      url: result.secure_url,
      key: result.public_id,
      bytes: result.bytes,
      mime: input.mime,
      originalFilename: input.filename,
    };
  }

  async delete(key: string) {
    await cloudinary.uploader.destroy(key);
  }

  /**
   * Pinned to the delivery host *and* our cloud name, so another tenant's
   * assets on the same host cannot be used to make the server fetch for them.
   */
  isOwnUrl(candidate: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return false;
    const [, first] = parsed.pathname.split('/');
    return first === this.cloudName;
  }

  async read(url: string, maxBytes: number): Promise<Buffer> {
    if (!this.isOwnUrl(url)) throw new Error('Refusing to fetch a URL this storage did not produce.');
    const res = await fetch(url, { redirect: 'error' });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new Error('File too large');
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error('File too large');
    return buffer;
  }
}
