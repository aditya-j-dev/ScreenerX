// Run after next build: node scripts/audit-bundle.mjs
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(`${directory}/${entry.name}`)
        : entry.name.endsWith('.js')
          ? [`${directory}/${entry.name}`]
          : [],
    ),
  );
  return nested.flat();
}
const assets = await Promise.all(
  (await files('.next/static/chunks')).map(async (path) => {
    const bytes = await readFile(path);
    return { path, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }),
);
assets.sort((a, b) => b.gzipBytes - a.gzipBytes);
const prerender = JSON.parse(await readFile('.next/prerender-manifest.json', 'utf8'));
const response = await fetch('http://localhost:3100/api/stocks');
const body = Buffer.from(await response.arrayBuffer());
const envelope = JSON.parse(body.toString());
const report = {
  recordedAt: new Date().toISOString(),
  note: 'File gzip estimates, not network transfer or route download totals. Includes lazy and other-route assets.',
  emittedJsFiles: assets.length,
  totalEmittedJsBytes: assets.reduce((sum, x) => sum + x.bytes, 0),
  totalEmittedGzipBytes: assets.reduce((sum, x) => sum + x.gzipBytes, 0),
  assets,
  stockApi: {
    status: response.status,
    records: envelope.data?.length,
    decodedBytes: body.length,
    gzipBytes: gzipSync(body).length,
    generatedAt: envelope.meta?.timestamp,
    prerenderRoute: prerender.routes['/api/stocks'] ?? null,
  },
};
await mkdir('audit', { recursive: true });
await writeFile('audit/bundle-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, assets: assets.slice(0, 8) }, null, 2));
