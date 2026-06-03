// Chunked upload utility — bypasses Vercel 4.5MB serverless body limit
// File is split into ~2 MB base64 chunks, uploaded sequentially, then reassembled server-side.

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB raw → ~2.7 MB base64 per request (safe under 4.5 MB)

export type UploadMeta = {
  name: string;
  fileName: string;
  fileType: string;
  totalSize: number;
  strategyId?: number | null;
  customerId?: number | null;
  quoteId?: number | null;
  invoiceId?: number | null;
  notes?: string | null;
};

export type ProgressCb = (pct: number, label: string) => void;

function readChunkAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture chunk échouée'));
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:...;base64,XXX" — keep only the base64 portion
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.substring(idx + 7) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function uploadFileChunked(file: File, extraMeta: Partial<UploadMeta>, onProgress?: ProgressCb): Promise<any> {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const meta: UploadMeta = {
    name: extraMeta.name || file.name,
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    totalSize: file.size,
    strategyId: extraMeta.strategyId ?? null,
    customerId: extraMeta.customerId ?? null,
    quoteId: extraMeta.quoteId ?? null,
    invoiceId: extraMeta.invoiceId ?? null,
    notes: extraMeta.notes ?? null,
  };

  // Step 1: init
  onProgress?.(0, 'Initialisation…');
  const initRes = await fetch('/api/documents/chunked/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...meta, totalChunks }),
  });
  if (!initRes.ok) {
    const e = await initRes.text();
    throw new Error(`Init upload échoué (${initRes.status}): ${e.substring(0, 200)}`);
  }
  const { uploadId } = await initRes.json();

  // Step 2: send all chunks
  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);
      const base64 = await readChunkAsBase64(blob);
      const r = await fetch(`/api/documents/chunked/${uploadId}/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunkIndex: i, chunkData: base64 }),
      });
      if (!r.ok) {
        const e = await r.text();
        throw new Error(`Chunk ${i + 1}/${totalChunks} échoué (${r.status}): ${e.substring(0, 200)}`);
      }
      const pct = Math.round(((i + 1) / totalChunks) * 90);
      onProgress?.(pct, `Envoi ${i + 1}/${totalChunks}`);
    }

    // Step 3: finalize
    onProgress?.(95, 'Assemblage…');
    const finRes = await fetch(`/api/documents/chunked/${uploadId}/finalize`, { method: 'POST' });
    if (!finRes.ok) {
      const e = await finRes.text();
      throw new Error(`Finalisation échouée (${finRes.status}): ${e.substring(0, 200)}`);
    }
    const doc = await finRes.json();
    onProgress?.(100, 'Terminé');
    return doc;
  } catch (err) {
    // Best effort cleanup on failure
    fetch(`/api/documents/chunked/${uploadId}`, { method: 'DELETE' }).catch(() => {});
    throw err;
  }
}
