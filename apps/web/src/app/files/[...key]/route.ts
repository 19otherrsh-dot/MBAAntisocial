import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@/server/container';
import { DiskStorage } from '@/server/adapters/storage/disk';

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Serves files written by the disk storage adapter. Keys are random, so URLs
 * are capabilities; types come from our own extension map, never the uploader,
 * and `nosniff` stops a browser second-guessing them into HTML.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const storage = container().storage;
  if (!(storage instanceof DiskStorage)) return new NextResponse('Not found', { status: 404 });

  const { key } = await params;
  const full = storage.resolveKey(key.join('/'));
  if (!full) return new NextResponse('Not found', { status: 404 });

  try {
    const data = await readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    const type = TYPES[ext] ?? 'application/octet-stream';
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': type,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        ...(type.startsWith('image/') || type === 'application/pdf' ? {} : { 'Content-Disposition': 'attachment' }),
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
