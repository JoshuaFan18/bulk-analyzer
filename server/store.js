import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = path.join(ROOT, 'data');

export async function readJson(relPath, fallback = null) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, relPath), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeJson(relPath, obj) {
  const full = path.join(DATA_DIR, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const tmp = full + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fs.rename(tmp, full).catch(async () => {
    await fs.copyFile(tmp, full);
    await fs.unlink(tmp).catch(() => {});
  });
}

export async function listJson(relDir) {
  try {
    const dir = path.join(DATA_DIR, relDir);
    const files = await fs.readdir(dir);
    const out = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')));
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function deleteJson(relPath) {
  await fs.unlink(path.join(DATA_DIR, relPath)).catch(() => {});
}
