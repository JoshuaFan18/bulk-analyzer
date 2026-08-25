import fs from 'fs/promises';
import { EOL } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// `DATA_DIR` moves the JSON files out of the repo, for example to a USB drive that
// two PCs share. Without it the files stay in `data/`, as before. Only the path
// changes: all access still goes through the four functions below.
export const DATA_DIR_IS_EXTERNAL = Boolean(process.env.DATA_DIR);
export const DATA_DIR = DATA_DIR_IS_EXTERNAL
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');

// The server calls this one time before it listens. An external folder that is not
// there is a disconnected drive, and not an empty collection. Thus the server stops
// with a message. Without this test the app opens with no cards and no decks, which
// looks like data loss, and the first save then makes a second set of files on the
// local disk.
export async function assertDataDir() {
  if (!DATA_DIR_IS_EXTERNAL) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    return;
  }
  let stat;
  try {
    stat = await fs.stat(DATA_DIR);
  } catch {
    throw new Error(
      [
        'The data folder is not there:',
        `  ${DATA_DIR}`,
        'DATA_DIR points to it. If this is a USB drive, connect it, then start again.',
        'To use the folder in the repo, remove DATA_DIR.',
      ].join(EOL)
    );
  }
  if (!stat.isDirectory()) throw new Error(`DATA_DIR is not a folder: ${DATA_DIR}`);
  try {
    await fs.access(DATA_DIR, fs.constants.W_OK);
  } catch {
    throw new Error(`The data folder is read-only: ${DATA_DIR}`);
  }
}

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
