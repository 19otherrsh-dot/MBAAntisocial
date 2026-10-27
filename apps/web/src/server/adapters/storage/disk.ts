import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStorage, PutFileInput, StoredFile } from '../../ports/storage';

/** Path prefix the files route serves from. */
export const DISK_ROUTE_PREFIX = '/files/';

const SAFE_EXT = /^[a-z0-9]{1,8}$/;

/**
 * Local-disk storage for development and single-server Docker deployments.
 * Keys are random, so a URL is unguessable; the extension is kept only so the
 * files route can set a Content-Type without trusting the uploader.
 */
export class DiskStorage implements FileStorage {
  readonly id = 'disk';
  private readonly root: string;

  constructor(
    dir: string,
    private readonly appUrl: string
  ) {
    // The upload root is runtime data, not code: keep the tracer out of it.
    this.root = path.resolve(/* turbopackIgnore: true */ process.cwd(), dir);
  }

  async put(input: PutFileInput): Promise<StoredFile> {
    const ext = path.extname(input.filename).slice(1).toLowerCase();
    const folder = input.folder.replace(/[^a-z0-9_-]/gi, '');
    const name = `${randomBytes(16).toString('hex')}${SAFE_EXT.test(ext) ? `.${ext}` : ''}`;
    const key = `${folder}/${name}`;
    await mkdir(path.join(this.root, folder), { recursive: true });
    await writeFile(path.join(this.root, key), input.data);
    return {
      url: `${this.appUrl}${DISK_ROUTE_PREFIX}${key}`,
      key,
      bytes: input.data.byteLength,
      mime: input.mime,
      originalFilename: input.filename,
    };
  }

  /** Resolves a key to a path inside the root, or null for traversal attempts. */
  resolveKey(key: string): string | null {
    if (!/^[a-z0-9_-]+\/[a-f0-9]{32}(\.[a-z0-9]{1,8})?$/i.test(key)) return null;
    const full = path.resolve(this.root, key);
    return full.startsWith(this.root + path.sep) ? full : null;
  }

  async delete(key: string) {
    const full = this.resolveKey(key);
    if (full) await rm(full, { force: true });
  }

  isOwnUrl(url: string): boolean {
    return url.startsWith(`${this.appUrl}${DISK_ROUTE_PREFIX}`) && this.resolveKey(this.keyOf(url)) !== null;
  }

  keyOf(url: string): string {
    return url.slice(`${this.appUrl}${DISK_ROUTE_PREFIX}`.length);
  }

  async read(url: string, maxBytes: number): Promise<Buffer> {
    const full = this.isOwnUrl(url) ? this.resolveKey(this.keyOf(url)) : null;
    if (!full) throw new Error('Refusing to read a URL this storage did not produce.');
    const info = await stat(full);
    if (info.size > maxBytes) throw new Error('File too large');
    return readFile(full);
  }
}
