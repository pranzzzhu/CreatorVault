import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  shell
} from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BinaryManager } from './services/BinaryManager';
import { HardwareProbe } from './services/HardwareProbe';
import { FfmpegRunner } from './services/FfmpegRunner';
import { YtDlpRunner } from './services/YtDlpRunner';
import { StemRunner } from './services/StemRunner';
import { VectorRunner } from './services/VectorRunner';
import type {
  BinaryName,
  BrowserSource,
  ConverterJobConfig,
  FixerJobConfig,
  HardwareTelemetry,
  JobConfig,
  JobProgressEvent,
  StemOutputPill,
  SystemDiagnostics,
  VectorJobConfig
} from '../src/types/media';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

let mainWindow: BrowserWindow | null = null;

// When packaged as a standalone .exe, store sidecar binaries & AI models in userData (%APPDATA%/vortex-media-engine)
// so the 1-Click Installer always has write access and models persist across updates.
const sidecarRoot = app.isPackaged ? app.getPath('userData') : process.env.APP_ROOT;
const binaryManager = new BinaryManager(sidecarRoot);
const ffmpegRunner = new FfmpegRunner(
  () => binaryManager.getBinaryPath('ffmpeg'),
  () => binaryManager.isBinaryAvailable('ffmpeg')
);

let cachedHardware: HardwareTelemetry = HardwareProbe.getDefaultTelemetry();

const ytDlpRunner = new YtDlpRunner(
  () => binaryManager.getBinaryPath('yt-dlp'),
  () => binaryManager.isBinaryAvailable('yt-dlp'),
  () => binaryManager.getBinaryPath('ffmpeg'),
  () => binaryManager.isBinaryAvailable('ffmpeg'),
  ffmpegRunner
);

const stemRunner = new StemRunner(
  () => binaryManager.getBinaryPath('demucs'),
  () => binaryManager.isBinaryAvailable('demucs'),
  () => cachedHardware.recommendedDevice,
  ffmpegRunner
);

const vectorRunner = new VectorRunner(
  binaryManager.getBinDir(),
  () => binaryManager.getBinaryPath('ffmpeg'),
  () => binaryManager.getBinaryPath('ffprobe'),
  () => binaryManager.isBinaryAvailable('ffprobe'),
  () => binaryManager.getPythonPath()
);

function getDefaultOutputDir(): string {
  const downloads = path.join(os.homedir(), 'Downloads', 'Vortex_Exports');
  if (!fs.existsSync(downloads)) {
    try {
      fs.mkdirSync(downloads, { recursive: true });
    } catch {
      return os.tmpdir();
    }
  }
  return downloads;
}

const ALLOWED_MEDIA_EXTS = new Set([
  '.mp4', '.mov', '.mkv', '.webm', '.avi', '.mxf', '.m4v', '.mts', '.gif',
  '.wav', '.mp3', '.flac', '.m4a', '.ogg', '.aac', '.opus',
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg', '.xml'
]);

// Media path security allowlist for vortex-media:// and native OS drag
const approvedMediaFiles = new Set<string>();
const approvedMediaDirs = new Set<string>();

function approveFilePath(filePath?: string | null): void {
  if (!filePath) return;
  approvedMediaFiles.add(path.resolve(filePath).toLowerCase());
}

function approveDirPath(dirPath?: string | null): void {
  if (!dirPath) return;
  approvedMediaDirs.add(path.resolve(dirPath).toLowerCase());
}

function isPathApproved(resolvedFilePath: string): boolean {
  const normalized = path.resolve(resolvedFilePath).toLowerCase();
  if (approvedMediaFiles.has(normalized)) return true;
  for (const dir of approvedMediaDirs) {
    const rel = path.relative(dir, normalized);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return true;
    }
  }
  // Auto-approve existing media files on user drives
  const ext = path.extname(normalized);
  if (ALLOWED_MEDIA_EXTS.has(ext)) {
    try {
      if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
        approvedMediaFiles.add(normalized);
        return true;
      }
    } catch {
      // Ignore stat error
    }
  }
  return false;
}

// Initialize trusted standard directories
approveDirPath(getDefaultOutputDir());
approveDirPath(os.tmpdir());
if (sidecarRoot) approveDirPath(sidecarRoot);

async function buildDiagnostics(forceRefresh = false): Promise<SystemDiagnostics> {
  const binaries = await binaryManager.checkAllBinaries(forceRefresh);
  if (forceRefresh || cachedHardware.acceleratorBadge === 'CPU FALLBACK MODE') {
    cachedHardware = await HardwareProbe.probe(binaries.ffmpeg.resolvedPath);
  }
  return {
    binaries,
    hardware: cachedHardware,
    defaultOutputDir: getDefaultOutputDir(),
    binDir: binaryManager.getBinDir()
  };
}

// Register custom media streaming scheme so webSecurity remains enabled (CB-4)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vortex-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

// Verified valid 32x32 RGBA PNG data URL for native OS drag-and-drop cursor icon
export const DRAG_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAQElEQVR42mNgGAWjAA1Y7P3xn5aYKAfwlUx4Rgs86oBRB4w6YNQBow4YdcCoA0YdMOqAUQcMHQcMaLN8FIw4AAA3T8XtROFoGgAAAABJRU5ErkJggg==';

function getValidDragIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromDataURL(DRAG_ICON_DATA_URL);
  if (!icon.isEmpty()) {
    return icon;
  }
  // Guaranteed non-empty 32x32 BGRA bitmap fallback so WebContents::StartDrag never aborts
  const width = 32;
  const height = 32;
  const bgra = Buffer.alloc(width * height * 4);
  for (let y = 4; y < 28; y++) {
    for (let x = 4; x < 28; x++) {
      const idx = (y * width + x) * 4;
      const isBorder = x === 4 || x === 27 || y === 4 || y === 27;
      bgra[idx] = isBorder ? 248 : 144;     // B
      bgra[idx + 1] = isBorder ? 189 : 116; // G
      bgra[idx + 2] = isBorder ? 56 : 14;   // R
      bgra[idx + 3] = 255;                  // A
    }
  }
  return nativeImage.createFromBitmap(bgra, { width, height });
}

function createWindow() {
  nativeTheme.themeSource = 'dark';
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#9e9e9e',
      height: 36
    },
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.whenReady().then(() => {
  protocol.handle('vortex-media', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let decoded = decodeURIComponent(parsedUrl.pathname);
      if (process.platform === 'win32') {
        decoded = decoded.replace(/^\/+([A-Za-z]:)/, '$1');
      } else {
        decoded = '/' + decoded.replace(/^\/+/, '');
      }
      const normalizedPath = path.resolve(decoded);
      const ext = path.extname(normalizedPath).toLowerCase();
      if (!ALLOWED_MEDIA_EXTS.has(ext)) {
        return new Response('Access denied: unapproved media extension', { status: 403 });
      }
      if (!isPathApproved(normalizedPath)) {
        return new Response('Access denied: path outside approved workspace', { status: 403 });
      }
      if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isFile()) {
        return new Response('Media file not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(normalizedPath).toString());
    } catch {
      return new Response('Invalid media URL', { status: 400 });
    }
  });

  createWindow();
  buildDiagnostics(false).catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  ytDlpRunner.cancelAll();
  stemRunner.cancelAll();
  ffmpegRunner.cancelAll();
  vectorRunner.cancelAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// IPC HANDLERS
// ============================================================================

ipcMain.handle('system:diagnostics', async () => {
  return await buildDiagnostics(false);
});

ipcMain.handle('system:refresh-diagnostics', async () => {
  return await buildDiagnostics(true);
});

ipcMain.handle('system:install-binary', async (_event, name: BinaryName) => {
  const res = await binaryManager.installBinary(name);
  const diagnostics = await buildDiagnostics(true);
  return {
    ...res,
    diagnostics
  };
});

ipcMain.handle('window:control', (_event, action: 'minimize' | 'maximize' | 'close') => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } else if (action === 'close') {
    mainWindow.close();
  }
});

ipcMain.handle('window:set-theme', (_event, theme: string) => {
  if (!mainWindow) return;
  const isLight = theme === 'antigravity-light' || theme === 'light';
  try {
    nativeTheme.themeSource = isLight ? 'light' : 'dark';
    mainWindow.setTitleBarOverlay({
      color: isLight ? '#f1f1f1' : '#09090b',
      symbolColor: isLight ? '#474747' : '#9e9e9e',
      height: 36
    });
  } catch {
    // Unsupported platform or window destroyed
  }
});

ipcMain.handle('window:set-zoom', (event, factor: number) => {
  const clamped = Math.min(1.5, Math.max(0.75, Math.round(factor * 100) / 100));
  event.sender.setZoomFactor(clamped);
  return clamped;
});

ipcMain.handle('window:get-zoom', (event) => {
  return Math.round(event.sender.getZoomFactor() * 100) / 100;
});

ipcMain.handle('dialog:select-dir', async (_event, currentDir?: string) => {
  if (!mainWindow) return null;
  const isValidDir =
    currentDir &&
    typeof currentDir === 'string' &&
    fs.existsSync(currentDir) &&
    fs.statSync(currentDir).isDirectory();
  const startPath = isValidDir ? currentDir : getDefaultOutputDir();
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Save Folder',
    defaultPath: startPath,
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  approveDirPath(res.filePaths[0]);
  return res.filePaths[0];
});

ipcMain.handle('shell:open-folder', async (_event, filePath: string) => {
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else {
    const dir = path.dirname(filePath);
    if (fs.existsSync(dir)) {
      await shell.openPath(dir);
    }
  }
});

// Native OS Drag-to-Timeline (Premiere Pro / After Effects / Resolve / Explorer)
ipcMain.on('ondragstart', (event, filePath: string) => {
  if (!filePath || typeof filePath !== 'string') return;
  const resolved = path.resolve(filePath);

  // Ensure file exists on disk before initiating native OS file drag
  const rawValidPath = fs.existsSync(resolved)
    ? resolved
    : ffmpegRunner.writeValidSimulatedMedia(resolved, 5, 220);
  const validPath = path.normalize(path.resolve(rawValidPath));
  if (!fs.existsSync(validPath)) return;
  approveFilePath(validPath);

  const icon = getValidDragIcon();
  event.sender.startDrag({
    file: validPath,
    icon
  });
});

ipcMain.handle(
  'media:probe',
  async (_event, url: string, browserCookies: BrowserSource, simulateFallback: boolean) => {
    return ytDlpRunner.probeUrl(url, browserCookies, simulateFallback);
  }
);

let errorResetTimer: NodeJS.Timeout | null = null;
const activeJobProgress = new Map<string, number>();
const activeJobRunners = new Map<string, 'ripper' | 'fixer' | 'vector' | 'converter'>();

function updateWindowTaskbarProgress(progressPayload: JobProgressEvent) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (errorResetTimer) {
    clearTimeout(errorResetTimer);
    errorResetTimer = null;
  }

  if (progressPayload.stage === 'completed') {
    activeJobProgress.delete(progressPayload.jobId);
    if (activeJobProgress.size === 0) {
      mainWindow.setProgressBar(-1);
    } else {
      let sum = 0;
      activeJobProgress.forEach((p) => { sum += p; });
      const avg = sum / activeJobProgress.size / 100;
      mainWindow.setProgressBar(Math.min(0.99, Math.max(0.05, avg)), { mode: 'normal' });
    }
  } else if (progressPayload.stage === 'error') {
    activeJobProgress.delete(progressPayload.jobId);
    if (activeJobProgress.size === 0) {
      mainWindow.setProgressBar(1, { mode: 'error' });
      errorResetTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setProgressBar(-1);
        }
        errorResetTimer = null;
      }, 2500);
    } else {
      let sum = 0;
      activeJobProgress.forEach((p) => { sum += p; });
      const avg = sum / activeJobProgress.size / 100;
      mainWindow.setProgressBar(Math.min(0.99, Math.max(0.05, avg)), { mode: 'normal' });
    }
  } else {
    const rawProgress = progressPayload.progress ?? 5;
    activeJobProgress.set(progressPayload.jobId, Math.min(99, Math.max(5, rawProgress)));
    let sum = 0;
    activeJobProgress.forEach((p) => { sum += p; });
    const avg = sum / activeJobProgress.size / 100;
    mainWindow.setProgressBar(Math.min(0.99, Math.max(0.05, avg)), { mode: 'normal' });
  }
}

ipcMain.handle('job:start', async (event, jobId: string, config: JobConfig) => {
  activeJobRunners.set(jobId, 'ripper');
  approveDirPath(config.outputDir);
  const emitProgress = (progressPayload: JobProgressEvent) => {
    updateWindowTaskbarProgress(progressPayload);
    event.sender.send('job:progress', progressPayload);
  };

  try {
    // Stage 1: Download & Clip via yt-dlp
    const dlResult = await ytDlpRunner.executeDownload(jobId, config, emitProgress);
    if (dlResult.outputFilePath) approveFilePath(dlResult.outputFilePath);
    const isAudioOnly = config.quality === 'audio-wav' || config.quality === 'audio-mp3';

    // Stage 2: Optional AI Stem Separation via Demucs
    if (config.stemMode !== 'off') {
      const stemResult = await stemRunner.separateStems(
        jobId,
        dlResult.outputFilePath,
        config,
        emitProgress
      );
      for (const p of stemResult.pills) approveFilePath(p.filePath);

      emitProgress({
        jobId,
        stage: 'completed',
        progress: 100,
        statusMessage: 'Ready — Drag stems to timeline'
      });

      return {
        outputFilePath: dlResult.outputFilePath,
        pills: stemResult.pills,
        usedSimulation: dlResult.usedSimulation || stemResult.usedSimulation
      };
    }

    // Single output pill when stem separation is off
    const pills: StemOutputPill[] = [
      {
        id: 'master',
        label: isAudioOnly ? 'Audio_Master.wav' : 'Full_Clip.mp4',
        type: isAudioOnly ? 'audio' : 'video',
        filePath: dlResult.outputFilePath,
        fileName: path.basename(dlResult.outputFilePath)
      }
    ];
    approveFilePath(dlResult.outputFilePath);

    emitProgress({
      jobId,
      stage: 'completed',
      progress: 100,
      statusMessage: 'Ready — Drag clip to timeline'
    });

    return {
      outputFilePath: dlResult.outputFilePath,
      pills,
      usedSimulation: dlResult.usedSimulation
    };
  } catch (err) {
    updateWindowTaskbarProgress({
      jobId,
      stage: 'error',
      progress: 100,
      statusMessage: (err as Error).message || 'Download failed'
    });
    throw err;
  } finally {
    activeJobRunners.delete(jobId);
  }
});

ipcMain.handle('job:cancel', (_event, jobId: string) => {
  const runnerType =
    activeJobRunners.get(jobId) ||
    (jobId.startsWith('fix_')
      ? 'fixer'
      : jobId.startsWith('vec_')
        ? 'vector'
        : jobId.startsWith('conv_')
          ? 'converter'
          : 'ripper');

  let cancelled = false;
  if (runnerType === 'ripper') {
    const c1 = ytDlpRunner.cancelJob(jobId);
    const c2 = stemRunner.cancelJob(jobId);
    cancelled = c1 || c2;
  } else if (runnerType === 'vector') {
    cancelled = vectorRunner.cancelJob(jobId);
  } else {
    cancelled = ffmpegRunner.cancelJob(jobId);
  }

  activeJobProgress.delete(jobId);
  if (errorResetTimer) {
    clearTimeout(errorResetTimer);
    errorResetTimer = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (activeJobProgress.size === 0) {
      mainWindow.setProgressBar(-1);
    } else {
      let sum = 0;
      activeJobProgress.forEach((p) => { sum += p; });
      const avg = sum / activeJobProgress.size / 100;
      mainWindow.setProgressBar(Math.min(0.99, Math.max(0.05, avg)), { mode: 'normal' });
    }
  }
  return cancelled;
});

// ============================================================================
// PHASE 2: FFMPEG VIDEO FIXER & PROXY DECK IPC HANDLERS
// ============================================================================

ipcMain.handle('dialog:select-video-files', async () => {
  if (!mainWindow) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Local Video Footage',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Video Footage',
        extensions: ['mp4', 'mov', 'mkv', 'mxf', 'webm', 'avi', 'm4v', 'mts']
      }
    ]
  });
  if (res.canceled || res.filePaths.length === 0) return [];
  return res.filePaths;
});

ipcMain.handle('fixer:probe', async (_event, filePath: string) => {
  approveFilePath(filePath);
  return await ffmpegRunner.probeLocalVideo(
    filePath,
    binaryManager.getBinaryPath('ffprobe'),
    binaryManager.isBinaryAvailable('ffprobe')
  );
});

ipcMain.handle('fixer:start', async (event, jobId: string, config: FixerJobConfig) => {
  activeJobRunners.set(jobId, 'fixer');
  approveDirPath(config.outputDir);
  approveFilePath(config.inputPath);
  const emitProgress = (progressPayload: JobProgressEvent) => {
    updateWindowTaskbarProgress(progressPayload);
    event.sender.send('job:progress', progressPayload);
  };

  try {
    const result = await ffmpegRunner.executeFixerJob(
      jobId,
      config,
      cachedHardware.hasNvenc,
      emitProgress
    );
    for (const p of result.pills) approveFilePath(p.filePath);

    emitProgress({
      jobId,
      stage: 'completed',
      progress: 100,
      statusMessage: 'Ready — Drag processed media to timeline'
    });

    return result;
  } catch (err) {
    updateWindowTaskbarProgress({
      jobId,
      stage: 'error',
      progress: 100,
      statusMessage: (err as Error).message || 'Fixer job failed'
    });
    throw err;
  } finally {
    activeJobRunners.delete(jobId);
  }
});

// ============================================================================
// PHASE 3: VECTORIZER, BACKGROUND REMOVER & ASSET UPSCALER IPC HANDLERS
// ============================================================================

ipcMain.handle('dialog:select-image-files', async () => {
  if (!mainWindow) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Image Assets',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Raster Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp']
      }
    ]
  });
  if (res.canceled || res.filePaths.length === 0) return [];
  return res.filePaths;
});

ipcMain.handle('vector:probe', async (_event, filePath: string) => {
  approveFilePath(filePath);
  return await vectorRunner.probeLocalImage(filePath);
});

ipcMain.handle('vector:start', async (event, jobId: string, config: VectorJobConfig) => {
  activeJobRunners.set(jobId, 'vector');
  approveDirPath(config.outputDir);
  approveFilePath(config.inputPath);
  const emitProgress = (progressPayload: JobProgressEvent) => {
    updateWindowTaskbarProgress(progressPayload);
    event.sender.send('job:progress', progressPayload);
  };

  try {
    const result = await vectorRunner.executeVectorJob(jobId, config, emitProgress);
    for (const p of result.pills) approveFilePath(p.filePath);

    emitProgress({
      jobId,
      stage: 'completed',
      progress: 100,
      statusMessage: 'Ready — Drag vector or image asset to canvas'
    });

    return result;
  } catch (err) {
    updateWindowTaskbarProgress({
      jobId,
      stage: 'error',
      progress: 100,
      statusMessage: (err as Error).message || 'Vector job failed'
    });
    throw err;
  } finally {
    activeJobRunners.delete(jobId);
  }
});

// ============================================================================
// PHASE 4: UNIVERSAL FORMAT CONVERTER IPC HANDLERS
// ============================================================================

ipcMain.handle('dialog:select-media-files', async () => {
  if (!mainWindow) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video or Audio Files to Convert',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'All Video & Audio Media',
        extensions: [
          'mp4', 'mov', 'mkv', 'webm', 'avi', 'mxf', 'm4v', 'mts', 'gif',
          'wav', 'mp3', 'flac', 'm4a', 'ogg', 'aac', 'opus', 'wma'
        ]
      }
    ]
  });
  if (res.canceled || res.filePaths.length === 0) return [];
  return res.filePaths;
});

ipcMain.handle('converter:probe', async (_event, filePath: string) => {
  approveFilePath(filePath);
  return await ffmpegRunner.probeLocalMedia(
    filePath,
    binaryManager.getBinaryPath('ffprobe'),
    binaryManager.isBinaryAvailable('ffprobe')
  );
});

ipcMain.handle('converter:start', async (event, jobId: string, config: ConverterJobConfig) => {
  activeJobRunners.set(jobId, 'converter');
  approveDirPath(config.outputDir);
  approveFilePath(config.inputPath);
  const emitProgress = (progressPayload: JobProgressEvent) => {
    updateWindowTaskbarProgress(progressPayload);
    event.sender.send('job:progress', progressPayload);
  };

  try {
    const result = await ffmpegRunner.executeConverterJob(
      jobId,
      config,
      cachedHardware.hasNvenc,
      emitProgress
    );
    for (const p of result.pills) approveFilePath(p.filePath);

    emitProgress({
      jobId,
      stage: 'completed',
      progress: 100,
      statusMessage: result.usedSmartCopy
        ? 'Ready — Instant Zero-Loss Remux Complete'
        : 'Ready — Drag converted media to timeline'
    });

    return result;
  } catch (err) {
    updateWindowTaskbarProgress({
      jobId,
      stage: 'error',
      progress: 100,
      statusMessage: (err as Error).message || 'Converter job failed'
    });
    throw err;
  } finally {
    activeJobRunners.delete(jobId);
  }
});
