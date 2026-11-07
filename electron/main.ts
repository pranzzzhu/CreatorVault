import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
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
  FixerJobConfig,
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

let cachedHardware = HardwareProbe.probe(binaryManager.getBinaryPath('ffmpeg'));

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

function buildDiagnostics(forceRefresh = false): SystemDiagnostics {
  const binaries = binaryManager.checkAllBinaries(forceRefresh);
  if (forceRefresh) {
    cachedHardware = HardwareProbe.probe(binaries.ffmpeg.resolvedPath);
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

// Embedded 32x32 high-contrast badge PNG data URL used for native OS drag-and-drop cursor icon
const DRAG_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAABNSURBVHgB7dYxDQAACANB9l96F3gQ4J3cT0J2524B2A0gIIAAG0BAAAHeAAICCLABBMR7A0BAAAG2gIAAArwBAgIIsAEEBBDgD3gB+8YHhX198cQAAAAASUVORK5CYII=';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050505',
      symbolColor: '#A1A1AA',
      height: 36
    },
    backgroundColor: '#050505',
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
    const rawPath = decodeURIComponent(
      request.url.replace(/^vortex-media:\/\/local\//i, '').split('?')[0]
    );
    const normalizedPath = path.resolve(rawPath);
    if (!fs.existsSync(normalizedPath)) {
      return new Response('Media file not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(normalizedPath).toString());
  });

  createWindow();

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

ipcMain.handle('system:diagnostics', () => {
  return buildDiagnostics(false);
});

ipcMain.handle('system:refresh-diagnostics', () => {
  return buildDiagnostics(true);
});

ipcMain.handle('system:install-binary', async (_event, name: BinaryName) => {
  const res = await binaryManager.installBinary(name);
  const diagnostics = buildDiagnostics(true);
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

ipcMain.handle('window:set-zoom', (event, factor: number) => {
  const clamped = Math.min(1.5, Math.max(0.75, Math.round(factor * 100) / 100));
  event.sender.setZoomFactor(clamped);
  return clamped;
});

ipcMain.handle('window:get-zoom', (event) => {
  return Math.round(event.sender.getZoomFactor() * 100) / 100;
});

ipcMain.handle('dialog:select-dir', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Vortex Export Directory',
    defaultPath: getDefaultOutputDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || res.filePaths.length === 0) return null;
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
  if (!filePath) return;

  // Ensure file exists on disk before initiating native OS file drag
  const rawValidPath = fs.existsSync(filePath)
    ? filePath
    : ffmpegRunner.writeValidSimulatedMedia(filePath, 5, 220);
  const validPath = path.normalize(path.resolve(rawValidPath));

  const icon = nativeImage.createFromDataURL(DRAG_ICON_DATA_URL);
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

ipcMain.handle('job:start', async (event, jobId: string, config: JobConfig) => {
  const emitProgress = (progressPayload: JobProgressEvent) => {
    event.sender.send('job:progress', progressPayload);
  };

  // Stage 1: Download & Clip via yt-dlp
  const dlResult = await ytDlpRunner.executeDownload(jobId, config, emitProgress);
  const isAudioOnly = config.quality === 'audio-wav' || config.quality === 'audio-mp3';

  // Stage 2: Optional AI Stem Separation via Demucs
  if (config.stemMode !== 'off') {
    const stemResult = await stemRunner.separateStems(
      jobId,
      dlResult.outputFilePath,
      config,
      emitProgress
    );

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
});

ipcMain.handle('job:cancel', (_event, jobId: string) => {
  const c1 = ytDlpRunner.cancelJob(jobId);
  const c2 = stemRunner.cancelJob(jobId);
  const c3 = ffmpegRunner.cancelJob(jobId);
  const c4 = vectorRunner.cancelJob(jobId);
  return c1 || c2 || c3 || c4;
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

ipcMain.handle('fixer:probe', (_event, filePath: string) => {
  return ffmpegRunner.probeLocalVideo(
    filePath,
    binaryManager.getBinaryPath('ffprobe'),
    binaryManager.isBinaryAvailable('ffprobe')
  );
});

ipcMain.handle('fixer:start', async (event, jobId: string, config: FixerJobConfig) => {
  const emitProgress = (progressPayload: JobProgressEvent) => {
    event.sender.send('job:progress', progressPayload);
  };

  const result = await ffmpegRunner.executeFixerJob(
    jobId,
    config,
    cachedHardware.hasNvenc,
    emitProgress
  );

  emitProgress({
    jobId,
    stage: 'completed',
    progress: 100,
    statusMessage: 'Ready — Drag processed media to timeline'
  });

  return result;
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

ipcMain.handle('vector:probe', (_event, filePath: string) => {
  return vectorRunner.probeLocalImage(filePath);
});

ipcMain.handle('vector:start', async (event, jobId: string, config: VectorJobConfig) => {
  const emitProgress = (progressPayload: JobProgressEvent) => {
    event.sender.send('job:progress', progressPayload);
  };

  const result = await vectorRunner.executeVectorJob(jobId, config, emitProgress);

  emitProgress({
    jobId,
    stage: 'completed',
    progress: 100,
    statusMessage: 'Ready — Drag vector or image asset to canvas'
  });

  return result;
});
