import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  BinaryName,
  BrowserSource,
  ConverterJobConfig,
  FixerJobConfig,
  JobConfig,
  JobProgressEvent,
  VectorJobConfig,
  VortexApi
} from '../src/types/media';

const api: VortexApi = {
  getDiagnostics: () => ipcRenderer.invoke('system:diagnostics'),
  refreshDiagnostics: () => ipcRenderer.invoke('system:refresh-diagnostics'),
  installBinary: (name: BinaryName) => ipcRenderer.invoke('system:install-binary', name),
  probeUrl: (url: string, browserCookies: BrowserSource, simulateFallback: boolean) =>
    ipcRenderer.invoke('media:probe', url, browserCookies, simulateFallback),
  startJob: (jobId: string, config: JobConfig) =>
    ipcRenderer.invoke('job:start', jobId, config),
  selectVideoFiles: () => ipcRenderer.invoke('dialog:select-video-files'),
  probeLocalVideo: (filePath: string) => ipcRenderer.invoke('fixer:probe', filePath),
  startFixerJob: (jobId: string, config: FixerJobConfig) =>
    ipcRenderer.invoke('fixer:start', jobId, config),
  selectImageFiles: () => ipcRenderer.invoke('dialog:select-image-files'),
  probeLocalImage: (filePath: string) => ipcRenderer.invoke('vector:probe', filePath),
  startVectorJob: (jobId: string, config: VectorJobConfig) =>
    ipcRenderer.invoke('vector:start', jobId, config),
  selectMediaFiles: () => ipcRenderer.invoke('dialog:select-media-files'),
  probeLocalMedia: (filePath: string) => ipcRenderer.invoke('converter:probe', filePath),
  startConverterJob: (jobId: string, config: ConverterJobConfig) =>
    ipcRenderer.invoke('converter:start', jobId, config),
  getPathForDroppedFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  cancelJob: (jobId: string) => ipcRenderer.invoke('job:cancel', jobId),
  startNativeDrag: (filePath: string) => {
    ipcRenderer.send('ondragstart', filePath);
  },
  openFolder: (filePath: string) => ipcRenderer.invoke('shell:open-folder', filePath),
  selectOutputDirectory: (currentDir?: string) =>
    ipcRenderer.invoke('dialog:select-dir', currentDir),
  windowControl: (action: 'minimize' | 'maximize' | 'close') =>
    ipcRenderer.invoke('window:control', action),
  setTheme: (theme: string) => ipcRenderer.invoke('window:set-theme', theme),
  setZoomFactor: (factor: number) => ipcRenderer.invoke('window:set-zoom', factor),
  getZoomFactor: () => ipcRenderer.invoke('window:get-zoom'),
  onJobProgress: (callback: (data: JobProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: JobProgressEvent) => {
      callback(payload);
    };
    ipcRenderer.on('job:progress', listener);
    return () => {
      ipcRenderer.removeListener('job:progress', listener);
    };
  }
};

contextBridge.exposeInMainWorld('vortexApi', api);
