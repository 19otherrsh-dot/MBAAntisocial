export interface StoredFile {
  url: string;
  /** Provider key, for deletion. */
  key: string;
  bytes: number;
  mime: string;
  originalFilename: string;
}

export interface PutFileInput {
  data: Buffer;
  mime: string;
  filename: string;
  folder: string;
}

export interface FileStorage {
  readonly id: string;
  put(input: PutFileInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  /**
   * Whether a URL was produced by this storage. Any server-side fetch of a
   * caller-supplied URL must pass this first, or it is an SSRF vector.
   */
  isOwnUrl(url: string): boolean;
  /** Reads back a file this storage produced. */
  read(url: string, maxBytes: number): Promise<Buffer>;
}
