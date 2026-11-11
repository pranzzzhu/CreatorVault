import fs from 'node:fs';
import path from 'node:path';

// Set of in-flight active paths to avoid TOCTOU collision races across parallel tasks
const activeReservedPaths = new Set<string>();

const DOS_DEVICE_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/**
 * Sanitizes base filename for Windows and POSIX filesystems.
 * Strips illegal characters, removes trailing dots/spaces, and shields DOS reserved device names.
 */
export function sanitizeBaseName(rawName: string, maxLen = 56): string {
  let clean = (rawName || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/, '')
    .slice(0, maxLen);

  if (!clean || DOS_DEVICE_NAMES.test(clean)) {
    clean = clean ? `_${clean}_` : 'Vortex_Asset';
  }
  return clean;
}

/**
 * Explicitly releases a reserved in-flight file path when a job finishes or cancels.
 */
export function releaseFilePath(filePath?: string): void {
  if (filePath) {
    activeReservedPaths.delete(path.resolve(filePath));
  }
}

/**
 * Resolves a non-colliding target file path in destDir.
 * If destDir/baseName.ext exists or is reserved by an active job, appends " (1)", " (2)", etc.
 * Avoids suffix stacking if baseName already ends with " (N)".
 * Atomically reserves the chosen path in memory.
 */
export function getNonCollidingFilePath(destDir: string, baseName: string, ext: string): string {
  const safeDestDir = destDir && destDir.trim() ? path.resolve(destDir) : process.cwd();
  if (!fs.existsSync(safeDestDir)) {
    fs.mkdirSync(safeDestDir, { recursive: true });
  }

  const cleanBase = sanitizeBaseName(baseName);
  const cleanExt = ext ? (ext.startsWith('.') ? ext : `.${ext}`) : '';

  // Extract existing counter if baseName ends with " (N)" or "_(N)" to prevent "name (1) (1).mp4"
  const counterMatch = cleanBase.match(/^(.*?)[_ ]\((\d+)\)$/);
  const rootName = counterMatch ? counterMatch[1] : cleanBase;
  const initialCounter = counterMatch ? parseInt(counterMatch[2], 10) : 0;

  // If input had a counter like (1), start candidate checking from that counter to preserve progression
  let counter = initialCounter > 0 ? initialCounter : 0;
  let candidate = counter > 0
    ? path.join(safeDestDir, `${rootName} (${counter})${cleanExt}`)
    : path.join(safeDestDir, `${cleanBase}${cleanExt}`);
  let resolvedCandidate = path.resolve(candidate);

  if (!fs.existsSync(resolvedCandidate) && !activeReservedPaths.has(resolvedCandidate)) {
    activeReservedPaths.add(resolvedCandidate);
    return candidate;
  }

  counter = initialCounter > 0 ? initialCounter + 1 : 1;
  while (true) {
    candidate = path.join(safeDestDir, `${rootName} (${counter})${cleanExt}`);
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved) && !activeReservedPaths.has(resolved)) {
      activeReservedPaths.add(resolved);
      return candidate;
    }
    counter++;
  }
}
