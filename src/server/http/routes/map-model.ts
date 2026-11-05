import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Route } from '../router.js';
import { send } from '../util.js';

export async function readMapModel(folder: string, name: string): Promise<Buffer> {
  if (!/^[a-z0-9][a-z0-9-]{0,79}\.glb$/.test(name)) throw new Error('Invalid model filename');
  const root = await realpath(path.join(folder, 'assets'));
  const file = await realpath(path.join(root, name));
  if (path.dirname(file).toLowerCase() !== root.toLowerCase()) throw new Error('Model must stay in maps/assets');
  const info = await stat(file);
  if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error('Model must be a GLB of at most 100 MB');
  const bytes = await readFile(file);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB');
  const jsonLength=bytes.readUInt32LE(12);
  if(bytes.readUInt32LE(16)!==0x4e4f534a || jsonLength%4 || jsonLength+20>bytes.length)throw new Error('Invalid GLB JSON chunk');
  const json=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  if(json.asset?.version!=='2.0')throw new Error('Invalid GLB version');
  for(const resource of [...(json.buffers??[]),...(json.images??[])]){
    if(resource.uri!==undefined)throw new Error('GLB must embed all buffers and textures');
  }
  return bytes;
}

export const mapModelRoute: Route = {
  method: 'GET', prefix: '/api/map-model/', auth: 'session',
  async handle(ctx, { res, path: url }) {
    try {
      const body = await readMapModel(ctx.maps.folder, url.slice('/api/map-model/'.length));
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': body.length, 'cache-control': 'private, no-cache', 'x-content-type-options': 'nosniff' });
      res.end(body);
    } catch { send(res, 404, { error: 'Local model unavailable: use a self-contained GLB in maps/assets' }); }
  },
};
