/** Uploads one file to /api/upload and returns its public URL. */
export async function uploadFile(file: File, folder: string): Promise<{ url: string; name: string; mime: string; bytes: number }> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message ?? 'Upload failed.');
  return { url: body.url, name: body.originalFilename, mime: body.mime, bytes: body.bytes };
}
