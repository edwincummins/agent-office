import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Route } from '../router.js';
import { send } from '../util.js';

/** Validate only the bounded JSON chunk; stream binary data from this same open handle. */
export async function openMapModel(folder: string, name: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}\.glb$/.test(name)) throw new Error('Invalid model filename');
  const root = await realpath(path.join(folder, 'assets'));
  const file = await realpath(path.join(root, name));
  if (path.dirname(file).toLowerCase() !== root.toLowerCase()) throw new Error('Model must stay in maps/assets');
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error('Model must be a GLB of at most 100 MB');
    const header = Buffer.alloc(20);
    await handle.read(header, 0, 20, 0);
    if (info.size < 20 || header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== info.size) throw new Error('Invalid GLB');
    const length = header.readUInt32LE(12);
    if (header.readUInt32LE(16) !== 0x4e4f534a || length % 4 || length + 20 > info.size || length > 4 * 1024 * 1024) throw new Error('Invalid GLB JSON chunk');
    const bytes = Buffer.alloc(length);
    if ((await handle.read(bytes, 0, length, 20)).bytesRead !== length) throw new Error('Invalid GLB');
    const json = JSON.parse(bytes.toString('utf8'));
    if (json.asset?.version !== '2.0') throw new Error('Invalid GLB version');
    for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
      if (resource.uri !== undefined) throw new Error('GLB must embed all buffers and textures');
    }
    const etag = '"' + createHash('sha256').update(`${file}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`).digest('hex') + '"';
    return { handle, size: info.size, etag };
  } catch (error) { await handle.close(); throw error; }
}

export function modelRange(value: string, size: number): [number, number] | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < size ? [start, end] : null;
}
const active = new Map<string, number>();
export const mapModelRoute: Route = {
  method: 'GET', prefix: '/api/map-model/', auth: 'session',
  async handle(ctx, { req, res, path: url, session }) {
    // Account caps also prevent parallel browser sessions bypassing the limit. Shared sessions share a cap.
    const key = session.account?.id ?? 'shared';
    if ((active.get(key) ?? 0) >= 2) { res.setHeader('retry-after', '1'); send(res, 429, { error: 'Two model downloads already active; retry shortly' }); return; }
    active.set(key, (active.get(key) ?? 0) + 1);
    let model: Awaited<ReturnType<typeof openMapModel>> | undefined;
    try {
      model = await openMapModel(ctx.maps.folder, url.slice('/api/map-model/'.length));
      if (res.destroyed) return;
      res.setHeader('content-type', 'model/gltf-binary');
      res.setHeader('cache-control', 'private, no-cache');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('accept-ranges', 'bytes');
      res.setHeader('etag', model.etag);
      if (req.headers['if-none-match']?.split(',').some(tag => tag.trim().replace(/^W\//, '') === model!.etag || tag.trim() === '*')) { res.writeHead(304).end(); return; }
      const requested = req.headers.range && (!req.headers['if-range'] || req.headers['if-range'] === model.etag);
      const range = requested ? modelRange(req.headers.range!, model.size) : [0, model.size - 1];
      if (!range) { res.writeHead(416, { 'content-range': `bytes */${model.size}` }).end(); return; }
      const [start, end] = range;
      if (requested) res.setHeader('content-range', `bytes ${start}-${end}/${model.size}`);
      res.writeHead(requested ? 206 : 200, { 'content-length': end - start + 1 });
      await pipeline(model.handle.createReadStream({ start, end, highWaterMark: 64 * 1024, autoClose: false }), res);
    } catch {
      if (!res.headersSent && !res.destroyed) send(res, 404, { error: 'Local model unavailable: use a self-contained GLB in maps/assets' });
    } finally {
      await model?.handle.close();
      const count = (active.get(key) ?? 1) - 1;
      if (count) active.set(key, count); else active.delete(key);
    }
  },
};
