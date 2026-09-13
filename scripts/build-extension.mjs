import { cp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'extension');
const distDir = path.join(root, 'dist');

async function buildBrowser(name, manifestFile) {
  const outputDir = path.join(distDir, name);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(sourceDir, outputDir, { recursive: true });

  const manifest = await readFile(path.join(sourceDir, manifestFile), 'utf8');
  await writeFile(path.join(outputDir, 'manifest.json'), manifest, 'utf8');
  await unlink(path.join(outputDir, 'manifest.firefox.json')).catch(() => {});
  return outputDir;
}

await rm(distDir, { recursive: true, force: true });
await buildBrowser('chromium', 'manifest.json');
await buildBrowser('firefox', 'manifest.firefox.json');

console.log('Built dist/chromium and dist/firefox');
