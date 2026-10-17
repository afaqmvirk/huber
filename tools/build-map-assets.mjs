import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = join(root, 'public/vendor');
await mkdir(vendor, { recursive: true });
for (const name of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
  await copyFile(join(root, 'node_modules/maplibre-gl/dist', name), join(vendor, name));
}
await copyFile(join(root, 'node_modules/maplibre-gl/LICENSE.txt'), join(vendor, 'MAPLIBRE-LICENSE.txt'));
await copyFile(join(root, 'node_modules/three/LICENSE'), join(vendor, 'THREE-LICENSE.txt'));
await build({ entryPoints: [join(root, 'frontend/horse-layer.js')], outfile: join(vendor, 'horse-layer.js'), bundle: true, minify: true, format: 'esm', target: 'es2022', legalComments: 'eof' });
console.log('Prepared local MapLibre modules, workers and the 3D horse renderer.');
