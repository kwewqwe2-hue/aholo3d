import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const project = fileURLToPath(new URL('../', import.meta.url));
export const releaseEvidence = process.env.RIDER_QA_EVIDENCE
  ? path.resolve(project, process.env.RIDER_QA_EVIDENCE)
  : path.join(project, 'artifacts', '第二版实机', '常驻手机版');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function sourceVersions() {
  const src = (await readdir(path.join(project, 'src'), { recursive: true, withFileTypes: true }))
    .filter(f => f.isFile()).map(f => path.relative(project, path.join(f.parentPath, f.name)).replaceAll('\\', '/'));
  const trial = (await readdir(path.join(project, 'trial'))).filter(f => /\.(js|css|html)$/.test(f)).map(f => 'trial/' + f);
  const files = ['index.html', 'vite.config.js', 'package-lock.json', ...src, ...trial].sort();
  const hash = createHash('sha256');
  for (const file of files) { hash.update(file + '\0'); hash.update(await readFile(path.join(project, file))); }
  return hash.digest('hex');
}
