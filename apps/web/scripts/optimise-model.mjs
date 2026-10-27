/**
 * Prepares a glTF/GLB for the web the way the bundled showpieces were made:
 *
 *   node scripts/optimise-model.mjs <input.gltf|glb> <output.glb> [ratio=0.1] [error=0.001] [textureSize=1024]
 *
 * - drops stored tangents (three.js derives them for normal maps)
 * - dedups and welds, then simplifies with meshoptimizer
 * - converts textures to WebP at `textureSize`
 * - quantises vertex attributes (KHR_mesh_quantization)
 *
 * No Draco or meshopt compression on purpose: both need a decoder that
 * <model-viewer> fetches from a third-party CDN at runtime. Quantised GLBs are
 * served entirely from this origin. Only use models whose licence permits it,
 * and credit them where shown (see components/motion/showpieces.ts).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output, ratio = '0.1', error = '0.001', size = '1024'] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/optimise-model.mjs <input> <output.glb> [ratio] [error] [textureSize]');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) if (prim.getAttribute('TANGENT')) prim.setAttribute('TANGENT', null);
}
await MeshoptSimplifier.ready;
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratio), error: Number(error) }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [Number(size), Number(size)], quality: 82 }),
  quantize()
);
await io.write(output, doc);
console.log(`Wrote ${output}`);
